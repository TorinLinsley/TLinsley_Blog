import fs from 'node:fs';
import path from 'node:path';
import { friendsData, type Friend } from '../data/friends';

/**
 * 🤝 按请求读 `data/friends.ts`，不要直接 `import { friendsData }`。
 *
 * 为什么：`data/*.ts` 是**构建时打包进产物**的 —— 控制台【同步Blog】把新的友链写进文件之后，
 * 已经 build 好的站点读到的还是编译那一刻的快照，表现就是
 * 「控制台里友链删掉了、也同步过去了，博客前台死活还在」，非得重新 build 一次才认。
 * 所以友链统一走这里：文件是唯一真相，`force-dynamic` 页面每次请求都读一遍。
 *
 * 解析方式故意跟相册（lib/readAlbums.ts）和控制台后端（cms_core/api/data_ts.py）保持一致：
 * 从 `export const friendsData: Friend[] = [ ... ];` 里把数组抠出来 JSON.parse。
 *
 * 兜底策略跟相册不同：文件读不到 / 格式坏了 → 回落到编译进来那份快照。
 * （相册坏了显示"还没有相册"无所谓，友链列表被弄空就太难看了。）
 */
export function readFriends(): Friend[] {
  try {
    const file = path.join(process.cwd(), 'data', 'friends.ts');
    const text = fs.readFileSync(file, 'utf8');
    const match = /export\s+const\s+friendsData\s*(?::[^=]*)?=\s*(\[[\s\S]*\])\s*;?/.exec(text);
    if (!match) return friendsData;
    const data = JSON.parse(match[1]);
    return Array.isArray(data) ? (data as Friend[]) : friendsData;
  } catch {
    return friendsData;
  }
}
