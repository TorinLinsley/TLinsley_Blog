import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ prefix: string; name: string }> }) {
  const { prefix, name } = await ctx.params;

  const ok = (s: string) => /^[A-Za-z0-9._-]+$/.test(s || '');
  const icon = String(name || '').replace(/\.svg$/i, '');
  if (!ok(prefix) || !ok(icon)) {
    return new NextResponse('bad icon name', { status: 400 });
  }

  try {
    const res = await fetch(`https://api.iconify.design/${prefix}/${icon}.svg`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      return new NextResponse('icon not found', { status: 404 });
    }
    const svg = await res.text();
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('icon fetch failed', { status: 502 });
  }
}