import fs from 'node:fs/promises';
import path from 'node:path';


const CONFIG_FILE = path.join(process.cwd(), 'data', 'music-config.json');

let cache: { at: number; value: string[] } | null = null;

export async function readMusicIds(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;

  let value: string[] = [];
  try {
    const text = (await fs.readFile(CONFIG_FILE, 'utf8')).replace(/^\uFEFF/, '');
    const raw = JSON.parse(text);
    const list = Array.isArray(raw) ? raw : raw?.cloudMusicIds;
    if (Array.isArray(list)) {
      value = list.map((item: unknown) => String(item).trim()).filter(Boolean);
    }
  } catch {
    value = [];
  }

  cache = { at: Date.now(), value };
  return value;
}