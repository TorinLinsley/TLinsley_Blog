import { NextResponse } from 'next/server';

/**
 * 标准时间（北京时间）——给首页那个时钟对表用。
 *
 * 为什么走服务端：浏览器里做不了 NTP，也读不到别的域名的响应头。
 *
 * 取时策略（重点是**精度**：不然刷新一次快一点、慢一点，秒位会飘）：
 *   ① **毫秒级源**：timeapi.io 的 Asia/Shanghai（返回 y/m/d/h/m/s/ms，减 8 小时换成 UTC 时间戳）。
 *      实测同一台机器连续取，偏差稳定在 ±2ms —— 秒位不会飘。
 *   ② 秒级兜底：国家授时中心 `www.ntsc.ac.cn`、百度的 HTTP `Date` 响应头。
 *      ⚠️ `Date` 只精确到秒（被截断），公网往返又有抖动（实测 0.5~2s），
 *      只能做到秒级、没法"每次刷新都严丝合缝"，所以放备选。
 *   ③ 全挂 → 返回本机时间并标记 success:false，前端沿用上一次偏移量。
 *
 * ⚠️ 关键点：接口返回的必须是「**响应这一刻**的标准时间」。
 *    取时的网络往返（尤其是上游那一段，可能 1~2 秒）不能算到前端头上 ——
 *    每个时间样本都记下"服务器本机拿到它的时刻"，返回前再按 `Date.now()` 往前推，
 *    前端只需要补它自己那一小段往返（本地/局域网，几毫秒）。
 *    否则上游一慢，前端算出来的偏移量就会差好几秒，表现就是"刷新一次一个样"。
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TIMEOUT_MS = 4000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 一个时间样本：epochMs = 该样本代表的标准时间；at = 服务器本机拿到它时的 Date.now() */
type Sample = { source: string; epochMs: number; at: number };

/** 把样本推进到"此刻"的标准时间 */
function projectNow(sample: Sample) {
  return Math.round(sample.epochMs + (Date.now() - sample.at));
}

/** ① 毫秒级：timeapi.io（Asia/Shanghai） */
async function fromTimeApi(): Promise<Sample | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=Asia/Shanghai', {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    const at = Date.now();
    if (!res.ok) return null;
    const data = await res.json();
    const { year, month, day, hour, minute, seconds, milliSeconds } = data || {};
    if ([year, month, day, hour, minute, seconds].some((v) => typeof v !== 'number')) return null;
    // 字段是 Asia/Shanghai 本地时间 → 减 8 小时得到 UTC 时间戳；再补半个上游往返
    const base = Date.UTC(year, month - 1, day, hour, minute, seconds, milliSeconds || 0) - 8 * 3600 * 1000;
    return { source: 'timeapi', epochMs: base + (at - t0) / 2, at };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ② 秒级：读某个 URL 响应头里的 `Date`（UTC，截断到秒）。
 *    `Date` 是上游**生成响应那一刻**的时间，我们收完还过了半个往返 → 补 `(at - t0)/2`；
 *    再补 500ms 把"截断"造成的固定滞后居中。
 */
async function fromDateHeader(source: string, url: string): Promise<Sample | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: '*/*', 'Cache-Control': 'no-cache' },
    });
    const at = Date.now();
    if (!res.ok) return null;
    const raw = res.headers.get('date');
    if (!raw) return null;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return null;
    return { source, epochMs: ms + 500 + (at - t0) / 2, at };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 国家授时中心（优先 https，不行再试 http） */
async function fromNtsc(): Promise<Sample | null> {
  return (await fromDateHeader('ntsc', 'https://www.ntsc.ac.cn/')) ?? (await fromDateHeader('ntsc', 'http://www.ntsc.ac.cn/'));
}

/** 百度（国内极稳的秒级兜底） */
async function fromBaidu(): Promise<Sample | null> {
  return fromDateHeader('baidu', 'https://www.baidu.com');
}

export async function GET() {
  // ① 毫秒级源优先，快速路径：成功就直接返回（别为了等秒级源白等两秒）
  const msSample = await fromTimeApi();
  if (msSample) {
    return NextResponse.json(
      { success: true, source: msSample.source, epochMs: projectNow(msSample), serverMs: Date.now() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // ② 秒级兜底：国家授时中心 / 百度并行取（多个源取平均能压一点截断误差）
  const [ntsc, baidu] = await Promise.all([fromNtsc(), fromBaidu()]);
  const samples = [ntsc, baidu].filter((s): s is Sample => !!s);

  if (samples.length) {
    const avg = Math.round(samples.reduce((sum, s) => sum + projectNow(s), 0) / samples.length);
    return NextResponse.json(
      { success: true, source: samples[0].source, epochMs: avg, serverMs: Date.now() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { success: false, source: 'local', epochMs: Date.now(), serverMs: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
