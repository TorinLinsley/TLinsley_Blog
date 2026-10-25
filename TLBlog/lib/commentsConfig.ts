import fs from 'node:fs/promises';
import path from 'node:path';


export type CommentsConfig = {
  githubToken?: string;
  notifyWebhook?: string;
  notifyServerChan?: string;
  notifyBark?: string;
};

const CONFIG_FILE = path.join(process.cwd(), 'data', 'comments-config.json');

let cache: { at: number; value: CommentsConfig } | null = null;

export async function readCommentsConfig(): Promise<CommentsConfig> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;

  let value: CommentsConfig = {};
  try {
    value = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8')) || {};
  } catch {
    value = {};
  }

  cache = { at: Date.now(), value };
  return value;
}

export function merged(conf: CommentsConfig) {
  return {
    githubToken: process.env.GITHUB_COMMENTS_TOKEN || conf.githubToken || '',
    notifyWebhook: process.env.COMMENTS_NOTIFY_WEBHOOK || conf.notifyWebhook || '',
    notifyServerChan: process.env.COMMENTS_NOTIFY_SERVERCHAN || conf.notifyServerChan || '',
    notifyBark: process.env.COMMENTS_NOTIFY_BARK || conf.notifyBark || '',
    notifyTelegram: process.env.COMMENTS_NOTIFY_TELEGRAM || '',
  };
}