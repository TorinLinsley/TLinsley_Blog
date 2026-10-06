/**
 * 🛡️ 对外 API 的最小防护：同源校验 + 内存限流。
 *
 * 用在 `/api/chat`（会被拿去烧 AI 额度）和 `/api/github`（开放中继）这两个
 * **谁都能打**的接口上。它们都不是登录态接口，目标只是"别被人当免费资源用"。
 *
 * ⚠️ 限流按 IP 记，而 IP 来自 `x-forwarded-for`（nginx 会正确写它）。
 *    所以这层防护**依赖 3000 端口没有直接暴露** —— 绕过 nginx 就能伪造这个头。
 *    （2026-10-06 已把 tlblog.service 改成 `-H 127.0.0.1`，并实测公网连不上 3000。）
 */

/** 同源校验：Origin 的 host 必须和本次请求自己的 Host 一致 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host') || '';
  if (!origin) return false; // 浏览器的跨域/同源 POST 都会带 Origin；没有 = 不是网页在调
  try {
    const o = new URL(origin);
    if (host && o.host === host) return true;
    // 本机调试：dev 的端口会变（3000/3010/3080…），只放行回环地址
    return ['127.0.0.1', 'localhost', '[::1]'].includes(o.hostname);
  } catch {
    return false;
  }
}

/** 客户端 IP：优先取 nginx 写的 x-forwarded-for 的第一段 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  return (fwd.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim();
}

type Opts = { max: number; windowMs: number; minIntervalMs?: number };

/** bucket 名 + 标识 → 最近命中时间戳 */
const buckets = new Map<string, number[]>();

/**
 * 放行返回 true；超出配额返回 false。
 * 进程内存计数 —— 单机自托管够用；重启即清零（可接受）。
 */
export function allow(bucketName: string, id: string, opts: Opts): boolean {
  const key = `${bucketName}:${id}`;
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < opts.windowMs);

  // 两次之间最少间隔
  if (opts.minIntervalMs && list.length > 0 && now - list[list.length - 1] < opts.minIntervalMs) {
    buckets.set(key, list);
    return false;
  }
  if (list.length >= opts.max) {
    buckets.set(key, list);
    return false;
  }

  list.push(now);
  buckets.set(key, list);

  // 🧹 顺手清理，别让 Map 无限长大
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.length === 0 || now - v[v.length - 1] > opts.windowMs) buckets.delete(k);
    }
  }
  return true;
}

/** 统一的拒绝响应（文案直接给访客看） */
export function deny(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
