
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
  danger: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  error: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  failure: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  bug: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
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

export { ICONS as CALLOUT_ICONS, DEFAULT_ICON as CALLOUT_DEFAULT_ICON };

function textOf(node: HastNode): string {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (Array.isArray(node.children)) return node.children.map(textOf).join('');
  return '';
}

function parseMarker(node: HastNode): { type: string; title: string } | null {
  if (!node || node.type !== 'element' || node.tagName !== 'p') return null;
  const text = textOf(node);
  const match = text.match(/^\s*\[!\s*([A-Za-z0-9_-]+)\s*\]\s*([-+]?)\s*(.*)$/);
  if (!match) return null;
  const type = match[1].toLowerCase();
  const title = (match[3] || '').trim() || type.charAt(0).toUpperCase() + type.slice(1);
  return { type, title };
}

function stripMarker(node: HastNode): HastNode[] {
  const children = (node.children || []).slice();
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child.type === 'text' && child.value) {
      const replaced = child.value.replace(/^\s*\[!\s*[A-Za-z0-9_-]+\s*\]\s*[-+]?\s*/, '');
      children[i] = { ...child, value: replaced };
      break;
    }
  }
  return children.filter((child) => !(child.type === 'text' && (child.value || '').trim() === ''));
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
      }

      if (node.type === 'element' && node.tagName === 'blockquote' && Array.isArray(node.children)) {
        const firstP = node.children.find((child) => child.type === 'element' && child.tagName === 'p');
        const marker = firstP ? parseMarker(firstP) : null;

        if (marker && firstP) {
          const bodyChildren = node.children.filter((child) => child !== firstP);

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

      if (Array.isArray(node.children)) node.children.forEach(walk);
    };

    walk(tree);
  };
}