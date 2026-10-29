const PUNCT = '[（(【「『《〈“"‘\u2018\u2019，,。；;：:！?？、]';

const PLAIN = '[^*_\\[\\]()<>|`~#\\n]{1,40}?';
const EMPHASIS_BEFORE_CJK = new RegExp(
  '(\\*\\*|__|\\*|_)(' + PLAIN + ')(' + PUNCT + ')(\\1)(?=[\\p{L}\\p{N}])',
  'gu'
);

export function repairEmphasis(md: string): string {
  let out = String(md || '');
  for (let i = 0; i < 10; i++) {
    const next = out.replace(EMPHASIS_BEFORE_CJK, '$1$2$4$3');
    if (next === out) break;
    out = next;
  }
  return out;
}

export function repairListMarkers(md: string): string {
  const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
  let fence = '';
  return String(md || '')
    .split('\n')
    .map((line) => {
      const hit = line.match(FENCE);
      if (hit) {
        const ch = hit[1].charAt(0);
        fence = fence === ch ? '' : fence || ch;
        return line;
      }
      if (fence) return line;
      return line.replace(/^(\d{1,9})\.(?=\S)/, '$1\\.');
    })
    .join('\n');
}

export function continueOrderedLists(md: string): string {
  const ORDERED = /^(\d{1,9})([.)])([ \t]+)(.*)$/;
  const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
  const lines = String(md || '').split('\n');
  let fence = '';
  let group: number[] = [];
  let last = 0;
  const flush = () => {
    if (!group.length) return;
    const nums = group.map((i) => parseInt(lines[i], 10));
    const same = nums.every((n) => n === nums[0]);
    if (same) {
      const start = last > 0 ? last + 1 : nums[0];
      group.forEach((idx, k) => {
        const m = lines[idx].match(ORDERED);
        if (m) lines[idx] = `${start + k}${m[2]}${m[3]}${m[4]}`;
      });
      last = start + group.length - 1;
    } else {
      last = nums[nums.length - 1];
    }
    group = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hit = FENCE.exec(line);
    if (hit) {
      const ch = hit[1].charAt(0);
      fence = fence === ch ? '' : fence || ch;
      flush();
      continue;
    }
    if (fence) continue;
    if (ORDERED.test(line)) {
      group.push(i);
      continue;
    }
    if (line.trim() !== '' && !/^[ \t]/.test(line)) flush();
  }
  flush();
  return lines.join('\n');
}

export function repairBold(md: string): string {
  const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
  const SPAN = /`[^`\n]*`|\*\*([^*]*?)\*\*/g;
  const out: string[] = [];
  let buf: string[] = [];
  let fence = '';
  const flush = () => {
    if (!buf.length) return;
    const text = buf.join('\n');
    buf = [];
    out.push(text.replace(SPAN, (all, inner?: string) => {
      if (inner === undefined) return all;
      if (!inner.trim()) return all;
      return '<strong>' + inner + '</strong>';
    }));
  };
  for (const line of String(md || '').split('\n')) {
    const hit = line.match(FENCE);
    if (hit) {
      flush();
      out.push(line);
      const ch = hit[1].charAt(0);
      fence = fence === ch ? '' : fence || ch;
      continue;
    }
    if (fence) { out.push(line); continue; }
    if (line.trim() === '') { flush(); out.push(line); continue; }
    buf.push(line);
  }
  flush();
  return out.join('\n');
}

function repairBlockquoteLists(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  const itemRe = /^[ \t]*(?:>[ \t]*)+([*+-]|\d{1,9}[.)])(?=\S)(.*)$/;
  const anyItemRe = /^[ \t]*(?:>[ \t]*)+([*+-]|\d{1,9}[.)])[ \t]/;
  for (const line of lines) {
    const hit = itemRe.exec(line);
    if (hit && !hit[2].includes('*') && !hit[2].includes('_')) {
      const prefix = /^[ \t]*(?:>[ \t]*)+/.exec(line)?.[0] ?? '';
      const prev = out.length ? out[out.length - 1] : '';
      if (prev.trim().startsWith('>') && !anyItemRe.test(prev) && prev.trim() !== '>') {
        out.push(prefix.trimEnd());
      }
      out.push(prefix + line.slice(prefix.length));
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function repairTaskLists(md: string): string {
  const cleaned = md.replace(/<span[^>]*>\s*<\/span>/gi, '');
  const lines = cleaned.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const hit = /^(\s*)([*+-])\s*$/.exec(lines[i]);
    if (hit) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j += 1;
      if (j < lines.length && !/^\s*([*+-]|\d+[.)])\s/.test(lines[j])) {
        out.push(`${hit[1]}- [ ] ${lines[j].trim()}`);
        i = j;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

function repairBrokenTasks(md: string): string {
  const zw = /[\u200b\ufeff]/g;
  const spanJunk = /<span[^>]*>\s*<\/span>/gi;
  const src = md.split('\n').map((line) => line.replace(zw, ''));
  const normalized = src.map((line) => (/^\s*\\\*\s*$/.test(line) ? '* ' : line));
  const out: string[] = [];
  const emptyBullet = /^\s*[*+-]\s*$/;
  const isFence = (line: string) => /^\s*```/.test(line);
  const junkFence = (body: string[]) => body.some((line) => /<span[\s>]/.test(line));
  let i = 0;
  while (i < normalized.length) {
    const line = normalized[i];
    if (isFence(line)) {
      let j = i + 1;
      while (j < normalized.length && !isFence(normalized[j])) j += 1;
      const body = normalized.slice(i + 1, j);
      if (junkFence(body)) {
        const text = body
          .map((item) => item.replace(spanJunk, '').trim())
          .filter((item) => item && !/^[+\-*]$/.test(item))
          .join(' ');
        if (text) out.push(`- [ ] ${text}`);
        i = j + 1;
        continue;
      }
      out.push(normalized.slice(i, j + 1).join('\n'));
      i = j + 1;
      continue;
    }
    if (emptyBullet.test(line)) {
      let j = i + 1;
      while (j < normalized.length && normalized[j].trim() === '') j += 1;
      if (j < normalized.length && !emptyBullet.test(normalized[j]) && !isFence(normalized[j]) && !/^\s*#{1,6}\s/.test(normalized[j])) {
        let k = j;
        const parts: string[] = [];
        while (k < normalized.length) {
          const cur = normalized[k];
          if (cur.trim() === '') { k += 1; continue; }
          if (emptyBullet.test(cur) || isFence(cur) || /^\s*#{1,6}\s/.test(cur)) break;
          parts.push(cur.trim());
          k += 1;
        }
        const text = parts.join(' ').replace(spanJunk, '').trim();
        if (text) {
          out.push(`- [ ] ${text}`);
          i = k;
          continue;
        }
      }
    }
    out.push(line);
    i += 1;
  }
  return out.join('\n');
}

export function repairMarkdown(md: string): string {
  return repairEmphasis(repairListMarkers(repairBold(continueOrderedLists(repairBlockquoteLists(repairTaskLists(repairBrokenTasks(md)))))));
}

export function stripInlineMarkdown(text: string): string {
  return String(text || '')
    .replace(/```[^\n]*\n?/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, a, b) => (b || a))
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/^[ \t]*\d+\.[ \t]+/gm, '')
    .replace(/(\*\*|__)([^\n]+?)\1/g, '$2')
    .replace(/\*([^*\n]+?)\*/g, '$1')
    .replace(/(?<=^|[\s(（「【])_([^_\n]+?)_(?=$|[\s)）】」，,。.!?！？])/gm, '$1')
    .replace(/~~([^\n]+?)~~/g, '$1')
    .replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, '$1');
}