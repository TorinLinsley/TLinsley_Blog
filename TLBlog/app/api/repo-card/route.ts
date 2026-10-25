import { NextResponse } from 'next/server';
import { loadRepoCard } from '../../../lib/repoCardServer';


export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url') || '';
  if (!url) return NextResponse.json({ ok: false, reason: 'missing url' }, { status: 400 });

  try {
    const data = await loadRepoCard(url);
    if (!data) return NextResponse.json({ ok: false });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=600' } });
  } catch {
    return NextResponse.json({ ok: false });
  }
}