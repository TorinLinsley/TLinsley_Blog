
export type RepoCardKind = 'repo' | 'user';
export type RepoCardHost = 'github' | 'gitee';

const NOT_A_TARGET = new Set([
  'issues', 'pull', 'pulls', 'blob', 'tree', 'commits', 'commit', 'releases', 'tags',
  'branches', 'actions', 'wiki', 'settings', 'notifications', 'explore', 'topics',
  'search', 'marketplace', 'sponsors', 'orgs', 'users', 'about', 'pricing', 'features',
  'login', 'signup', 'new', 'collections', 'trending', 'apps', 'dashboard',
]);

const SEGMENT = /^[A-Za-z0-9._-]+$/;

export type RepoLink = {
  host: RepoCardHost;
  kind: RepoCardKind;
  owner: string;
  repo?: string;
  url: string;
};

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
  let owner = ownerRaw;
  let repo = repoRaw;
  try { owner = decodeURIComponent(ownerRaw); } catch {  }
  try { if (repo) repo = decodeURIComponent(repoRaw); } catch {  }

  if (!SEGMENT.test(owner)) return null;
  if (NOT_A_TARGET.has(owner.toLowerCase())) return null;

  if (!repo) return { host, kind: 'user', owner, url: `https://${hostname}/${owner}` };

  if (!SEGMENT.test(repo) || repo.toLowerCase().endsWith('.git')) {
    if (repo.toLowerCase().endsWith('.git')) repo = repo.slice(0, -4);
    else return null;
  }
  if (NOT_A_TARGET.has(repo.toLowerCase())) return null;

  return { host, kind: 'repo', owner, repo, url: `https://${hostname}/${owner}/${repo}` };
}

export type RepoCardData = {
  ok: boolean;
  host: RepoCardHost;
  kind: RepoCardKind;
  owner: string;
  repo?: string;
  avatar?: string;
  description?: string;
  stars?: number;
  forks?: number;
  license?: string;
  repos?: number;
  followers?: number;
  url: string;
  cached?: boolean;
};