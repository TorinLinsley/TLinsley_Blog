
type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

const wrap = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<string, string> = {
  note: wrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/>'),
  tip: wrap('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z"/>'),
  hint: wrap('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z"/>'),
  success: wrap('<path d="M20 6 9 17l-5-5"/>'),
  check: wrap('<path d="M20 6 9 17l-5-5"/>'),
  done: wrap('<path d="M20 6 9 17l-5-5"/>'),
  warning: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  caution: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  attention: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  danger: wrap('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>'),
  error: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  failure: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  bug: wrap('<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>'),
  question: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  help: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  faq: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  quote: wrap('<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M15 7h2v4a4 4 0 0 1-4 4"/>'),
  cite: wrap('<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M15 7h2v4a4 4 0 0 1-4 4"/>'),
  example: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  abstract: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  summary: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  todo: wrap('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>'),
};

const DEFAULT_ICON = ICONS.note;

function textOf(node: HastNode): string {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (Array.isArray(node.children)) return node.children.map(textOf).join('');
  return '';
}

function parseMarker(node: HastNode): { type: string; title: string } | null {
  if (!node || node.type !== 'element' || node.tagName !== 'p') return null;
  const text = textOf(node);
  const match = text.match(/^\s*\[!\s*([A-Za-z0-9_-]+)\s*\]\s*([-+]?)\s*([\s\S]*)$/);
  if (!match) return null;
  const type = match[1].toLowerCase();
  const titleLine = (match[3] || '').split('\n')[0].trim();
  const title = titleLine || type.charAt(0).toUpperCase() + type.slice(1);
  return { type, title };
}

function firstParagraphBody(node: HastNode): HastNode | null {
  const kids = (node.children || []).slice();
  let idx = -1;
  for (let i = 0; i < kids.length; i += 1) {
    if (kids[i].type === 'text' && kids[i].value) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;

  const rest = (kids[idx].value || '')
    .replace(/^\s*\[!\s*[A-Za-z0-9_-]+\s*\]\s*[-+]?\s*[^\n]*/, '')
    .replace(/^\n+/, '');

  const tail = kids.slice(idx + 1);
  while (tail.length && tail[0].type === 'element' && tail[0].tagName === 'br') tail.shift();

  const body: HastNode[] = [];
  if (rest.trim()) body.push({ type: 'text', value: rest });
  body.push(...tail);

  const hasContent = body.some((n) => (n.type === 'text' ? (n.value || '').trim() !== '' : true));
  if (!hasContent) return null;

  return { type: 'element', tagName: 'p', properties: {}, children: body };
}

function splitMultiCallouts(bq: HastNode): HastNode[] {
  const kids = bq.children || [];
  const markerIdx: number[] = [];
  kids.forEach((child, i) => {
    if (child.type === 'element' && child.tagName === 'p' && parseMarker(child)) markerIdx.push(i);
  });
  if (markerIdx.length <= 1) return [bq];

  const out: HastNode[] = [];
  const clone = (children: HastNode[]): HastNode => ({ ...bq, children });

  if (markerIdx[0] > 0) out.push(clone(kids.slice(0, markerIdx[0])));
  markerIdx.forEach((start, k) => {
    const end = k + 1 < markerIdx.length ? markerIdx[k + 1] : kids.length;
    out.push(clone(kids.slice(start, end)));
  });
  return out;
}

export default function rehypeCallout() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node || typeof node !== 'object') return;

      if (Array.isArray(node.children)) {
        const expanded: HastNode[] = [];
        node.children.forEach((child) => {
          if (child && child.type === 'element' && child.tagName === 'blockquote') {
            expanded.push(...splitMultiCallouts(child));
          } else {
            expanded.push(child);
          }
        });
        node.children = expanded;
        node.children.forEach(walk);
      }

      if (node.type === 'element' && node.tagName === 'blockquote' && Array.isArray(node.children)) {
        const firstP = node.children.find((child) => child.type === 'element' && child.tagName === 'p');
        const marker = firstP ? parseMarker(firstP) : null;

        if (marker && firstP) {
          const remainder = firstParagraphBody(firstP);
          const bodyChildren = [
            ...(remainder ? [remainder] : []),
            ...node.children.filter((child) => child !== firstP),
          ];

          node.tagName = 'div';
          node.properties = {
            className: ['callout', `callout-${marker.type}`, 'not-prose'],
            'data-callout': marker.type,
          };
          node.children = [
            {
              type: 'element',
              tagName: 'div',
              properties: { className: ['callout-title'] },
              children: [
                { type: 'raw', value: `<span class="callout-icon">${ICONS[marker.type] || DEFAULT_ICON}</span>` } as HastNode,
                { type: 'element', tagName: 'span', properties: { className: ['callout-title-text'] }, children: [{ type: 'text', value: marker.title }] },
              ],
            },
            {
              type: 'element',
              tagName: 'div',
              properties: { className: ['callout-body'] },
              children: bodyChildren,
            },
          ];
          return;
        }
      }

    };

    walk(tree);
  };
}