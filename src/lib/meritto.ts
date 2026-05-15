import { Visitor, MerittoResponse } from '@/types';

/**
 * Meritto / NPF CRM integration.
 *
 * Endpoint: POST /lead/v1/createOrUpdate
 *
 * Auth headers: `secret-key` + `access-key` (lowercase, hyphenated)
 * Body includes `search_criteria` for deduplication (e.g. "email").
 *
 * Flow: Every visitor is pushed to Meritto via createOrUpdate.
 * The API handles deduplication — if the lead exists it updates, otherwise creates.
 */

interface MerittoConfig {
  apiUrl: string;
  accessKey: string;
  secretKey: string;
  source: string;
  searchCriteria: string;
  dryRun: boolean;
}

function getConfig(): MerittoConfig | null {
  const apiUrl = process.env.MERITTO_API_URL?.trim();
  const accessKey = process.env.MERITTO_ACCESS_KEY?.trim();
  const secretKey = process.env.MERITTO_SECRET_KEY?.trim();
  const source = process.env.MERITTO_SOURCE_NAME?.trim();
  if (!apiUrl || !accessKey || !secretKey || !source) return null;
  return {
    apiUrl,
    accessKey,
    secretKey,
    source,
    searchCriteria: process.env.MERITTO_SEARCH_CRITERIA || 'email',
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

function buildPayload(v: Visitor, cfg: MerittoConfig): Record<string, string> {
  return {
    name: v.name,
    email: v.email,
    mobile: normalizePhone(v.phone),
    source: cfg.source,
    search_criteria: cfg.searchCriteria,
  };
}

function redact(s: string, cfg: MerittoConfig): string {
  let out = s;
  if (cfg.accessKey) out = out.split(cfg.accessKey).join('***ACCESS***');
  if (cfg.secretKey) out = out.split(cfg.secretKey).join('***SECRET***');
  return out;
}

/**
 * Main entry point — pushes every visitor to Meritto createOrUpdate.
 * No purpose filtering, no separate lookup. The API handles deduplication.
 */
export async function pushToMeritto(v: Visitor): Promise<MerittoResponse> {
  console.log('[meritto] entry', {
    visitorId: v.id,
    purpose: v.purpose,
    hasApiUrl: !!process.env.MERITTO_API_URL,
    hasAccessKey: !!process.env.MERITTO_ACCESS_KEY,
    hasSecretKey: !!process.env.MERITTO_SECRET_KEY,
    hasSource: !!process.env.MERITTO_SOURCE_NAME,
    dryRun: process.env.MERITTO_DRY_RUN === 'true',
  });

  const cfg = getConfig();
  if (!cfg) {
    console.warn('[meritto] failed — required env vars missing');
    return {
      status: 'failed',
      error: 'Meritto not configured (set MERITTO_API_URL, MERITTO_ACCESS_KEY, MERITTO_SECRET_KEY, MERITTO_SOURCE_NAME)',
    };
  }

  if (cfg.dryRun) {
    console.log('[meritto] DRY RUN — no real API call.');
    return { status: 'created', message: 'DRY RUN — no API call made' };
  }

  try {
    const payload = buildPayload(v, cfg);
    const payloadStr = JSON.stringify(payload);

    // Auth headers: access-key and secret-key (lowercase, hyphenated)
    const headers: Record<string, string> = {
      'secret-key': cfg.secretKey,
      'access-key': cfg.accessKey,
      'Content-Type': 'application/json',
    };

    console.log(`[meritto] POST ${cfg.apiUrl}`);
    console.log(`[meritto] headers: access-key=${cfg.accessKey.slice(0, 6)}***, secret-key=${cfg.secretKey.slice(0, 6)}***`);
    console.log(`[meritto] payload: ${redact(payloadStr, cfg)}`);

    const fetchOptions: RequestInit = {
      method: 'POST',
      headers,
      body: payloadStr,
      redirect: 'follow',
      cache: 'no-store',
    };



    const res = await fetch(cfg.apiUrl, fetchOptions);

    const text = await res.text();
    console.log(`[meritto] response ${res.status}: ${redact(text, cfg)}`);

    let data: Record<string, unknown> = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* keep empty */ }

    const cd = data as {
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

    if (!res.ok || isErrorStatus) {
      return {
        status: 'failed',
        error: errMessage || `HTTP ${res.status}`,
      };
    }

    const leadId = cd.lead_id || cd.leadId || cd.data?.lead_id || cd.data?.leadId;

    // Determine if it was a create or update based on API response
    const isUpdate = typeof errMessage === 'string' &&
      /updated|already|existing/i.test(errMessage);

    return {
      status: isUpdate ? 'updated' : 'created',
      leadId,
      message: isUpdate ? 'Lead updated in Meritto' : 'Lead created in Meritto',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[meritto] unexpected error:', err);
    return { status: 'failed', error: message };
  }
}