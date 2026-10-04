import { siteConfig } from '../siteConfig';
import { merged, readCommentsConfig } from './commentsConfig';

/**
 * 🐙 把游客评论**镜像**一份到对应的 GitHub Issue 里（可选功能）。
 *
 * 目的：评论留在本地 JSON（快、游客零门槛），同时也在你的仓库里留档，
 * 这样 issue 列表里能看到全部讨论，GitHub 那边的历史一起攒着 ✓
 *
 * ⚠️ 关于"邮件通知"：这条路**收不到你自己的邮件** ✗ —— 评论是用你的 Token 代发的，
 *    而 GitHub 不会把你本人账号的操作通知给你。想要提醒请用 lib/notify.ts（手机推送）。
 *
 * 需要的环境变量（配了才启用，没配就静默跳过）：
 *   GITHUB_COMMENTS_TOKEN     Fine-grained PAT，只给那个评论仓库 Issues: Read and write
 *   GITHUB_COMMENTS_OWNER     可选，默认取 siteConfig.gitalkConfig.owner
 *   GITHUB_COMMENTS_REPO      可选，默认取 siteConfig.gitalkConfig.repo
 *
 * Issue 的标签沿用 Gitalk 的约定：['Gitalk', <页面 pathname 截断到 49 字符>]，
 * 这样和以前 Gitalk 建的 Issue 是**同一个**，不会重复建 ✓
 */

const API = 'https://api.github.com';

export type MirrorPayload = {
  page: string;
  name: string;
  content: string;
  time: string;
};

async function conf() {
  const c = merged(await readCommentsConfig());
  const owner = process.env.GITHUB_COMMENTS_OWNER || siteConfig.gitalkConfig?.owner || '';
  const repo = process.env.GITHUB_COMMENTS_REPO || siteConfig.gitalkConfig?.repo || '';
  if (!c.githubToken || !owner || !repo) return null;
  return { token: c.githubToken, owner, repo };
}

/** 页面 pathname → Gitalk 用的 issue 标识（必须和 Gitalk 完全一致，否则会建出两个 Issue） */
function issueId(page: string): string {
  return (page.replace(/\/$/, '') || '/').substring(0, 49);
}

async function ghFetch(url: string, token: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
}

function commentBody(p: MirrorPayload): string {
  // ⚠️ 正文里**不再写时间**：时间统一显示在评论头部「发表于 …」后面（Gitalk 那边由
  //    GitalkBox 改写 ✓），底部再挂一行小字纯属重复 ✗
  return [`🧳 **游客评论 · ${p.name}**`, '', p.content].join('\n');
}

/** 找到（或创建）这一页对应的 Issue，然后把评论发进去。返回 issue 编号或 null */
export async function mirrorToGithub(p: MirrorPayload): Promise<number | null> {
  const c = await conf();
  if (!c) return null;

  const id = issueId(p.page);
  const labels = ['Gitalk', id];

  try {
    // 1) 先按标签找（state=all：关掉的也算，避免重复建）
    const listRes = await ghFetch(
      `${API}/repos/${c.owner}/${c.repo}/issues?state=all&labels=${encodeURIComponent(labels.join(','))}`,
      c.token
    );
    let issueNumber: number | null = null;

    if (listRes.ok) {
      const list = await listRes.json();
      if (Array.isArray(list) && list.length > 0) issueNumber = list[0].number;
    }

    // 2) 没有就建一个（内容是本站页面的标题，方便你在仓库里认）
    if (issueNumber === null) {
      const createRes = await ghFetch(`${API}/repos/${c.owner}/${c.repo}/issues`, c.token, {
        method: 'POST',
        body: JSON.stringify({
          title: id,
          labels,
          body: `本页的评论（游客无需 GitHub 账号即可发表）。\n\n— 由博客评论区自动创建`,
        }),
      });
      if (!createRes.ok) return null;
      const created = await createRes.json();
      issueNumber = created?.number ?? null;
    }

    if (issueNumber === null) return null;

    // 3) 把评论写进去
    const res = await ghFetch(`${API}/repos/${c.owner}/${c.repo}/issues/${issueNumber}/comments`, c.token, {
      method: 'POST',
      body: JSON.stringify({ body: commentBody(p) }),
    });
    return res.ok ? issueNumber : null;
  } catch {
    return null;   // 网络/权限问题都不该影响访客提交
  }
}

/**
 * 🧳 镜像过去的游客评论，正文长这样：
 *      🧳 **游客评论 · 昵称**
 *      （空行）
 *      正文…
 * 取出来的时候要把这层"包装"剥掉，只留昵称和正文 —— 这样它在列表里和本站存的
 * 那条游客评论长得**一模一样**（同样的头像块、同样的名字、同样的正文）✓
 */
const GUEST_BODY = /^🧳\s*\*\*游客评论\s*·\s*([^*\n]+?)\*\*\s*\n+([\s\S]*)$/;

/**
 * 早期版本在正文末尾挂过一行小字（`<sub>2026/9/29 16:58:02 · 由本站评论区代发…</sub>`）。
 * 现在不显示了 —— 但仓库里那些老评论还带着它，取出来时要剪掉，
 * 否则①列表里多一行没用的字 ②和本站那份对不上、去重会失效 ✗
 */
function stripOldFooter(text: string): string {
  const m = text.match(/\n*<sub>[^<]*<\/sub>\s*$/);
  if (m && m.index !== undefined && /代发/.test(m[0])) return text.slice(0, m.index).trim();
  return text;
}

type IssueShape = {
  id: number;
  body?: string;
  created_at?: string;
  user?: { login?: string; avatar_url?: string };
};

/** GitHub 评论 → 统一形状：游客镜像的用「游客名 + 彩色首字母头像」，真人用 GitHub 头像 */
function normalize(x: IssueShape) {
  const text = stripOldFooter(String(x.body || '').replace(/\r\n?/g, '\n').trim());
  const m = text.match(GUEST_BODY);
  const base = {
    id: `gh-${x.id}`,
    createdAt: x.created_at ? new Date(x.created_at).getTime() : Date.now(),
  };
  if (m) {
    return {
      ...base,
      name: m[1].trim() || '匿名游客',
      content: stripOldFooter(m[2].trim()),
      source: 'guest' as const,
      avatar: '',                       // 空头像 → 前端画彩色首字母块（和本站游客评论一致 ✓）
    };
  }
  return {
    ...base,
    name: x.user?.login || 'GitHub 用户',
    content: text,
    source: 'github' as const,
    avatar: x.user?.avatar_url || '',
  };
}

/**
 * 📥 取这一页对应 Issue 里的**全部评论**（游客镜像过去的 + GitHub 用户自己发的）。
 *
 * 用途：让「游客」那条列表也能看见 GitHub 用户的评论 —— 下拉只决定“用什么身份发”，
 * 列表永远是同一份、两种来源混排 ✓
 *
 * ⚠️ 返回值**必须能区分三种情况**，因为调用方要拿它决定"要不要把本地那份也跟着删"：
 *    ok=false            → 没配 token / 网络异常 / 权限不够 ⇒ **什么都别动**（不能瞎删 ✗）
 *    ok=true, issue=false→ 这一页根本没建过 Issue ⇒ 也别动（评论可能压根没镜像过 ✓）
 *    ok=true, issue=true → 查到 Issue 了，那 comments 就是"GitHub 上真实剩下的" ⇒ 可据此对齐 ✓
 */
export type IssueFetch = {
  ok: boolean;
  issue: boolean;
  comments: ReturnType<typeof normalize>[];
};

export async function fetchIssueComments(page: string): Promise<IssueFetch> {
  const none: IssueFetch = { ok: false, issue: false, comments: [] };
  const c = await conf();
  if (!c) return none;

  const id = issueId(page);
  const labels = ['Gitalk', id];

  try {
    const listRes = await ghFetch(
      `${API}/repos/${c.owner}/${c.repo}/issues?state=all&labels=${encodeURIComponent(labels.join(','))}`,
      c.token
    );
    if (!listRes.ok) return none;
    const issues = await listRes.json();
    if (!Array.isArray(issues) || issues.length === 0) return { ok: true, issue: false, comments: [] };

    const res = await ghFetch(
      `${API}/repos/${c.owner}/${c.repo}/issues/${issues[0].number}/comments?per_page=100`,
      c.token
    );
    if (!res.ok) return none;
    const raw = await res.json();

    return { ok: true, issue: true, comments: (Array.isArray(raw) ? raw : []).map((x: IssueShape) => normalize(x)) };
  } catch {
    return none;
  }
}

/**
 * 🗑️ 把 GitHub 上那几条**镜像过去的游客评论**删掉（昵称 + 正文对得上才算 ✓）。
 *
 * 用途：在评论区（或控制台）删掉一条游客评论时，顺手把它在 Issue 里的那份也删掉 ——
 * 否则刷新一下它又会从 GitHub 那边冒出来 ✗ 两边永远对不齐。
 * 搜不到 / 没权限 / 网络异常都**直接算了**，绝不影响"本地那条已经删掉了"这件事 ✓
 */
export async function deleteMirrors(page: string, name: string, content: string): Promise<number> {
  const c = await conf();
  if (!c) return 0;

  const id = issueId(page);
  const labels = ['Gitalk', id];

  try {
    const listRes = await ghFetch(
      `${API}/repos/${c.owner}/${c.repo}/issues?state=all&labels=${encodeURIComponent(labels.join(','))}`,
      c.token
    );
    if (!listRes.ok) return 0;
    const issues = await listRes.json();
    if (!Array.isArray(issues) || issues.length === 0) return 0;

    const res = await ghFetch(
      `${API}/repos/${c.owner}/${c.repo}/issues/${issues[0].number}/comments?per_page=100`,
      c.token
    );
    if (!res.ok) return 0;
    const raw = await res.json();

    let removed = 0;
    for (const x of Array.isArray(raw) ? (raw as IssueShape[]) : []) {
      const n = normalize(x);
      if (n.source !== 'guest' || n.name !== name || n.content !== content) continue;
      const del = await ghFetch(`${API}/repos/${c.owner}/${c.repo}/issues/comments/${x.id}`, c.token, {
        method: 'DELETE',
      });
      if (del.ok) removed += 1;
    }
    return removed;
  } catch {
    return 0;
  }
}
