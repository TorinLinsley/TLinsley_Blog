
import { NextResponse, type NextRequest } from 'next/server';

const HTTPS_HOSTS = new Set([
  'blog.torinlinsley.top',
  'torinlinsley.top',
]);

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

const TUNNEL_HOST = /\.(cpolar\.top|cpolar\.cn|cpolar\.io|trycloudflare\.com|ngrok-free\.app|ngrok\.io)$/i;

function resolveProto(request: NextRequest): string {
  const forwardedProto = (request.headers.get('x-forwarded-proto') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (forwardedProto) return forwardedProto;
  if (request.headers.get('x-forwarded-for')) return '';
  return request.nextUrl.protocol.replace(':', '').toLowerCase();
}

function proxy(request: NextRequest) {
  if (resolveProto(request) !== 'http') return NextResponse.next();

  const rawHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const host = rawHost.split(':')[0].trim().toLowerCase();
  if (!host) return NextResponse.next();
  if (LOCAL_HOST.test(host) || TUNNEL_HOST.test(host)) return NextResponse.next();

  const extra = (process.env.FORCE_HTTPS_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!HTTPS_HOSTS.has(host) && !extra.includes(host)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.port = '';
  return NextResponse.redirect(url, 301);
}

export { proxy as default, proxy };

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};