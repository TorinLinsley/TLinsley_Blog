#!/usr/bin/env node
/**
 * 🧾 算一个项目目录的「代码指纹」。
 *
 * 用途：启动脚本靠它判断"要不要重新构建"。判断标准和服务器那份
 * `deploy/linux/rebuild-if-needed.sh` **完全一致**：
 *
 *   · posts / chatters / moments / resources / tools / public/uploads
 *     → 这些页面是 force-dynamic，请求时直接读磁盘，改它们**不用重建** ✓
 *   · 代码、样式、data/*.ts、siteConfig.ts、package.json
 *     → 这些是构建时打进产物的，改了**必须重建** ✓
 *
 * ⚠️ 一定要把 `.code-hash` / `.lock-hash` 自己排除掉：
 *    它们就存在项目根目录里，算进去的话"写完指纹文件 → 指纹变了 → 下次又重建"，
 *    会变成每次启动都构建一遍（服务器那版早期就踩过这个坑）。
 *
 * 用法：
 *   node scripts/code-hash.mjs XHBlogs
 *   node scripts/code-hash.mjs my-blog-manager
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** 这些目录是"运行时读盘"的内容，不算代码 */
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'posts',
  'chatters',
  'moments',
  'resources',
  'tools',
]);

/** 这些文件是脚本自己的状态，绝不能算进指纹 */
const EXCLUDE_FILES = new Set(['.code-hash', '.lock-hash']);

const root = process.argv[2] || process.cwd();

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) walk(full);
      continue;
    }
    if (EXCLUDE_FILES.has(entry.name)) continue;
    const rel = './' + relative(root, full).split(sep).join('/');
    if (rel.startsWith('./public/uploads/')) continue; // 上传的图片不是代码
    files.push(rel);
  }
})(root);

files.sort();

// 与 rebuild-if-needed.sh 一样：先对每个文件取 md5（内容 + 路径），再对整张清单取一次 md5
const manifest = files
  .map((f) => `${createHash('md5').update(readFileSync(join(root, f))).digest('hex')}  ${f}`)
  .join('\n');

process.stdout.write(createHash('md5').update(manifest).digest('hex') + '\n');
