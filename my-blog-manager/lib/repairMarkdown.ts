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
  const UNORDERED = /^[-*+][ \t]+/;
  const HEADING = /^#{1,6}[ \t]+/;
  const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
  const lines = String(md || '').split('\n');
  let fence = '';
  let last = 0;
  let resumable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(FENCE);
    if (f) {
      const ch = f[1].charAt(0);
      fence = fence === ch ? '' : fence || ch;
      last = 0;
      resumable = false;
      continue;
    }
    if (fence) continue;
    const o = line.match(ORDERED);
    if (o) {
      let n = parseInt(o[1], 10);
      if (resumable && last > 0) {
        const want = last + 1;
        if (n !== want) {
          lines[i] = `${want}${o[2]}${o[3]}${o[4]}`;
          n = want;
        }
      }
      last = n;
      resumable = true;
      continue;
    }
    if (HEADING.test(line) || HR.test(line) || UNORDERED.test(line)) {
      last = 0;
      resumable = false;
      continue;
    }
    if (line.trim() === '' || /^[ \t]/.test(line)) continue;
    resumable = true;
  }
  return lines.join('\n');
}

export function repairBoldQuotes(md: string): string {
  const PUNCT = '（(【「『《〈“”"\'‘’，,。；;：:！?？、';
  const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
  const SPAN = /`[^`\n]*`|\*\*([^*\n]*?)\*\*/g;
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
      return line.replace(SPAN, (all, inner?: string) => {
        if (inner === undefined || !inner) return all;
        const starts = PUNCT.includes(inner[0]);
        const ends = PUNCT.includes(inner[inner.length - 1]);
        if (!starts && !ends) return all;
        return '<strong>' + inner + '</strong>';
      });
    })
    .join('\n');
}

export function repairMarkdown(md: string): string {
  return repairEmphasis(repairListMarkers(repairBoldQuotes(continueOrderedLists(md))));
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