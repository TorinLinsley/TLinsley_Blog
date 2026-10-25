import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

const ROOT = process.cwd();

const CONTENT_ROUTES = [
  '/',
  '/timeline',
  '/chatter',
  '/moments',
  '/photowall',
  '/music',
  '/projects',
  '/friends',
  '/about',
  '/posts/[slug]',
  '/chatter/[slug]',
  '/resources/[[...path]]',
  '/tools/[...file]',
];

let lastRev = '';

function purgeContentCache() {
  for (const route of CONTENT_ROUTES) {
    try {
      revalidatePath(route, 'page');
    } catch {
    }
  }
}

const WATCH_DIRS = ['resources', 'posts', 'chatters', 'moments'];
const WATCH_FILES = [path.join('app', 'about', 'about.md')];

function collect(dir: string, prefix: string, out: string[]) {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  names.sort();

  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(`D|${rel}`);
      collect(full, rel, out);
    } else {
      out.push(`F|${rel}|${st.mtimeMs}|${st.size}`);
    }
  }
}

export async function GET() {
  const parts: string[] = [];

  for (const d of WATCH_DIRS) {
    collect(path.join(ROOT, d), d, parts);
  }
  for (const f of WATCH_FILES) {
    const full = path.join(ROOT, f);
    try {
      const st = fs.statSync(full);
      parts.push(`F|${f}|${st.mtimeMs}|${st.size}`);
    } catch {
    }
  }

  const rev = crypto.createHash('md5').update(parts.join('\n')).digest('hex');

  if (rev !== lastRev) {
    lastRev = rev;
    purgeContentCache();
  }

  return NextResponse.json(
    { rev, files: parts.length },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  );
}