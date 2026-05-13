import { Visitor, MerittoResponse } from '@/types';

/**
 * Meritto / NPF CRM integration.
 *
 * Endpoints (api.nopaperforms.io):
 *   - POST /lead/v1/getDetailsByMobileNumber   — lookup by mobile
 *   - POST /lead/v1/createOrUpdate             — create or update a lead
 *
 * Auth: both `access-key` and `secret-key` headers on every request.
 *
 * Flow (per current product decision):
 *   - Only "Admission Enquiry - New" visitors are pushed.
 *   - Step 1: lookup by mobile.
 *     - If existing lead found -> SKIP (log locally only, do NOT push).
 *     - Otherwise -> Step 2.
 *   - Step 2: call createOrUpdate (NPF will create since mobile is new).
 *
 * NOTE: NPF's createOrUpdate normally updates existing leads automatically.
 * Our explicit lookup-then-skip is what enforces the "don't touch repeat
 * visitors" policy. If that policy ever changes, just remove the lookup
 * step and createOrUpdate will handle both paths.
 *
 * Dev notes:
 *   - Server-side only (called from /api/meritto route). Keys stay server-side.
 *   - Set MERITTO_DRY_RUN=true to simulate without hitting NPF.
 *   - `ADJUST:` comments mark spots that may still need tweaks once you
 *     see the first real lookup/create response in the logs.
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
 * ADJUST: The keys on the LEFT must match what your Meritto admin panel
 * shows as the "API field name" for each custom field. Configure via
 * env vars MERITTO_FIELD_* — no code change needed if naming differs.
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
 * Look up an existing lead by mobile via getDetailsByMobileNumber.
 * Returns true if a lead exists for this mobile, false otherwise.
 *
 * "Not found" can be signaled by HTTP 4xx, status=error in body, or
 * an empty/missing data object — all three are treated as no lead.
 *
 * ADJUST: Once you see the first real lookup response in the logs,
 * narrow the parsing below to the actual shape.
 */
async function lookupLeadExists(
  cfg: MerittoConfig,
  phone: string,
): Promise<boolean> {
  if (!cfg.lookupUrl) return false;

  try {
    const { ok, data } = await callMeritto(
      cfg.lookupUrl,
      { mobile: normalizePhone(phone) },
      cfg,
      'lookup',
    );
    if (!ok) return false;

    const d = data as {
      status?: string;
      lead_id?: unknown;
      leadId?: unknown;
      data?: unknown;
    };

    const statusStr = (d.status || '').toString().toLowerCase();
    if (statusStr === 'error' || statusStr === 'failed' || statusStr === 'failure') {
      return false;
    }

    if (d.lead_id || d.leadId) return true;

    if (Array.isArray(d.data) && d.data.length > 0) return true;

    if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
      const nested = d.data as Record<string, unknown>;
      if (nested.lead_id || nested.leadId) return true;
      // Some NPF tenants return the lead object directly under `data`;
      // any non-empty object means a lead was found.
      if (Object.keys(nested).length > 0) return true;
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

    // ADJUST: NPF's createOrUpdate typically returns:
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
 * Main entry point.
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
    const exists = await lookupLeadExists(cfg, v.phone);
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