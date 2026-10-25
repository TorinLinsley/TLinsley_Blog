import fs from 'node:fs';
import path from 'node:path';
import type { Album } from '../data/albums';

export function readAlbums(): Album[] {
  try {
    const file = path.join(process.cwd(), 'data', 'albums.ts');
    const text = fs.readFileSync(file, 'utf8');
    const match = /export\s+const\s+albums\s*(?::[^=]*)?=\s*(\[[\s\S]*\])\s*;?/.exec(text);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    return Array.isArray(data) ? (data as Album[]) : [];
  } catch {
    return [];
  }
}