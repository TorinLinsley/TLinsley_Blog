
import fs from 'node:fs';
import path from 'node:path';
import { parseRepoLink, type RepoCardData } from './repoCard';

const CACHE_TTL = 6 * 60 * 60 * 1000;
const FAIL_TTL = 10 * 60 * 1000;
const TIMEOUT = 8000;

type Entry = { at: number; data: RepoCardData | null };
const cache = new Map<string, Entry>();

function readJson(file: string): Record<string, unknown> | null {
  try {
    const text = fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '');
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function findGithubToken(): string {
  const env = process.env.GITHUB_CARD_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_COMMENTS_TOKEN;
  if (env) return env.trim();

  const cwd = process.cwd();

  const local = readJson(path.join(cwd, 'data', 'comments-config.json'));
  const localToken = local && typeof local.githubToken === 'string' ? local.githubToken.trim() : '';
  if (localToken) return localToken;

  const deploy = readJson(path.join(cwd, 'data', 'deploy_config.json'));
  const blogPath = deploy && typeof deploy.blogPath === 'string' ? deploy.blogPath : '';
  if (blogPath) {
    const remote = readJson(path.join(blogPath, 'data', 'comments-config.json'));
    const t = remote && typeof remote.githubToken === 'string' ? remote.githubToken.trim() : '';
    if (t) return t;
  }
  return '';
}

async function getJson(url: string, token: string, giteeToken = ''): Promise<Record<string, unknown> | null> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'tlblog-repo-card',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const finalUrl = giteeToken ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(giteeToken)}` : url;

  try {
    const res = await fetch(finalUrl, { headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export async function loadRepoCard(rawUrl: string): Promise<RepoCardData | null> {
  const link = parseRepoLink(rawUrl);
  if (!link) return null;

  const key = `${link.host}/${link.kind}/${link.owner}${link.repo ? '/' + link.repo : ''}`.toLowerCase();
  const hit = cache.get(key);
  if (hit) {
    const ttl = hit.data ? CACHE_TTL : FAIL_TTL;
    if (Date.now() - hit.at < ttl) {
      return hit.data ? { ...hit.data, cached: true } : null;
    }
  }

  const ghToken = link.host === 'github' ? findGithubToken() : '';
  const giteeToken = link.host === 'gitee' ? (process.env.GITEE_TOKEN || '').trim() : '';

  let data: RepoCardData | null = null;

  if (link.host === 'github') {
    if (link.kind === 'repo') {
      const j = await getJson(`https://api.github.com/repos/${encodeURIComponent(link.owner)}/${encodeURIComponent(link.repo!)}`, ghToken);
      if (j) {
        const owner = (j.owner || {}) as Record<string, unknown>;
        const license = (j.license || null) as Record<string, unknown> | null;
        data = {
          ok: true,
          host: 'github',
          kind: 'repo',
          owner: str(owner.login) || link.owner,
          repo: str(j.name) || link.repo,
          avatar: str(owner.avatar_url),
          description: str(j.description),
          stars: num(j.stargazers_count),
          forks: num(j.forks_count),
          license: license ? (str(license.spdx_id) || str(license.name) || 'no-license') : 'no-license',
          url: link.url,
        };
      }
    } else {
      const j = await getJson(`https://api.github.com/users/${encodeURIComponent(link.owner)}`, ghToken);
      if (j) {
        data = {
          ok: true,
          host: 'github',
          kind: 'user',
          owner: str(j.login) || link.owner,
          avatar: str(j.avatar_url),
          description: str(j.bio) || str(j.name),
          repos: num(j.public_repos),
          followers: num(j.followers),
          url: link.url,
        };
      }
    }
  } else {
    if (link.kind === 'repo') {
      const j = await getJson(`https://gitee.com/api/v5/repos/${encodeURIComponent(link.owner)}/${encodeURIComponent(link.repo!)}`, '', giteeToken);
      if (j) {
        const owner = (j.owner || {}) as Record<string, unknown>;
        const ns = (j.namespace || {}) as Record<string, unknown>;
        data = {
          ok: true,
          host: 'gitee',
          kind: 'repo',
          owner: str(ns.path) || str(owner.login) || link.owner,
          repo: str(j.name) || link.repo,
          avatar: str(owner.avatar_url),
          description: str(j.description),
          stars: num(j.stargazers_count),
          forks: num(j.forks_count),
          license: str(j.license) || 'no-license',
          url: link.url,
        };
      }
    } else {
      const j = await getJson(`https://gitee.com/api/v5/users/${encodeURIComponent(link.owner)}`, '', giteeToken);
      if (j) {
        data = {
          ok: true,
          host: 'gitee',
          kind: 'user',
          owner: str(j.login) || link.owner,
          avatar: str(j.avatar_url),
          description: str(j.bio) || str(j.name),
          repos: num(j.public_repos),
          followers: num(j.followers),
          url: link.url,
        };
      } else {
        const o = await getJson(`https://gitee.com/api/v5/orgs/${encodeURIComponent(link.owner)}`, '', giteeToken);
        if (o) {
          data = {
            ok: true,
            host: 'gitee',
            kind: 'user',
            owner: str(o.login) || link.owner,
            avatar: str(o.avatar_url),
            description: str(o.description) || str(o.name),
            url: link.url,
          };
        }
      }
    }
  }

  cache.set(key, { at: Date.now(), data });
  return data;
}