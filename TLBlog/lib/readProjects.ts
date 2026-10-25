import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../data/projects';

export function readProjects(): Project[] {
  try {
    const file = path.join(process.cwd(), 'data', 'projects.ts');
    const text = fs.readFileSync(file, 'utf8');
    const match = /export\s+const\s+projectsData\s*(?::[^=]*)?=\s*(\[[\s\S]*\])\s*;?/.exec(text);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    return Array.isArray(data) ? (data as Project[]) : [];
  } catch {
    return [];
  }
}