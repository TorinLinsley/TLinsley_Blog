import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';

// 内容随时会变，这个接口每次现算，绝不能缓存
export const dynamic = 'force-dynamic';

const ROOT = process.cwd();

/**
 * 这些是「运行时读文件」的内容源 —— 控制台改完之后会自动同步过来，
 * 前台只要重新请求就能拿到新内容（不用重新构建）。
 * 注意：相册 / 友链 / 项目那几个页面是构建时 import 进去的，不在此列。
 */
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
    if (name.startsWith('.')) continue; // 内部文件不算
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
      /* 文件不在就跳过 */
    }
  }

  const rev = crypto.createHash('md5').update(parts.join('\n')).digest('hex');
  return NextResponse.json(
    { rev, files: parts.length },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  );
}
