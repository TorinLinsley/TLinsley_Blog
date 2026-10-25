import { NextRequest, NextResponse } from 'next/server';
import { appendComment, deleteComment, isValidPage, readComments, writeComments } from '../../../lib/comments';
import { deleteMirrors, fetchIssueComments, mirrorToGithub } from '../../../lib/githubMirror';
import { notifyNewComment } from '../../../lib/notify';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME = 24;
const MAX_CONTENT = 2000;
const MIN_INTERVAL_MS = 15 * 1000;
const MAX_PER_HOUR = 12;

const recentByIp = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  return (fwd.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim();
}

function tooFast(ip: string): boolean {
  const now = Date.now();
  const list = (recentByIp.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  const blocked = (list.length > 0 && now - list[list.length - 1] < MIN_INTERVAL_MS) || list.length >= MAX_PER_HOUR;
  if (!blocked) {
    list.push(now);
    recentByIp.set(ip, list);
  }
  return blocked;
}

function clean(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
}

const keyOf = (c: { name: string; content: string }) => `${c.name}\u0000${c.content}`;

export async function GET(req: NextRequest) {
  const page = req.nextUrl.searchParams.get('page') || '';
  if (!isValidPage(page)) return NextResponse.json({ ok: false, message: '页面标识不合法' }, { status: 400 });

  const [local, gh] = await Promise.all([
    readComments(page),
    fetchIssueComments(page).catch(() => ({ ok: false, issue: false, comments: [] })),
  ]);

  let mine = local;
  if (gh.ok && gh.issue) {
    const alive = new Set(gh.comments.filter((c) => c.source === 'guest').map(keyOf));
    const cutoff = Date.now() - 2 * 60 * 1000;
    const fresh = await readComments(page);
    const known = new Set(local.map((c) => c.id));
    const kept = fresh.filter(
      (c) => alive.has(keyOf(c)) || c.createdAt > cutoff || !known.has(c.id)
    );
    if (kept.length !== fresh.length) await writeComments(page, kept).catch(() => null);
    mine = kept;
  }

  const seen = new Set(mine.map(keyOf));
  const merged = gh.comments.filter((g) => !(g.source === 'guest' && seen.has(keyOf(g))));

  const comments = [...mine, ...merged].sort((a, b) => a.createdAt - b.createdAt);
  return NextResponse.json({ ok: true, comments });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: '请求格式不对' }, { status: 400 });
  }

  const page = String(body.page || '');
  const name = clean(String(body.name || '')).slice(0, MAX_NAME);
  const content = clean(String(body.content || '')).slice(0, MAX_CONTENT);
  const trap = String(body.trap || '');

  if (!isValidPage(page)) return NextResponse.json({ ok: false, message: '页面标识不合法' }, { status: 400 });
  if (trap) return NextResponse.json({ ok: false, message: '提交失败' }, { status: 400 });
  if (!content) return NextResponse.json({ ok: false, message: '内容不能为空' }, { status: 400 });
  if (content.length > MAX_CONTENT) return NextResponse.json({ ok: false, message: '内容太长了' }, { status: 400 });

  if (process.env.COMMENTS_ALLOW_LINKS !== '1' && /https?:\/\/|www\./i.test(content)) {
    return NextResponse.json({ ok: false, message: '评论里暂时不允许带链接' }, { status: 400 });
  }

  const ip = clientIp(req);
  if (tooFast(ip)) {
    return NextResponse.json({ ok: false, message: '发得太快了，歇一会儿再来' }, { status: 429 });
  }

  const comment = await appendComment(page, name || '匿名游客', content);

  const payload = {
    page,
    name: comment.name,
    content: comment.content,
    time: new Date(comment.createdAt).toLocaleString('zh-CN', { hour12: false }),
  };
  void mirrorToGithub(payload).catch(() => null);
  void notifyNewComment(payload).catch(() => null);

  return NextResponse.json({ ok: true, comment });
}

export async function DELETE(req: NextRequest) {
  const key = process.env.COMMENTS_ADMIN_KEY || '';
  if (!key) return NextResponse.json({ ok: false, message: '未配置管理密钥，无法删除' }, { status: 403 });
  if ((req.headers.get('x-admin-key') || '') !== key) {
    return NextResponse.json({ ok: false, message: '没有删除权限' }, { status: 403 });
  }

  const page = req.nextUrl.searchParams.get('page') || '';
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!isValidPage(page) || !id) return NextResponse.json({ ok: false, message: '参数不合法' }, { status: 400 });

  const target = (await readComments(page)).find((c) => c.id === id);

  const done = await deleteComment(page, id);

  if (done && target) {
    void deleteMirrors(page, target.name, target.content).catch(() => 0);
  }

  return NextResponse.json({ ok: done, message: done ? '已删除' : '没找到这条评论' });
}