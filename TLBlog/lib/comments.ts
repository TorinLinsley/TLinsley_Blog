import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';


export type GuestComment = {
  id: string;
  page: string;
  name: string;
  content: string;
  createdAt: number;
};

const COMMENTS_DIR = path.join(process.cwd(), 'data', 'comments');

const MAX_PER_PAGE = 500;

function fileForPage(page: string): string {
  const slug = page
    .replace(/^\/+/, '')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'index';
  const hash = crypto.createHash('sha1').update(page).digest('hex').slice(0, 8);
  return path.join(COMMENTS_DIR, `${slug}-${hash}.json`);
}

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

export async function writeComments(page: string, list: GuestComment[]): Promise<void> {
  await fs.mkdir(COMMENTS_DIR, { recursive: true });
  const target = fileForPage(page);
  const tmp = `${target}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

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

  const list = (await readComments(page)).slice(-(MAX_PER_PAGE - 1));
  list.push(comment);

  await writeComments(page, list);

  return comment;
}

export async function deleteComment(page: string, id: string): Promise<boolean> {
  const list = await readComments(page);
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;

  await writeComments(page, next);
  return true;
}