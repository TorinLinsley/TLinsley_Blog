#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'posts',
  'chatters',
  'moments',
  'resources',
  'tools',
]);

const EXCLUDE_FILES = new Set(['.code-hash', '.lock-hash']);

const root = process.argv[2] || process.cwd();

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) walk(full);
      continue;
    }
    if (EXCLUDE_FILES.has(entry.name)) continue;
    const rel = './' + relative(root, full).split(sep).join('/');
    if (rel.startsWith('./public/uploads/')) continue;
    files.push(rel);
  }
})(root);

files.sort();

const manifest = files
  .map((f) => `${createHash('md5').update(readFileSync(join(root, f))).digest('hex')}  ${f}`)
  .join('\n');

process.stdout.write(createHash('md5').update(manifest).digest('hex') + '\n');