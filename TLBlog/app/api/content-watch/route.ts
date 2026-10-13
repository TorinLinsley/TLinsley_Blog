import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

// 内容随时会变，这个接口每次现算，绝不能缓存
export const dynamic = 'force-dynamic';

const ROOT = process.cwd();

/**
 * ⚡ 内容一变 → **当场把前台的静态化（ISR）缓存清掉** ✓
 *
 * 为什么必须加：页面改成 `revalidate = 30` 之后，"先给你旧页、同时在后台重新生成" 是 ISR
 * 的固定行为 ✗ —— 于是控制台改完文章，前台**第一次刷新拿到的还是旧内容**，得等下一次 ✗
 * （用户实测："要等一会再刷新才有变化，不是立即更新"）
 *
 * 现在：下面这个轮询接口一发现 rev 变了，就立刻清掉内容页缓存 ✓
 *   → 紧接着前端那次 `router.refresh()`（见 components/ContentLiveRefresh.tsx）拿到的就是**新内容** ✓
 *   → 手按 F5 也一样：立即是新页 ✓（不用重建、不用等 30 秒 ✓）
 *
 * ⚠️ 只清内容页（文章/杂谈/资源/说说/关于…）✓ 别的页面本来就和内容无关 ✓
 */
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

/** 上一次算出来的内容指纹（每个 Node 进程一份） */
let lastRev = '';

function purgeContentCache() {
  for (const route of CONTENT_ROUTES) {
    try {
      revalidatePath(route, 'page');
    } catch {
      /* 某个路由不认就算了，绝不能影响轮询本身 */
    }
  }
}

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

  // 内容变了（含服务刚起来那一次）→ 清掉内容页缓存，让下一次请求直接拿到新内容 ✓
  if (rev !== lastRev) {
    lastRev = rev;
    purgeContentCache();
  }

  return NextResponse.json(
    { rev, files: parts.length },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  );
}
