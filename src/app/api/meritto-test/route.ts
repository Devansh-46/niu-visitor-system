import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Debug endpoint: makes the exact same Meritto API call and returns full details.
 * Access via GET /api/meritto-test
 * DELETE THIS FILE after debugging is complete.
 */
export async function GET() {
  const accessKey = process.env.MERITTO_ACCESS_KEY?.trim();
  const secretKey = process.env.MERITTO_SECRET_KEY?.trim();
  const apiUrl = process.env.MERITTO_API_URL?.trim();
  const source = process.env.MERITTO_SOURCE_NAME?.trim();
  const searchCriteria = process.env.MERITTO_SEARCH_CRITERIA?.trim() || 'mobile';

  // Show what we have (partially redacted)
  const debug: Record<string, unknown> = {
    envCheck: {
      apiUrl,
      source,
      searchCriteria,
      accessKeyLength: accessKey?.length,
      secretKeyLength: secretKey?.length,
      accessKeyFirst6: accessKey?.slice(0, 6),
      secretKeyFirst6: secretKey?.slice(0, 6),
      accessKeyLast4: accessKey?.slice(-4),
      secretKeyLast4: secretKey?.slice(-4),
    },
  };

  if (!accessKey || !secretKey || !apiUrl || !source) {
    return NextResponse.json({ ...debug, error: 'Missing env vars' }, { status: 500 });
  }

  const body = JSON.stringify({
    name: 'Debug Test',
    email: 'debug.test@example.com',
    mobile: '9999999998',
    source,
    search_criteria: searchCriteria,
  });

  const headers: Record<string, string> = {
    'secret-key': secretKey,
    'access-key': accessKey,
    'Content-Type': 'application/json',
  };

  debug.outgoingHeaders = {
    'secret-key': secretKey.slice(0, 6) + '***' + secretKey.slice(-4),
    'access-key': accessKey.slice(0, 6) + '***' + accessKey.slice(-4),
    'Content-Type': 'application/json',
  };
  debug.outgoingBody = body;

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body,
      redirect: 'follow',
      cache: 'no-store',
    });

    const text = await res.text();
    debug.response = {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: text,
    };

    return NextResponse.json(debug);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    debug.fetchError = message;
    return NextResponse.json(debug, { status: 500 });
  }
}
