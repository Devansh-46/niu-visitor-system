import { Visitor, MerittoResponse } from '@/types';

/**
 * Meritto / NPF CRM integration.
 *
 * Endpoints (api.nopaperforms.io):
 *   - POST /lead/v1/getDetailsByMobileNumber   — lookup by mobile
 *   - POST /lead/v1/createOrUpdate             — create or update a lead
 *
 * Auth: NPF tenants vary in how they accept credentials. To avoid getting
 * stuck on a guessing game (lowercase vs PascalCase headers, headers vs
 * body, `api-key` vs `access-key`...), this module PROBES four common
 * auth conventions on the first call of each request. Whichever one gets
 * past 401 is then reused for the rest of the request.
 *
 * The four conventions tried, in order:
 *   1. headers `access-key` + `secret-key` (lowercase)
 *   2. headers `Access-Key` + `Secret-Key` (PascalCase)
 *   3. headers `Authorization: Bearer <secret>` + `access-key`
 *   4. body fields `access_key` + `secret_key`
 *
 * Flow (per current product decision):
 *   - Only "Admission Enquiry - New" visitors are pushed.
 *   - Lookup by mobile -> if found, SKIP. Otherwise -> createOrUpdate.
 */

type AuthScheme = 'lower-headers' | 'pascal-headers' | 'bearer' | 'body';

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

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
  return digits;
}

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
 * Build the headers + body combo for a given auth scheme.
 */
function applyAuth(
  scheme: AuthScheme,
  cfg: MerittoConfig,
  body: Record<string, unknown>,
): { headers: Record<string, string>; body: Record<string, unknown> } {
  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  switch (scheme) {
    case 'lower-headers':
      return {
        headers: { ...baseHeaders, 'access-key': cfg.accessKey, 'secret-key': cfg.secretKey },
        body,
      };
    case 'pascal-headers':
      return {
        headers: { ...baseHeaders, 'Access-Key': cfg.accessKey, 'Secret-Key': cfg.secretKey },
        body,
      };
    case 'bearer':
      return {
        headers: {
          ...baseHeaders,
          'Authorization': `Bearer ${cfg.secretKey}`,
          'access-key': cfg.accessKey,
        },
        body,
      };
    case 'body':
      return {
        headers: baseHeaders,
        body: { ...body, access_key: cfg.accessKey, secret_key: cfg.secretKey },
      };
  }
}

/**
 * Single HTTP call with a specific auth scheme. No retry — the caller
 * (probeAuth or the direct call) decides what to do with 401s.
 * Logs request + response with keys redacted.
 */
async function callOnce(
  url: string,
  body: Record<string, unknown>,
  cfg: MerittoConfig,
  scheme: AuthScheme,
  label: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; rawText: string }> {
  const { headers, body: finalBody } = applyAuth(scheme, cfg, body);
  const payloadStr = JSON.stringify(finalBody);

  console.log(`[meritto:${label}] POST ${url} (auth=${scheme})`);
  console.log(`[meritto:${label}] payload: ${redact(payloadStr, cfg)}`);

  const res = await fetch(url, { method: 'POST', headers, body: payloadStr });
  const text = await res.text();
  console.log(`[meritto:${label}] response ${res.status} (auth=${scheme}): ${redact(text, cfg)}`);

  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* keep empty */ }
  return { ok: res.ok, status: res.status, data, rawText: text };
}

/**
 * Probe auth schemes against the lookup endpoint. Returns the first
 * scheme that doesn't get a 401, along with the data from that call
 * (so we don't waste it). Returns null if all 4 fail with 401.
 */
async function probeAuth(
  cfg: MerittoConfig,
  body: Record<string, unknown>,
): Promise<{ scheme: AuthScheme; result: { ok: boolean; status: number; data: Record<string, unknown> } } | null> {
  const schemes: AuthScheme[] = ['lower-headers', 'pascal-headers', 'bearer', 'body'];
  for (const scheme of schemes) {
    try {
      const result = await callOnce(cfg.lookupUrl, body, cfg, scheme, 'lookup');
      if (result.status !== 401) {
        console.log(`[meritto] auth scheme "${scheme}" accepted (status ${result.status})`);
        return { scheme, result };
      }
      console.log(`[meritto] auth scheme "${scheme}" rejected with 401, trying next`);
    } catch (err) {
      console.warn(`[meritto] auth scheme "${scheme}" threw:`, err);
    }
  }
  return null;
}

/**
 * Parse a lookup response to determine if a lead already exists.
 */
function lookupResponseHasLead(data: Record<string, unknown>): boolean {
  const d = data as {
    status?: string | boolean;
    lead_id?: unknown;
    leadId?: unknown;
    data?: unknown;
  };

  // Explicit failure status
  if (d.status === false) return false;
  const statusStr = (typeof d.status === 'string' ? d.status : '').toLowerCase();
  if (statusStr === 'error' || statusStr === 'failed' || statusStr === 'failure') return false;

  if (d.lead_id || d.leadId) return true;
  if (Array.isArray(d.data) && d.data.length > 0) return true;
  if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
    const nested = d.data as Record<string, unknown>;
    if (nested.lead_id || nested.leadId) return true;
    if (Object.keys(nested).length > 0) return true;
  }
  return false;
}

/**
 * Main entry point.
 */
export async function pushToMeritto(v: Visitor): Promise<MerittoResponse> {
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
    console.log('[meritto] DRY RUN — no real API call.');
    return { status: 'skipped', message: 'DRY RUN' };
  }

  if (!cfg.lookupUrl) {
    return {
      status: 'failed',
      error: 'MERITTO_LOOKUP_URL not configured — required for auth probing',
    };
  }

  try {
    // Step 1: probe auth schemes via lookup
    const probe = await probeAuth(cfg, { mobile: normalizePhone(v.phone) });
    if (!probe) {
      console.error('[meritto] ALL auth schemes returned 401. Check that access/secret keys are correct and that your tenant is active.');
      return {
        status: 'failed',
        error: 'Auth failed (all schemes returned 401). Verify keys in Vercel env vars.',
      };
    }

    // Step 2: interpret lookup result
    if (probe.result.ok && lookupResponseHasLead(probe.result.data)) {
      console.log(`[meritto] existing lead found for ${normalizePhone(v.phone)} — skipping per policy`);
      return {
        status: 'skipped',
        message: 'Existing lead found — skipped per policy',
      };
    }

    // Step 3: createOrUpdate with the scheme that worked
    const createResult = await callOnce(
      cfg.apiUrl,
      buildCreatePayload(v, cfg),
      cfg,
      probe.scheme,
      'create',
    );

    const cd = createResult.data as {
      status?: string | boolean;
      message?: string;
      error?: string;
      lead_id?: string;
      leadId?: string;
      data?: { lead_id?: string; leadId?: string };
    };

    const statusStr = (typeof cd.status === 'string' ? cd.status : '').toLowerCase();
    const isErrorStatus =
      cd.status === false ||
      statusStr === 'error' ||
      statusStr === 'failed' ||
      statusStr === 'failure';
    const errMessage = cd.error || cd.message;

    const looksDuplicate =
      isErrorStatus &&
      typeof errMessage === 'string' &&
      /duplicate|already\s*exist|exists/i.test(errMessage);

    if (looksDuplicate) {
      return { status: 'duplicate', message: errMessage };
    }

    if (!createResult.ok || isErrorStatus) {
      return {
        status: 'failed',
        error: errMessage || `HTTP ${createResult.status}`,
      };
    }

    const leadId = cd.lead_id || cd.leadId || cd.data?.lead_id || cd.data?.leadId;
    return {
      status: 'created',
      leadId,
      message: 'Lead created in Meritto',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[meritto] unexpected error:', err);
    return { status: 'failed', error: message };
  }
}