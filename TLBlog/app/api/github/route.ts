import { NextResponse } from 'next/server';
import { allow, clientIp, isSameOrigin } from '../../../lib/apiGuard';


const ALLOWED_PARAMS = new Set(['client_id', 'client_secret', 'code', 'redirect_uri', 'state']);

function pickAllowed(raw: string, contentType: string): Record<string, string> | null {
  let src: Record<string, unknown> = {};
  try {
    if (contentType.includes('application/json')) {
      src = JSON.parse(raw);
    } else {
      src = Object.fromEntries(new URLSearchParams(raw));
    }
  } catch {
    return null;
  }
  if (!src || typeof src !== 'object') return null;

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    if (ALLOWED_PARAMS.has(k) && typeof v === 'string') out[k] = v;
  }
  if (!out.code) return null;
  return out;
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const ip = clientIp(req);
  if (!allow('github-oauth', ip, { max: 20, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  try {
    const raw = await req.text();
    const contentType = req.headers.get('content-type') || 'application/json';

    const params = pickAllowed(raw, contentType);
    if (!params) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const githubRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await githubRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('代理请求失败:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}