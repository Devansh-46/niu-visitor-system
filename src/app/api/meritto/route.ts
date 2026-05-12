import { NextRequest, NextResponse } from 'next/server';
import { pushToMeritto } from '@/lib/meritto';
import { Visitor } from '@/types';

export const runtime = 'nodejs';

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
