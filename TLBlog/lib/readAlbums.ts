import fs from 'node:fs';
import path from 'node:path';
import type { Album } from '../data/albums';

/**
 * 🖼️ 按请求读 `data/albums.ts`，不要 `import { albums }`。
 *
 * 为什么：`data/*.ts` 是**构建时打包进产物**的 —— 控制台【同步Blog】把新相册写进文件之后，
 * 已经 build 好的站点读到的还是编译那一刻的快照，表现就是
 * 「控制台里相册明明加上了，博客前台死活不显示」，非得重新 build 一次才认。
 * 所以相册这类会变的数据统一走这里：文件是唯一真相，`force-dynamic` 页面每次请求都读一遍。
 *
 * 解析方式故意跟控制台后端（cms_core/api/data_ts.py）保持一致：
 * 从 `export const albums: Album[] = [ ... ];` 里把数组抠出来 JSON.parse。
 */
export function readAlbums(): Album[] {
  try {
    const file = path.join(process.cwd(), 'data', 'albums.ts');
    const text = fs.readFileSync(file, 'utf8');
    const match = /export\s+const\s+albums\s*(?::[^=]*)?=\s*(\[[\s\S]*\])\s*;?/.exec(text);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    return Array.isArray(data) ? (data as Album[]) : [];
  } catch {
    // 文件不存在 / 格式坏了 → 当作空相册，页面自己会显示"还没有相册"
    return [];
  }
}
