#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const INDENT = '  ';

const TARGETS = [
  { name: '控制台', file: 'my-blog-manager/siteConfig.ts' },
  { name: '前台  ', file: 'TLBlog/siteConfig.ts' },
];

function topLevelKeys(text) {
  const start = text.indexOf('export const siteConfig');
  if (start === -1) return null;

  const keys = new Set();
  const re = new RegExp(`^${INDENT}([A-Za-z_$][\\w$]*)\\s*:`, 'gm');
  const end = text.indexOf('\n};', start);
  const body = text.slice(start, end === -1 ? text.length : end);

  let m;
  while ((m = re.exec(body)) !== null) keys.add(m[1]);
  return keys;
}

const loaded = TARGETS.map((t) => {
  const file = path.join(ROOT, t.file);
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

  const MANAGER_ONLY = new Set(['picBedName', 'picBedUrl', 'picBedToken']);

  const onlyA = [...a.keys].filter((k) => !b.keys.has(k) && !MANAGER_ONLY.has(k));
  const onlyB = [...b.keys].filter((k) => !a.keys.has(k));

  if (onlyA.length === 0 && onlyB.length === 0) {
    console.log(`✅ 两边顶层配置项一致（已忽略控制台独有项：${[...MANAGER_ONLY].join(', ')}）\n`);
  } else {
    bad = true;
    if (onlyA.length) console.log(`❌ 只在【${a.name.trim()}】里有：${onlyA.join(', ')}`);
    if (onlyB.length) console.log(`❌ 只在【${b.name.trim()}】里有：${onlyB.join(', ')}`);
    console.log('\n👉 补到另一份文件里（位置随意，保持缩进 2 空格就行），再跑一次本脚本。\n');
  }
}

process.exit(bad ? 1 : 0);