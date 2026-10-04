/**
 * 🔗 仓库/用户链接的解析与数据类型（服务端抓取和前端卡片共用）。
 *
 * 认这四种写法（带不带 www、带不带 http(s)、末尾有没有斜杠都行）：
 *   https://github.com/<用户>              个人主页
 *   https://github.com/<用户>/<仓库>        仓库
 *   https://gitee.com/<用户>               个人主页
 *   https://gitee.com/<用户>/<仓库>         仓库
 *
 * ⚠️ 别的一律不认（issue / PR / blob / tree / releases …）：那些不是"仓库或主页"，
 *    做成卡片会误导 —— 直接保持普通链接。
 */

export type RepoCardKind = 'repo' | 'user';
export type RepoCardHost = 'github' | 'gitee';

/** GitHub / Gitee 第一段里出现这些就说明不是「仓库或主页」，不认 */
const NOT_A_TARGET = new Set([
  'issues', 'pull', 'pulls', 'blob', 'tree', 'commits', 'commit', 'releases', 'tags',
  'branches', 'actions', 'wiki', 'settings', 'notifications', 'explore', 'topics',
  'search', 'marketplace', 'sponsors', 'orgs', 'users', 'about', 'pricing', 'features',
  'login', 'signup', 'new', 'collections', 'trending', 'apps', 'dashboard',
]);

/** GitHub 用户名/仓库名允许的字符（Gitee 更宽松，这里统一放宽一点） */
const SEGMENT = /^[A-Za-z0-9._-]+$/;

export type RepoLink = {
  host: RepoCardHost;
  kind: RepoCardKind;
  owner: string;
  /** kind === 'repo' 时才有 */
  repo?: string;
  /** 规范化后的原始链接（拿去跳转） */
  url: string;
};

/** 解析一个链接；不是「仓库 / 主页」就返回 null */
export function parseRepoLink(raw: string): RepoLink | null {
  const text = String(raw || '').trim();
  if (!text) return null;

  let u: URL;
  try {
    u = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }

  const hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  let host: RepoCardHost | null = null;
  if (hostname === 'github.com') host = 'github';
  else if (hostname === 'gitee.com') host = 'gitee';
  if (!host) return null;

  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;

  const [ownerRaw, repoRaw] = parts;
  // 解一下 %xx（中文用户名/仓库名）
  let owner = ownerRaw;
  let repo = repoRaw;
  try { owner = decodeURIComponent(ownerRaw); } catch { /* 保持原样 */ }
  try { if (repo) repo = decodeURIComponent(repoRaw); } catch { /* 保持原样 */ }

  if (!SEGMENT.test(owner)) return null;
  if (NOT_A_TARGET.has(owner.toLowerCase())) return null;

  if (!repo) return { host, kind: 'user', owner, url: `https://${hostname}/${owner}` };

  if (!SEGMENT.test(repo) || repo.toLowerCase().endsWith('.git')) {
    // 以 .git 结尾的按仓库处理（去掉后缀）
    if (repo.toLowerCase().endsWith('.git')) repo = repo.slice(0, -4);
    else return null;
  }
  if (NOT_A_TARGET.has(repo.toLowerCase())) return null;

  return { host, kind: 'repo', owner, repo, url: `https://${hostname}/${owner}/${repo}` };
}

/** 抓回来的卡片数据（服务端 → 前端） */
export type RepoCardData = {
  ok: boolean;
  host: RepoCardHost;
  kind: RepoCardKind;
  owner: string;
  repo?: string;
  /** 头像地址 */
  avatar?: string;
  /** 仓库简介 / 用户签名 */
  description?: string;
  stars?: number;
  forks?: number;
  /** 协议，例如 MIT；没有就 "no-license"（和 GitHub 列表里显示的一致） */
  license?: string;
  /** 用户主页才有：公开仓库数 / 关注者 */
  repos?: number;
  followers?: number;
  url: string;
  /** 数据是不是缓存的（调试用） */
  cached?: boolean;
};
