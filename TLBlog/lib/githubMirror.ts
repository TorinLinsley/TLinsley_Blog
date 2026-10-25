import { siteConfig } from '../siteConfig';
import { merged, readCommentsConfig } from './commentsConfig';


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
  return [`🧳 **游客评论 · ${p.name}**`, '', p.content].join('\n');
}

export async function mirrorToGithub(p: MirrorPayload): Promise<number | null> {
  const c = await conf();
  if (!c) return null;

  const id = issueId(p.page);
  const labels = ['Gitalk', id];

  try {
    const listRes = await ghFetch(
      `${API}/repos/${c.owner}/${c.repo}/issues?state=all&labels=${encodeURIComponent(labels.join(','))}`,
      c.token
    );
    let issueNumber: number | null = null;

    if (listRes.ok) {
      const list = await listRes.json();
      if (Array.isArray(list) && list.length > 0) issueNumber = list[0].number;
    }

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

    const res = await ghFetch(`${API}/repos/${c.owner}/${c.repo}/issues/${issueNumber}/comments`, c.token, {
      method: 'POST',
      body: JSON.stringify({ body: commentBody(p) }),
    });
    return res.ok ? issueNumber : null;
  } catch {
    return null;
  }
}

const GUEST_BODY = /^🧳\s*\*\*游客评论\s*·\s*([^*\n]+?)\*\*\s*\n+([\s\S]*)$/;

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
      avatar: '',
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