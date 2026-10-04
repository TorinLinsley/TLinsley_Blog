// proxy.ts —— 用户不输 https:// 也能自动落到 HTTPS
//
// 背景：浏览器遇到「只有主机名」的地址（例如 blog.torinlinsley.top）默认先走
// http://（80 端口）。所以要让它变 https，只能由 80 端口这一侧回一个 301。
// 项目跑在 Nginx 反代后面时，这个 301 交给 Nginx 做最省事；本文件是第二道保险：
// 万一 80 端口的请求被 Nginx 直接转给了 Next（而不是 Nginx 自己跳转），
// 应用也能把它跳到 https。
//
// ⚠️ Next 16 把 middleware 改名成 proxy 了，用这个新文件名构建时不会有弃用警告。
//
// 服务器实际拓扑（2026-xx 确认）：Nginx 只 listen 443，443 反代到 127.0.0.1:80；
// 博客 Next 自己占着 0.0.0.0:80。所以：
//   浏览器 → http://blog.torinlinsley.top  → 直接打到 Next:80（没有 X-Forwarded-* 头）
//   浏览器 → https://blog.torinlinsley.top → Nginx:443 → Next:80（带 X-Forwarded-Proto: https）
// 判断规则因此是：反代说了算；反代没说话，但也没被代理过（连 X-Forwarded-For 都没有）
// 就说明是浏览器直连 Next 的 80，那就是 http，可以跳。
//
// ⚠️ 死循环红线：Nginx 的 443 server 块里必须有
//    proxy_set_header X-Forwarded-Proto $scheme;
//    否则 https 请求会被误判成 http，一直跳回自己。这句你现网配置里已经有了，别删。

import { NextResponse, type NextRequest } from 'next/server';

// 需要强制 HTTPS 的域名（只写主机名，别带协议和端口）
const HTTPS_HOSTS = new Set([
  'blog.torinlinsley.top',
  'torinlinsley.top',
  // '49.232.35.177', // 等证书覆盖到这个 IP 再放开，否则浏览器会先弹证书不匹配
]);

// 本机 / 内网：一律不跳，不然本地起 http 服务调试会被自己踢到 https
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

// 内网穿透 / 隧道域名：证书和域名都不固定，不跳
const TUNNEL_HOST = /\.(cpolar\.top|cpolar\.cn|cpolar\.io|trycloudflare\.com|ngrok-free\.app|ngrok\.io)$/i;

// 判断这次请求到底是不是 http：
// 1) 反代明确给了 X-Forwarded-Proto → 以它为准（443 那边是 https，不跳）
// 2) 没有 X-Forwarded-Proto 但被代理过（有 X-Forwarded-For）→ 情况不明，宁可不动
// 3) 两个头都没有 → 说明浏览器直连 Next 的 80 端口，那就是 http
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

  // 环境变量 FORCE_HTTPS_HOSTS=blog.example.com,www.example.com 可以临时追加域名
  const extra = (process.env.FORCE_HTTPS_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!HTTPS_HOSTS.has(host) && !extra.includes(host)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.port = ''; // 去掉 Next 内部端口，走 https 默认的 443
  return NextResponse.redirect(url, 301);
}

export { proxy as default, proxy };

// 只拦页面请求，静态资源和图片不必每次经过这里
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
