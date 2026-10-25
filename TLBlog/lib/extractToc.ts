export type TocItem = {
  level: number;
  text: string;
  id: string;
};

export function extractToc(content: string): TocItem[] {
  const toc: TocItem[] = [];
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');

  let fence: string | null = null;

  for (const line of lines) {
    const fenceHit = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceHit) {
      const marker = fenceHit[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;

    const text = m[2].replace(/\s+#+\s*$/, '').trim();
    if (!text) continue;

    toc.push({
      level: m[1].length,
      text,
      id: text.toLowerCase().replace(/\s+/g, '-'),
    });
  }

  return toc;
}