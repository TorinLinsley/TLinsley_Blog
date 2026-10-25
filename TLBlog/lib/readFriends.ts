import fs from 'node:fs';
import path from 'node:path';
import { friendsData, type Friend } from '../data/friends';

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