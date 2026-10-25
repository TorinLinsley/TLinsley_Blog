import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TIMEOUT_MS = 4000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

type Sample = { source: string; epochMs: number; at: number };

function projectNow(sample: Sample) {
  return Math.round(sample.epochMs + (Date.now() - sample.at));
}

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
    const base = Date.UTC(year, month - 1, day, hour, minute, seconds, milliSeconds || 0) - 8 * 3600 * 1000;
    return { source: 'timeapi', epochMs: base + (at - t0) / 2, at };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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

async function fromNtsc(): Promise<Sample | null> {
  return (await fromDateHeader('ntsc', 'https://www.ntsc.ac.cn/')) ?? (await fromDateHeader('ntsc', 'http://www.ntsc.ac.cn/'));
}

async function fromBaidu(): Promise<Sample | null> {
  return fromDateHeader('baidu', 'https://www.baidu.com');
}

export async function GET() {
  const msSample = await fromTimeApi();
  if (msSample) {
    return NextResponse.json(
      { success: true, source: msSample.source, epochMs: projectNow(msSample), serverMs: Date.now() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

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