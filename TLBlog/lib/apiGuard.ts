
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host') || '';
  if (!origin) return false;
  try {
    const o = new URL(origin);
    if (host && o.host === host) return true;
    return ['127.0.0.1', 'localhost', '[::1]'].includes(o.hostname);
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  return (fwd.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim();
}

type Opts = { max: number; windowMs: number; minIntervalMs?: number };

const buckets = new Map<string, number[]>();

export function allow(bucketName: string, id: string, opts: Opts): boolean {
  const key = `${bucketName}:${id}`;
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < opts.windowMs);

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

  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.length === 0 || now - v[v.length - 1] > opts.windowMs) buckets.delete(k);
    }
  }
  return true;
}

export function deny(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}