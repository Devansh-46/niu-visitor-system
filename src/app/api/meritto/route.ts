import { NextRequest, NextResponse } from 'next/server';
import { pushToMeritto } from '@/lib/meritto';
import { Visitor } from '@/types';

export const runtime = 'nodejs';
// Run the function in Mumbai region — same as where most of your visitors
// and the NPF API are. Cuts ~300-500ms off every call vs the US East default.
export const preferredRegion = 'bom1';

export async function POST(req: NextRequest) {
  try {
    const visitor = (await req.json()) as Visitor;
    if (!visitor?.id || !visitor?.name) {
      return NextResponse.json({ status: 'failed', error: 'Invalid payload' }, { status: 400 });
    }
    const result = await pushToMeritto(visitor);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ status: 'failed', error: message }, { status: 500 });
  }
}