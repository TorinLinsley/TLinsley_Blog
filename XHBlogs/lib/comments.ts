import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * 💬 自建评论的存储层（**用 JSON 文件，不用数据库**）。
 *
 * 为什么不继续用 Gitalk：它必须走 GitHub 登录 + 拉 GitHub 的 JS/CSS，
 * 访客没账号就发不了、加载还慢。这里换成"自己的文件 + 自己的接口"：
 *   · 谁都能评论（不用注册、不用登录、不碰 GitHub）✓
 *   · 评论就是 `data/comments/*.json` ✓ 备份/迁移直接拷文件 ✓
 *   · 同源接口，没有第三方 JS，加载快 ✓
 *
 * ⚠️ 目录是运行时按需创建的（`data/comments/`），部署包和同步都不会碰它 ✓
 *    （同步只覆盖 siteConfig / albums / projects / friends 那几个文件 ✓）
 */

export type GuestComment = {
  id: string;
  /** 页面标识：就是路由 pathname，如 /posts/post_1790607301 */
  page: string;
  /** 昵称，可空（显示成"匿名游客"） */
  name: string;
  /** 内容（纯文本，换行原样保留；不做 markdown 解析，避免 XSS） */
  content: string;
  /** 毫秒时间戳 */
  createdAt: number;
};

const COMMENTS_DIR = path.join(process.cwd(), 'data', 'comments');

/**
 * 🗜️ 每一页最多留这么多条（超出就把最旧的挤掉）。
 *
 * 评论是纯文本，一条大约 200–300 字节：500 条 ≈ 150 KB，
 * 就算 100 个页面全塞满也就 15 MB 左右 —— 对磁盘几乎没影响 ✓
 * 这个上限纯粹是兜底，防止有人脚本刷屏把文件撑大 ✓
 */
const MAX_PER_PAGE = 500;

/** 页面路径 → 文件名：可读的 slug + 一段短哈希（防止不同路径撞名） */
function fileForPage(page: string): string {
  const slug = page
    .replace(/^\/+/, '')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'index';
  const hash = crypto.createHash('sha1').update(page).digest('hex').slice(0, 8);
  return path.join(COMMENTS_DIR, `${slug}-${hash}.json`);
}

/** 页面标识合法性：必须是本站内的绝对路径（挡住 ../ 之类） */
export function isValidPage(page: unknown): page is string {
  return (
    typeof page === 'string' &&
    page.startsWith('/') &&
    page.length <= 200 &&
    !page.includes('..') &&
    !page.includes('//') &&
    !page.includes('\0')
  );
}

/** 读某一页的评论（按时间正序；文件不存在就是空） */
export async function readComments(page: string): Promise<GuestComment[]> {
  try {
    const raw = await fs.readFile(fileForPage(page), 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((c) => c && typeof c.content === 'string')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch {
    return [];
  }
}

/** 整体覆盖保存（先写临时文件再改名，避免写一半被读到） */
export async function writeComments(page: string, list: GuestComment[]): Promise<void> {
  await fs.mkdir(COMMENTS_DIR, { recursive: true });
  const target = fileForPage(page);
  const tmp = `${target}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

/** 追加一条评论并落盘（先写临时文件再改名，避免写一半被读到） */
export async function appendComment(
  page: string,
  name: string,
  content: string
): Promise<GuestComment> {
  const comment: GuestComment = {
    id: crypto.randomBytes(6).toString('hex'),
    page,
    name,
    content,
    createdAt: Date.now(),
  };

  // 超过上限就把最旧的挤掉（只留最新 MAX_PER_PAGE 条）
  const list = (await readComments(page)).slice(-(MAX_PER_PAGE - 1));
  list.push(comment);

  await writeComments(page, list);

  return comment;
}

/** 删一条（管理用；key 为空时调用方应该直接拒绝） */
export async function deleteComment(page: string, id: string): Promise<boolean> {
  const list = await readComments(page);
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;

  await writeComments(page, next);
  return true;
}
