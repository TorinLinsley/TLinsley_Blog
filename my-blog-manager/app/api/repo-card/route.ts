import { NextResponse } from 'next/server';
import { loadRepoCard } from '../../../lib/repoCardServer';

/**
 * 🔗 给「仓库/主页卡片」用的数据接口。
 *
 *   GET /api/repo-card?url=https://github.com/TorinLinsley/TLBlog
 *
 * 为什么不让浏览器直接去请求 GitHub：
 *   1. 卡片要头像/简介/star/fork/协议，GitHub 未登录只有 60 次/小时（按 IP），
 *      放在服务端才好做缓存（6 小时），文章页才不会被拖慢；
 *   2. token 不能出现在浏览器里。
 * 抓不到（404、限流、网络不通）就回 { ok:false }，前端保持原来的普通链接，不影响阅读。
 */

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
