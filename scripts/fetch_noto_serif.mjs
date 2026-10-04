/**
 * 把 Google Fonts 的 Noto Serif SC **整套分片 woff2** 下到本地并生成 @font-face 的 CSS。
 *
 * 为什么要这么干：next/font/google 在**每次 build** 时都会去 fonts.gstatic.com 拉
 * 101 个分片文件（Noto Serif SC 有 101 个 unicode-range 子集）。服务器网络抖一下，
 * build 就报 "next/font/google queries have exactly one entry" ✗ —— 这正是反复出现的那个错。
 * 下到本地 + 自己写 @font-face，build 就**完全不碰 Google** 了 ✓
 * （unicode-range 原样保留 → 浏览器还是只下它真正用到的那几个分片，速度不变 ✓）
 *
 * 用法：node fetch_noto_serif.mjs <应用目录>
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const APP_DIR = process.argv[2];
if (!APP_DIR) {
  console.error('用法: node fetch_noto_serif.mjs <应用目录>');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const API = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400..900&display=swap';
const OUT_FONT_DIR = path.join(APP_DIR, 'public', 'fonts', 'noto-serif-sc');
const OUT_CSS = path.join(APP_DIR, 'app', 'noto-serif-sc.css');

await fs.mkdir(OUT_FONT_DIR, { recursive: true });

const css = await (await fetch(API, { headers: { 'User-Agent': UA } })).text();
const blocks = css.match(/@font-face\s*\{[^}]*\}/g) || [];
console.log(`拿到 ${blocks.length} 个 @font-face`);

let i = 0;
let total = 0;
const out = [
  '/* ⚠️ 这个文件是脚本生成的（scripts/fetch_noto_serif.mjs），别手改！',
  ' * 内容 = Noto Serif SC 的 101 个 unicode-range 分片，全部本地自托管：',
  ' *   · build 时不再联网拉 Google Fonts（那会拉 101 个文件，网络一抖 build 就挂 ✗）',
  ' *   · unicode-range 原样保留 → 浏览器仍然只下用到的分片，加载速度不变 ✓',
  ' */',
  '',
];

for (const block of blocks) {
  const url = block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
  if (!url) continue;
  i += 1;
  const name = `noto-serif-sc-${String(i).padStart(3, '0')}.woff2`;
  const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
  await fs.writeFile(path.join(OUT_FONT_DIR, name), buf);
  total += buf.length;
  out.push(block.replace(url, `/fonts/noto-serif-sc/${name}`));
  out.push('');
}

await fs.writeFile(OUT_CSS, out.join('\n'), 'utf8');
console.log(`下好 ${i} 个分片，共 ${(total / 1024 / 1024).toFixed(2)} MB`);
console.log(`字体目录: ${OUT_FONT_DIR}`);
console.log(`CSS 文件: ${OUT_CSS}`);
