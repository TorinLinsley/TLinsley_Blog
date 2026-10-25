
export const CALLOUT_TYPES = [
  'note', 'info', 'tip', 'hint', 'success', 'check', 'done',
  'warning', 'caution', 'attention', 'danger', 'error', 'failure', 'bug',
  'question', 'help', 'faq', 'quote', 'cite', 'example', 'abstract', 'summary', 'todo',
];

export const CALLOUT_MARKER = /^\s*\[!\s*([A-Za-z0-9_-]+)\s*\]\s*[-+]?/;

const kindOf = (el: Element): string => {
  const explicit = (el.getAttribute('data-callout') || '').toLowerCase();
  if (explicit) return explicit;
  const cls = (el.getAttribute('class') || '').match(/callout-([A-Za-z0-9_-]+)/);
  return cls ? cls[1].toLowerCase() : 'note';
};

export function calloutDivsToBlockquotes(root: ParentNode): void {
  const doc = (root as Element).ownerDocument || document;
  for (let round = 0; round < 5; round += 1) {
    const divs = Array.from(root.querySelectorAll('div.callout'));
    if (!divs.length) return;
    divs.forEach((div) => {
      if (!div.isConnected && !root.contains(div)) return;
      const kind = kindOf(div);
      const titleEl = div.querySelector('.callout-title');
      const title = (titleEl?.querySelector('.callout-title-text')?.textContent
        || titleEl?.textContent
        || '').replace(/\s+/g, ' ').trim();

      const bq = doc.createElement('blockquote');
      const first = doc.createElement('p');
      first.textContent = title ? `[!${kind}] ${title}` : `[!${kind}]`;
      bq.appendChild(first);

      const body = div.querySelector('.callout-body');
      const nodes = body ? Array.from(body.children) : Array.from(div.children).filter((c) => !c.classList.contains('callout-title'));
      nodes.forEach((child) => bq.appendChild(child));

      div.replaceWith(bq);
    });
  }
}

export function calloutBlockquotesToHtml(html: string, icons: Record<string, string>, fallbackIcon: string): string {
  return html.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (whole, inner: string) => {
    const pMatch = inner.match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>/i);
    if (!pMatch) return whole;
    const firstText = pMatch[1].replace(/<[^>]+>/g, '');
    const marker = firstText.match(CALLOUT_MARKER);
    if (!marker) return whole;
    const kind = marker[1].toLowerCase();
    if (!CALLOUT_TYPES.includes(kind)) return whole;

    const restHtml = pMatch[1].replace(/^\s*\[!\s*[A-Za-z0-9_-]+\s*\]\s*[-+]?\s*/, '');
    const titleLine = restHtml.split(/<br\s*\/?>/i)[0].replace(/<[^>]+>/g, '').trim() || kind;
    const afterBr = restHtml.split(/<br\s*\/?>/i).slice(1).join('<br>').trim();
    const restBlocks = inner.slice(pMatch[0].length);
    const body = (afterBr ? `<p>${afterBr}</p>` : '') + restBlocks;

    const icon = icons[kind] || fallbackIcon;
    return `<div class="callout callout-${kind} not-prose" data-callout="${kind}">`
      + `<div class="callout-title"><span class="callout-icon">${icon}</span>`
      + `<span class="callout-title-text">${titleLine}</span></div>`
      + `<div class="callout-body">${body}</div>`
      + '</div>';
  });
}