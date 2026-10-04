import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 🎵 首页歌单（**服务端只读**，请求时读，绝不会进前端产物）。
 *
 * 放在 `data/music-config.json` ✓ —— 控制台的音乐设置保存时写进来 ✓
 *
 * 为什么不能继续用 `siteConfig.cloudMusicIds`：
 *   客户端组件只要 import 了 siteConfig，那个数组就被**打进 JS chunk**，
 *   于是加一首歌必须重新构建才生效（"更新本地"并不构建），
 *   表现就是「控制台里明明加上了，页面上还是那几首」。
 *   所以改成：客户端请求 /api/music（不带参数）→ 服务端在这里读文件。
 *   访客的请求数一个都没多 —— 还是同一个 /api/music，只是少带了一个参数 ✓
 *
 * 文件长这样（控制台自动写，别手改也行）：
 *   { "cloudMusicIds": ["406232", "478507889"] }
 */

const CONFIG_FILE = path.join(process.cwd(), 'data', 'music-config.json');

let cache: { at: number; value: string[] } | null = null;

/** 读歌单（缓存 10 秒，避免每次请求都读盘） */
export async function readMusicIds(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;

  let value: string[] = [];
  try {
    // 去掉 BOM：有些编辑器（记事本）写出来的 JSON 会在开头带 \uFEFF，
    // JSON.parse 见到它会直接抛错 —— 那就白改了，所以先剥掉。
    const text = (await fs.readFile(CONFIG_FILE, 'utf8')).replace(/^\uFEFF/, '');
    const raw = JSON.parse(text);
    // 兼容两种写法：直接是个数组，或者 { cloudMusicIds: [...] }
    const list = Array.isArray(raw) ? raw : raw?.cloudMusicIds;
    if (Array.isArray(list)) {
      value = list.map((item: unknown) => String(item).trim()).filter(Boolean);
    }
  } catch {
    value = [];   // 文件还没生成（控制台没保存过）→ 交给调用方走构建时配置兜底
  }

  cache = { at: Date.now(), value };
  return value;
}
