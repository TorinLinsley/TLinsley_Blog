import { NextResponse } from 'next/server';
import { allow, clientIp, isSameOrigin } from '../../../lib/apiGuard';

/**
 * 🔁 Gitalk 登录换 token 的同源代理（绕开浏览器跨域限制）。
 *
 * ⚠️ 原来这里是**无校验的开放中继**：请求体原样转发给 GitHub 的 token 接口、
 *    响应原样返回 —— 等于把服务器借给别人当代理用。
 *
 * 现在加了三道（**没有删掉任何功能**，Gitalk 正常登录照样能用）：
 *   ① 同源校验：只允许本站页面发起（GitalkBox 就是同源调的）
 *   ② 限流：每个 IP 10 分钟最多 20 次（正常登录一次就一次）
 *   ③ 参数白名单：只转发 OAuth 该有的那几个字段，
 *      别的字段一律丢掉 —— 不给它当中继转发任意内容的机会
 *
 * 注：Gitalk 的 client_secret 是由浏览器带上来的（它的架构决定的，改不掉），
 *     所以这个接口不校验 secret；这里挡的是"被当免费代理滥用"。
 */

const ALLOWED_PARAMS = new Set(['client_id', 'client_secret', 'code', 'redirect_uri', 'state']);

/** 解析请求体（JSON 或表单都兼容），只保留白名单字段 */
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
  // code 是换 token 的必需项，没有就没必要转发
  if (!out.code) return null;
  return out;
}

export async function POST(req: Request) {
  // ① 同源校验
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // ② 限流
  const ip = clientIp(req);
  if (!allow('github-oauth', ip, { max: 20, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  try {
    const raw = await req.text();
    const contentType = req.headers.get('content-type') || 'application/json';

    // ③ 参数白名单
    const params = pickAllowed(raw, contentType);
    if (!params) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    // 由我们自己的服务器在后台发给 GitHub（绕开浏览器的跨域拦截）
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
