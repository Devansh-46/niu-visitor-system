import { Visitor, MerittoResponse } from '@/types';

/**
 * Meritto / NPF CRM integration.
 *
 * Auth model: NPF requires TWO headers on every request:
 *   - `access-key`  (identifies your tenant)
 *   - `secret-key`  (proves it's you)
 * Both come from your Meritto account. Set them in env as
 * MERITTO_ACCESS_KEY and MERITTO_SECRET_KEY.
 *
 * Scope (per current product decision):
 *   - Only "Admission Enquiry - New" visitors are pushed.
 *   - Flow: lookup by phone/email -> if found, SKIP (log locally only).
 *                                  -> if not found, CREATE new lead.
 *   - No update, no activity push.
 *
 * Dev notes:
 *   - This module runs server-side only (called from /api/meritto route).
 *     The keys never leave the server.
 *   - Set MERITTO_DRY_RUN=true to simulate without hitting NPF.
 *   - Search for `ADJUST:` comments — those are the spots most likely
 *     to need tweaks once you see a real NPF response in the logs.
 */

interface MerittoConfig {
  apiUrl: string;
  accessKey: string;
  secretKey: string;
  source: string;
  lookupUrl: string;
  fieldProgram: string;
  fieldMeetingWith: string;
  fieldNotes: string;
  fieldVisitPurpose: string;
  dryRun: boolean;
}

function getConfig(): MerittoConfig | null {
  const apiUrl = process.env.MERITTO_API_URL;
  const accessKey = process.env.MERITTO_ACCESS_KEY;
  const secretKey = process.env.MERITTO_SECRET_KEY;
  const source = process.env.MERITTO_SOURCE_NAME;
  if (!apiUrl || !accessKey || !secretKey || !source) return null;
  return {
    apiUrl,
    accessKey,
    secretKey,
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
 *   "+91 98765 43210"  -> "9876543210"
 *   "919876543210"     -> "9876543210"
 *   "09876543210"      -> "9876543210"
 *   "9876543210"       -> "9876543210"
 * Anything else returned as-is so NPF can reject (we want to see it).
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
  return digits;
}

/**
 * ADJUST: Field naming. The keys on the LEFT must match what your Meritto
 * admin panel shows as the "API field name" for each custom field.
 * Common conventions: mx_* (Meritto), cf_*, custom_*.
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
 * Redact both keys from a string before logging.
 */
function redact(s: string, cfg: MerittoConfig): string {
  let out = s;
  if (cfg.accessKey) out = out.split(cfg.accessKey).join('***ACCESS***');
  if (cfg.secretKey) out = out.split(cfg.secretKey).join('***SECRET***');
  return out;
}

/**
 * Single HTTP call with retry on 5xx (max 2 attempts).
 * Logs request + response with keys redacted.
 */
async function callMeritto(
  url: string,
  body: Record<string, unknown>,
  cfg: MerittoConfig,
  label: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const payloadStr = JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'access-key': cfg.accessKey,
    'secret-key': cfg.secretKey,
  };

  const maxAttempts = 2;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[meritto:${label}] attempt ${attempt} POST ${url}`);
      console.log(`[meritto:${label}] payload: ${redact(payloadStr, cfg)}`);

      const res = await fetch(url, { method: 'POST', headers, body: payloadStr });
      const text = await res.text();
      console.log(`[meritto:${label}] response ${res.status}: ${redact(text, cfg)}`);

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
 * Look up an existing lead by phone/email. Returns true if found.
 * If MERITTO_LOOKUP_URL is blank, returns false (skip lookup entirely
 * — NPF's own server-side dedup will then handle duplicates on create).
 *
 * ADJUST: Response parsing — once you see a real response, narrow this
 * to the actual shape.
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
      cfg,
      'lookup',
    );
    if (!ok) return false;

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
    const { ok, status, data } = await callMeritto(cfg.apiUrl, payload, cfg, 'create');

    // ADJUST: NPF typically returns:
    //   { status: "Success", message: "...", data: { lead_id: "..." } }
    //   { status: "error",   message: "..." }
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

    // Detect duplicate-on-create separately — surface as "duplicate"
    // (amber pill), not "failed" (red), so operator isn't alarmed.
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
 * If MERITTO_DRY_RUN=true, no real HTTP calls are made.
 */
export async function pushToMeritto(v: Visitor): Promise<MerittoResponse> {
  // Diagnostic log BEFORE any early-exit branches.
  // Booleans only — no secret values are logged.
  console.log('[meritto] entry', {
    visitorId: v.id,
    purpose: v.purpose,
    hasApiUrl: !!process.env.MERITTO_API_URL,
    hasAccessKey: !!process.env.MERITTO_ACCESS_KEY,
    hasSecretKey: !!process.env.MERITTO_SECRET_KEY,
    hasSource: !!process.env.MERITTO_SOURCE_NAME,
    hasLookupUrl: !!process.env.MERITTO_LOOKUP_URL,
    dryRun: process.env.MERITTO_DRY_RUN === 'true',
  });

  if (v.purpose !== 'Admission Enquiry - New') {
    console.log(`[meritto] skipped — purpose "${v.purpose}" not eligible`);
    return { status: 'skipped', message: `Purpose "${v.purpose}" — not pushed to CRM` };
  }

  const cfg = getConfig();
  if (!cfg) {
    console.warn('[meritto] skipped — required env vars missing');
    return {
      status: 'skipped',
      message: 'Meritto not configured (set MERITTO_API_URL, MERITTO_ACCESS_KEY, MERITTO_SECRET_KEY, MERITTO_SOURCE_NAME)',
    };
  }

  if (cfg.dryRun) {
    console.log('[meritto] DRY RUN — no real API call. Would send:', {
      id: v.id,
      name: v.name,
      phone: normalizePhone(v.phone),
      email: v.email,
    });
    return {
      status: 'skipped',
      message: 'DRY RUN — would have looked up + created lead',
    };
  }

  try {
    const exists = await lookupLeadExists(cfg, v.phone, v.email);
    if (exists) {
      console.log(`[meritto] existing lead found for ${normalizePhone(v.phone)} — skipping per policy`);
      return {
        status: 'skipped',
        message: 'Existing lead found — skipped per policy',
      };
    }
    return await createLead(cfg, v);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[meritto] unexpected error:', err);
    return { status: 'failed', error: message };
  }
}