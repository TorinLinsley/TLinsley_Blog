import { NextRequest, NextResponse } from 'next/server';
import { appendComment, deleteComment, isValidPage, readComments, writeComments } from '../../../lib/comments';
import { deleteMirrors, fetchIssueComments, mirrorToGithub } from '../../../lib/githubMirror';
import { notifyNewComment } from '../../../lib/notify';

/**
 * 💬 自建评论接口（同源、无第三方依赖、无数据库）。
 *
 *   GET    /api/comments?page=/posts/xxx   读这一页的评论
 *   POST   /api/comments                   { page, name, content, trap }  发一条
 *   DELETE /api/comments?page=&id=          删一条（需要 COMMENTS_ADMIN_KEY）
 *
 * 防刷手段（都不依赖验证码服务）：
 *   · 蜜罐字段 `trap`：正常用户看不到、不会填；填了直接当成机器人丢掉
 *   · 同一 IP 15 秒一条、每小时最多 12 条
 *   · 默认不允许发链接（要放开就设环境变量 COMMENTS_ALLOW_LINKS=1）
 *   · 昵称/内容长度上限，内容里控制字符清掉
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME = 24;
const MAX_CONTENT = 2000;
const MIN_INTERVAL_MS = 15 * 1000;
const MAX_PER_HOUR = 12;

/** ip → 最近发评论的时间戳列表（进程内存，重启即清空） */
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

/** 清掉控制字符（防止塞进 JSON 里搞坏文件），并统一换行 */
function clean(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
}

/** 昵称 + 正文 → 判断"两边是不是同一条评论"（镜像那条和本站那条就靠它配对 ✓） */
const keyOf = (c: { name: string; content: string }) => `${c.name}\u0000${c.content}`;

export async function GET(req: NextRequest) {
  const page = req.nextUrl.searchParams.get('page') || '';
  if (!isValidPage(page)) return NextResponse.json({ ok: false, message: '页面标识不合法' }, { status: 400 });

  // 本地游客评论 + GitHub Issue 里的评论（含镜像过去的游客评论）→ 合并成同一份列表
  // 这样下拉选哪种发布方式，看到的都是全部评论 ✓
  const [local, gh] = await Promise.all([
    readComments(page),
    fetchIssueComments(page).catch(() => ({ ok: false, issue: false, comments: [] })),
  ]);

  /**
   * 🔄 双向对齐之一：**在 GitHub 那边删掉的镜像评论，本站这份也跟着删**。
   *
   * 判断"可以删"的条件很保守（宁可不删也不误删 ✗）：
   *   · 镜像功能配好了、GitHub 也真的查到了（ok=true）—— 网络/权限出问题一律不动 ✓
   *   · 这一页的 Issue **确实存在**（issue=true）—— Issue 都没建过的页面，评论本来就没镜像过 ✓
   * 两个条件都满足时，GitHub 上那份"剩下的"就是标准：本地找不到对应镜像的，说明已经被删了 ✓
   */
  let mine = local;
  if (gh.ok && gh.issue) {
    const alive = new Set(gh.comments.filter((c) => c.source === 'guest').map(keyOf));
    // 刚发出去的（2 分钟内）先不动：镜像那一步是"发完顺手做"的，可能还在路上 ⏳
    const cutoff = Date.now() - 2 * 60 * 1000;
    // 重新读一次：上面查 GitHub 花了几百毫秒，这期间可能刚有人发了新评论 —— 别把它覆盖掉 ✗
    const fresh = await readComments(page);
    const known = new Set(local.map((c) => c.id));
    const kept = fresh.filter(
      (c) => alive.has(keyOf(c)) || c.createdAt > cutoff || !known.has(c.id)
    );
    if (kept.length !== fresh.length) await writeComments(page, kept).catch(() => null);
    mine = kept;
  }

  // ⚠️ 游客评论是"两处都有"的（本站 JSON 一份 + 镜像到 Issue 一份）→ 按「昵称 + 正文」
  //    把镜像那份去掉，否则同一条会显示两遍 ✗（本站那份时间更精确，留它 ✓）
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
  if (trap) return NextResponse.json({ ok: false, message: '提交失败' }, { status: 400 });   // 蜜罐命中
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

  /**
   * 落盘之后就"顺手"做两件可选的事（都不阻塞访客 ✓ 失败也不影响评论已保存 ✓）：
   *   ① 镜像一份到对应的 GitHub Issue（仓库里留档 ✓ Issue 不存在会自动建 ✓）
   *   ② 给你推一条通知（手机秒收；GitHub 邮件收不到，原因见 lib/notify.ts）
   */
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

  // 先把这条记下来（删完就查不到了），等下要用昵称/正文去 GitHub 找它那份镜像 ✓
  const target = (await readComments(page)).find((c) => c.id === id);

  const done = await deleteComment(page, id);

  /**
   * 🔄 双向对齐之二：**本站删掉的游客评论，GitHub 那边镜像的那份也一起删**。
   * 不删的话刷新一下它又会从 GitHub 冒出来 ✗（两边永远对不齐）
   */
  if (done && target) {
    void deleteMirrors(page, target.name, target.content).catch(() => 0);
  }

  return NextResponse.json({ ok: done, message: done ? '已删除' : '没找到这条评论' });
}
