import { Visitor, MerittoResponse } from '@/types';

/**
 * Meritto / NPF CRM integration.
 *
 * Notes for the dev plugging in real credentials:
 * - This module runs server-side only (called from /api/meritto route).
 * - Field names like MERITTO_FIELD_PROGRAM must match the EXACT custom field
 *   keys configured in your Meritto account. Pull them from your admin panel.
 * - The exact request shape (header name for API key, field naming convention)
 *   may differ slightly per tenant. Check Meritto's developer portal docs
 *   sent with your API key for the canonical request shape and adjust
 *   `buildPayload()` / `lookupLead()` accordingly.
 */

interface MerittoConfig {
  apiUrl: string;
  apiKey: string;
  source: string;
  lookupUrl: string;
  updateUrl: string;
  activityUrl: string;
  fieldProgram: string;
  fieldMeetingWith: string;
  fieldNotes: string;
  fieldVisitPurpose: string;
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
    updateUrl: process.env.MERITTO_UPDATE_URL || '',
    activityUrl: process.env.MERITTO_ACTIVITY_URL || '',
    fieldProgram: process.env.MERITTO_FIELD_PROGRAM || 'mx_program',
    fieldMeetingWith: process.env.MERITTO_FIELD_MEETING_WITH || 'mx_meeting_with',
    fieldNotes: process.env.MERITTO_FIELD_NOTES || 'mx_notes',
    fieldVisitPurpose: process.env.MERITTO_FIELD_VISIT_PURPOSE || 'mx_visit_purpose',
  };
}

function buildPayload(v: Visitor, cfg: MerittoConfig): Record<string, string> {
  // Standard Meritto required fields + custom field mapping
  return {
    name: v.name,
    email: v.email,
    mobile: v.phone.replace(/[^\d+]/g, ''),
    source: cfg.source,
    [cfg.fieldProgram]: v.program || '',
    [cfg.fieldMeetingWith]: v.meetWith || '',
    [cfg.fieldNotes]: v.notes || '',
    [cfg.fieldVisitPurpose]: v.purpose,
  };
}

/**
 * Look up an existing lead by phone (preferred) or email.
 * Returns the lead ID if found, null otherwise.
 *
 * IMPORTANT: Meritto's actual lookup response shape varies by tenant.
 * Adjust the parsing logic below once you see a real response.
 */
async function lookupLead(
  cfg: MerittoConfig,
  phone: string,
  email: string,
): Promise<string | null> {
  if (!cfg.lookupUrl) return null;
  try {
    const res = await fetch(cfg.lookupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-key': cfg.apiKey,
      },
      body: JSON.stringify({ mobile: phone.replace(/[^\d+]/g, ''), email }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Common shapes: { lead_id }, { data: { lead_id } }, { leadId }
    return data?.lead_id || data?.leadId || data?.data?.lead_id || null;
  } catch (err) {
    console.warn('Meritto lookup failed:', err);
    return null;
  }
}

async function createLead(
  cfg: MerittoConfig,
  v: Visitor,
): Promise<MerittoResponse> {
  const payload = buildPayload(v, cfg);
  const res = await fetch(cfg.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access-key': cfg.apiKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status === 'error') {
    return {
      status: 'failed',
      error: data?.message || `HTTP ${res.status}`,
    };
  }
  return {
    status: 'created',
    leadId: data?.lead_id || data?.leadId || data?.data?.lead_id,
    message: 'Lead created in Meritto',
  };
}

async function updateLead(
  cfg: MerittoConfig,
  leadId: string,
  v: Visitor,
): Promise<MerittoResponse> {
  if (!cfg.updateUrl) {
    return { status: 'failed', error: 'Update URL not configured' };
  }
  const payload = { ...buildPayload(v, cfg), lead_id: leadId };
  const res = await fetch(cfg.updateUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access-key': cfg.apiKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { status: 'failed', error: data?.message || `HTTP ${res.status}` };
  }
  // Best-effort: add visit activity if endpoint is configured
  if (cfg.activityUrl) {
    await fetch(cfg.activityUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access-key': cfg.apiKey },
      body: JSON.stringify({
        lead_id: leadId,
        activity: `Walk-in visit on ${v.date} ${v.time} — ${v.purpose}${v.meetWith ? ` (met ${v.meetWith})` : ''}`,
      }),
    }).catch(() => {});
  }
  return { status: 'updated', leadId, message: 'Lead updated in Meritto' };
}

/**
 * Main entry point. Only "Admission Enquiry - New" is pushed to Meritto/NPF CRM.
 * All other purposes (HR, Re Visit, VC Office, Academics) are skipped.
 */
export async function pushToMeritto(v: Visitor): Promise<MerittoResponse> {
  if (v.purpose !== 'Admission Enquiry - New') {
    return { status: 'skipped', message: `Purpose "${v.purpose}" — not pushed to CRM` };
  }

  const cfg = getConfig();
  if (!cfg) {
    return {
      status: 'skipped',
      message: 'Meritto not configured (set MERITTO_* env vars)',
    };
  }

  try {
    const existingId = await lookupLead(cfg, v.phone, v.email);
    if (existingId) {
      return await updateLead(cfg, existingId, v);
    }
    return await createLead(cfg, v);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'failed', error: message };
  }
}
