import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * ⚙️ 评论镜像/通知的配置（**服务端只读**，绝不会进前端产物）。
 *
 * 放在 `data/comments-config.json` ✓ —— 由控制台的「评论系统配置」页面写进来 ✓
 * 你只要在控制台里粘一次 Token 就行 ✓ 不用登服务器改环境变量、也不用重新构建 ✓
 *
 * 优先级：环境变量 > 配置文件（想用环境变量覆盖也可以，但并非必须）
 *
 * 文件长这样（控制台自动写，别手改也行）：
 *   { "githubToken": "github_pat_xxx", "notifyWebhook": "https://..." }
 */

export type CommentsConfig = {
  /** Fine-grained PAT：只给评论仓库 Issues: Read and write */
  githubToken?: string;
  /** 可选：新评论推送地址（企业微信/钉钉/Server酱/Bark 的 webhook 都行） */
  notifyWebhook?: string;
  /** 可选：Server酱 SendKey */
  notifyServerChan?: string;
  /** 可选：Bark URL */
  notifyBark?: string;
};

const CONFIG_FILE = path.join(process.cwd(), 'data', 'comments-config.json');

let cache: { at: number; value: CommentsConfig } | null = null;

/** 读配置（缓存 10 秒，避免每次评论都读盘） */
export async function readCommentsConfig(): Promise<CommentsConfig> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;

  let value: CommentsConfig = {};
  try {
    value = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8')) || {};
  } catch {
    value = {};   // 文件还不存在（控制台没填过）→ 什么都不启用
  }

  cache = { at: Date.now(), value };
  return value;
}

/** 合并环境变量（环境变量优先，方便临时覆盖） */
export function merged(conf: CommentsConfig) {
  return {
    githubToken: process.env.GITHUB_COMMENTS_TOKEN || conf.githubToken || '',
    notifyWebhook: process.env.COMMENTS_NOTIFY_WEBHOOK || conf.notifyWebhook || '',
    notifyServerChan: process.env.COMMENTS_NOTIFY_SERVERCHAN || conf.notifyServerChan || '',
    notifyBark: process.env.COMMENTS_NOTIFY_BARK || conf.notifyBark || '',
    notifyTelegram: process.env.COMMENTS_NOTIFY_TELEGRAM || '',
  };
}
