#!/usr/bin/env node
/**
 * 🧭 双端 siteConfig.ts 一致性检查（**只报告，不改文件**）
 *
 * 为什么需要：`my-blog-manager/siteConfig.ts`（控制台）和 `TLBlog/siteConfig.ts`（前台）
 * 是**两份独立的文件**。同一个配置项必须两边都有，否则会出现那种很迷惑的现象：
 * 「控制台里改了，前台怎么不生效」—— 其实是改到了另一份文件上。
 *
 * 这个脚本把两份文件的**顶层配置项**列出来对比，缺哪边就报哪边，缺了就退出码 1（可以接进 CI）。
 *
 * 用法（在项目根目录）：
 *   node scripts/checkConfig.mjs
 *
 * ⚠️ 它按「缩进 2 个空格 = 顶层配置项」来认（这两份文件都是这个风格）；
 *    如果你把 siteConfig.ts 重新格式化成别的缩进，改一下 INDENT 常量即可。
 */
import fs from 'node:fs';
import path from 'node:path';

const INDENT = '  ';

const TARGETS = [
  { name: '控制台', file: 'my-blog-manager/siteConfig.ts' },
  { name: '前台  ', file: 'TLBlog/siteConfig.ts' },
];

/** 抠出 `export const siteConfig = { ... }` 里的顶层键 */
function topLevelKeys(text) {
  const start = text.indexOf('export const siteConfig');
  if (start === -1) return null;

  const keys = new Set();
  const re = new RegExp(`^${INDENT}([A-Za-z_$][\\w$]*)\\s*:`, 'gm');
  // 只扫到 siteConfig 那个对象的结尾（第一个顶格的 `};`）
  const end = text.indexOf('\n};', start);
  const body = text.slice(start, end === -1 ? text.length : end);

  let m;
  while ((m = re.exec(body)) !== null) keys.add(m[1]);
  return keys;
}

const loaded = TARGETS.map((t) => {
  const file = path.resolve(t.file);
  if (!fs.existsSync(file)) return { ...t, keys: null };
  return { ...t, keys: topLevelKeys(fs.readFileSync(file, 'utf8')) };
});

console.log('\n🧭 siteConfig.ts 双端一致性检查\n');

let bad = false;

for (const t of loaded) {
  if (!t.keys) {
    console.log(`⚠️  ${t.name}  找不到 ${t.file}（跳过）`);
    bad = true;
  }
}

if (!bad) {
  const [a, b] = loaded;
  console.log(`   ${a.name}  ${a.file}  → ${a.keys.size} 项`);
  console.log(`   ${b.name}  ${b.file}  → ${b.keys.size} 项\n`);

  const onlyA = [...a.keys].filter((k) => !b.keys.has(k));
  const onlyB = [...b.keys].filter((k) => !a.keys.has(k));

  if (onlyA.length === 0 && onlyB.length === 0) {
    console.log('✅ 两边顶层配置项完全一致。\n');
  } else {
    bad = true;
    if (onlyA.length) console.log(`❌ 只在【${a.name.trim()}】里有：${onlyA.join(', ')}`);
    if (onlyB.length) console.log(`❌ 只在【${b.name.trim()}】里有：${onlyB.join(', ')}`);
    console.log('\n👉 补到另一份文件里（位置随意，保持缩进 2 空格就行），再跑一次本脚本。\n');
  }
}

process.exit(bad ? 1 : 0);
