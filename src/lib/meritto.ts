import { Visitor, MerittoResponse } from '@/types';

/**
 * Meritto / NPF CRM integration.
 *
 * Scope (per current product decision):
 *   - Only "Admission Enquiry - New" visitors are considered.
 *   - Flow: lookup by phone/email -> if found, SKIP (log locally only).
 *                                  -> if not found, CREATE new lead.
 *   - No update, no activity push.
 *
 * Notes for the dev plugging in real credentials:
 *   - This module runs server-side only (called from /api/meritto route).
 *     The API key never leaves the server.
 *   - Set MERITTO_DRY_RUN=true in env to simulate calls without hitting NPF.
 *     The route will return a "would_create" / "would_skip" status so you can
 *     verify the full pipeline (kiosk -> Next API -> meritto.ts) before going live.
 *   - The exact request shape (auth header name, field naming convention,
 *     response envelope) may differ per tenant. Search this file for
 *     `ADJUST:` comments — those are the spots most likely to need tweaks
 *     once you see a real request/response in the logs.
 */

interface MerittoConfig {
  apiUrl: string;
  apiKey: string;
  source: string;
  lookupUrl: string; // optional — if blank, lookup is skipped
  fieldProgram: string;
  fieldMeetingWith: string;
  fieldNotes: string;
  fieldVisitPurpose: string;
  dryRun: boolean;
}

function getConfig(): MerittoConfig | null {
  const apiUrl = process.env.MERITTO_API_URL;
  const apiKey = process.env.MERITTO_API_KEY;
  const source = process.env.MERITTO_SOURCE_NAME;
  if (!apiUrl || !apiKey || !source) return null;
  return {
    apiUrl,
    apiKey,
    source,
    lookupUrl: process.env.MERITTO_LOOKUP_URL || '',
    fieldProgram: process.env.MERITTO_FIELD_PROGRAM || 'mx_program',
    fieldMeetingWith: process.env.MERITTO_FIELD_MEETING_WITH || 'mx_meeting_with',
    fieldNotes: process.env.MERITTO_FIELD_NOTES || 'mx_notes',
    fieldVisitPurpose: process.env.MERITTO_FIELD_VISIT_PURPOSE || 'mx_visit_purpose',
    dryRun: process.env.MERITTO_DRY_RUN === 'true',
  };
}

/**
 * Normalize Indian mobile numbers to bare 10 digits.
 * Handles inputs like:
 *   "+91 98765 43210"  -> "9876543210"
 *   "919876543210"     -> "9876543210"
 *   "09876543210"      -> "9876543210"
 *   "9876543210"       -> "9876543210"
 * Anything that can't be normalized to 10 digits is returned as-is
 * so NPF can reject it (we want to see those errors, not silently drop).
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, ''); // strip everything non-numeric, including +
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
  return digits; // fallback — let NPF validate
}

/**
 * ADJUST: Field naming. The keys on the LEFT must match what your Meritto
 * admin panel shows as the "API field name" for each custom field. Common
 * conventions: `mx_*` (Meritto), `cf_*`, `custom_*`. Pull the real keys
 * from your tenant and put them in .env via MERITTO_FIELD_* vars.
 */
function buildCreatePayload(v: Visitor, cfg: MerittoConfig): Record<string, string> {
  return {
    name: v.name,
    email: v.email,
    mobile: normalizePhone(v.phone),
    source: cfg.source,
    [cfg.fieldProgram]: v.program || '',
    [cfg.fieldMeetingWith]: v.meetWith || '',
    [cfg.fieldNotes]: v.notes || '',
    [cfg.fieldVisitPurpose]: v.purpose,
  };
}

/**
 * Redact secrets from a string before logging.
 */
function redact(s: string, apiKey: string): string {
  if (!apiKey) return s;
  return s.split(apiKey).join('***REDACTED***');
}

/**
 * Single HTTP call with retry on 5xx (max 2 attempts).
 * Logs request + response with API key redacted.
 *
 * ADJUST: The auth header name. We're sending `api-key` based on NPF's
 * common public convention. If your tenant uses something different
 * (e.g. `access-key`, `Authorization: Bearer ...`, or key in body), change
 * the headers block below.
 */
async function callMeritto(
  url: string,
  body: Record<string, unknown>,
  apiKey: string,
  label: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const payloadStr = JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'api-key': apiKey, // ADJUST if NPF docs say otherwise
  };

  const maxAttempts = 2;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[meritto:${label}] attempt ${attempt} POST ${url}`);
      console.log(`[meritto:${label}] payload: ${redact(payloadStr, apiKey)}`);

      const res = await fetch(url, { method: 'POST', headers, body: payloadStr });
      const text = await res.text();
      console.log(`[meritto:${label}] response ${res.status}: ${redact(text, apiKey)}`);

      let data: Record<string, unknown> = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* keep empty */ }

      // Retry only on 5xx
      if (res.status >= 500 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      lastErr = err;
      console.warn(`[meritto:${label}] network error attempt ${attempt}:`, err);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Meritto network error');
}

/**
 * Look up an existing lead by phone (preferred) or email.
 * Returns true if a lead already exists, false otherwise.
 *
 * If MERITTO_LOOKUP_URL is not configured, returns false (no lookup attempted,
 * we'll fall through to create — NPF's own dedup will catch duplicates).
 *
 * ADJUST: Response parsing. We treat ANY of these as "found":
 *   - data.data is a non-empty array
 *   - data.data.lead_id exists
 *   - data.lead_id exists
 *   - data.found === true
 *   - data.total > 0
 * Once you see a real response, narrow this to the actual shape.
 */
async function lookupLeadExists(
  cfg: MerittoConfig,
  phone: string,
  email: string,
): Promise<boolean> {
  if (!cfg.lookupUrl) return false;

  try {
    const { ok, data } = await callMeritto(
      cfg.lookupUrl,
      { mobile: normalizePhone(phone), email },
      cfg.apiKey,
      'lookup',
    );
    if (!ok) return false;

    // Defensive parsing — try multiple common shapes
    const d = data as {
      lead_id?: unknown;
      leadId?: unknown;
      found?: unknown;
      total?: unknown;
      data?: unknown;
    };
    if (d.lead_id || d.leadId) return true;
    if (d.found === true) return true;
    if (typeof d.total === 'number' && d.total > 0) return true;
    if (Array.isArray(d.data) && d.data.length > 0) return true;
    if (d.data && typeof d.data === 'object') {
      const nested = d.data as { lead_id?: unknown; leadId?: unknown };
      if (nested.lead_id || nested.leadId) return true;
    }
    return false;
  } catch (err) {
    // If lookup throws after retries, log and treat as "not found" so we
    // attempt the create. NPF will reject duplicates server-side.
    console.warn('[meritto:lookup] failed after retries, falling through to create:', err);
    return false;
  }
}

async function createLead(
  cfg: MerittoConfig,
  v: Visitor,
): Promise<MerittoResponse> {
  const payload = buildCreatePayload(v, cfg);

  try {
    const { ok, status, data } = await callMeritto(cfg.apiUrl, payload, cfg.apiKey, 'create');

    // ADJUST: Success detection. NPF typically returns either:
    //   { status: "Success", message: "...", data: { lead_id: "..." } }   (capital S)
    //   { status: "error", message: "..." }
    // We accept any of: ok=true AND no explicit error indicator.
    const d = data as {
      status?: string;
      message?: string;
      error?: string;
      lead_id?: string;
      leadId?: string;
      data?: { lead_id?: string; leadId?: string };
    };

    const statusStr = (d.status || '').toString().toLowerCase();
    const isErrorStatus = statusStr === 'error' || statusStr === 'failed' || statusStr === 'failure';
    const errMessage = d.error || d.message;

    // Detect duplicate-on-create separately (we want to surface this as
    // "duplicate", not "failed", so the operator sees a neutral pill).
    const looksDuplicate =
      isErrorStatus &&
      typeof errMessage === 'string' &&
      /duplicate|already\s*exist|exists/i.test(errMessage);

    if (looksDuplicate) {
      return { status: 'duplicate', message: errMessage };
    }

    if (!ok || isErrorStatus) {
      return {
        status: 'failed',
        error: errMessage || `HTTP ${status}`,
      };
    }

    const leadId = d.lead_id || d.leadId || d.data?.lead_id || d.data?.leadId;
    return {
      status: 'created',
      leadId,
      message: 'Lead created in Meritto',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'failed', error: message };
  }
}

/**
 * Main entry point. Only "Admission Enquiry - New" is pushed to Meritto.
 * All other purposes (HR, Re Visit, VC Office, Academics) are skipped.
 *
 * For new-enquiry visitors:
 *   1. Try lookup. If existing -> skip (log locally only).
 *   2. Otherwise -> create new lead.
 *
 * If MERITTO_DRY_RUN=true, no real HTTP calls are made; the function
 * returns what it WOULD have done so you can verify the pipeline.
 */
export async function pushToMeritto(v: Visitor): Promise<MerittoResponse> {
  if (v.purpose !== 'Admission Enquiry - New') {
    return { status: 'skipped', message: `Purpose "${v.purpose}" — not pushed to CRM` };
  }

  const cfg = getConfig();
  if (!cfg) {
    return {
      status: 'skipped',
      message: 'Meritto not configured (set MERITTO_API_URL, MERITTO_API_KEY, MERITTO_SOURCE_NAME)',
    };
  }

  if (cfg.dryRun) {
    console.log('[meritto] DRY RUN — no real API call. Visitor:', {
      id: v.id, name: v.name, phone: normalizePhone(v.phone), email: v.email,
    });
    return {
      status: 'skipped',
      message: 'DRY RUN — would have looked up + created lead',
    };
  }

  try {
    const exists = await lookupLeadExists(cfg, v.phone, v.email);
    if (exists) {
      console.log(`[meritto] existing lead found for ${normalizePhone(v.phone)} — skipping`);
      return {
        status: 'skipped',
        message: 'Existing lead found — skipped per policy',
      };
    }
    return await createLead(cfg, v);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'failed', error: message };
  }
}