/**
 * 🐙🔗 服务端：把 GitHub / Gitee 的仓库或主页信息抓回来（只在服务端跑）。
 *
 * ⚠️ 这个文件**不能在客户端组件里 import**（里面有 fs）。客户端只要 `lib/repoCard.ts`
 *    那半份（解析 + 类型）就够了。
 *
 * 缓存：进程内 Map，命中 6 小时。GitHub 未登录只有 60 次/小时（按 IP），
 * 文章页每次打开都去抓一定会挂 —— 所以缓存是必须的，不是优化。
 *
 * Token 来源（按顺序找一个能用就行）：
 *   1. 环境变量 GITHUB_CARD_TOKEN / GITHUB_TOKEN / GITHUB_COMMENTS_TOKEN
 *   2. ./data/comments-config.json 的 githubToken   （博客自己就在这个目录）
 *   3. ./data/deploy_config.json 里的 blogPath + /data/comments-config.json
 *      （控制台的评论配置是写在博客那边的，所以要顺着 blogPath 找过去）
 *   一个都没有也照跑，只是走未登录的 60 次/小时。
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseRepoLink, type RepoCardData } from './repoCard';

const CACHE_TTL = 6 * 60 * 60 * 1000;   // 命中缓存 6 小时
const FAIL_TTL = 10 * 60 * 1000;        // 抓失败（404/限流）10 分钟后再试
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

/** 找 GitHub Token：环境变量 → 本目录的评论配置 → blogPath 下的评论配置 */
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

/** 统一的 JSON 抓取（带超时 + 可选 token） */
async function getJson(url: string, token: string, giteeToken = ''): Promise<Record<string, unknown> | null> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'xhblogs-repo-card',
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

/** 抓一个链接对应的卡片数据；抓不到返回 null */
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
    // Gitee：公开接口，不登录也能读；有 token 就带上（额度更高）
    if (link.kind === 'repo') {
      const j = await getJson(`https://gitee.com/api/v5/repos/${encodeURIComponent(link.owner)}/${encodeURIComponent(link.repo!)}`, '', giteeToken);
      if (j) {
        const owner = (j.owner || {}) as Record<string, unknown>;
        const ns = (j.namespace || {}) as Record<string, unknown>;
        data = {
          ok: true,
          host: 'gitee',
          kind: 'repo',
          // ⚠️ Gitee 的 owner.login 是「个人账号」，仓库挂在组织下时和链接里的名字**不一样**
          //    （实测 mindspore/mindspore 会回成 zhunaipan）。显示要用 namespace.path。
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
      // Gitee 的 gitee.com/xxx 既可能是**个人**也可能是**组织**，而且两个接口是分开的：
      //   · /users/{name}  —— 个人；组织会 404（实测 mindspore 就是 404）
      //   · /orgs/{name}   —— 组织；个人会 404
      // 所以先试个人，404 再试组织。组织接口不给仓库数/关注者，就留空，
      // 卡片那边发现没有统计数字会把那一行整个省掉（不显示 0/0）。
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
