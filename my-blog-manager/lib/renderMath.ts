
const MATH_RE = /\$\$[\s\S]+?\$\$|\$(?!\s)(?:\\.|[^$\n])*?[^\s$]\$/g;

const SKIP_TAGS = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE', 'TEXTAREA']);

const isCurrency = (inner: string) => /^[\d,.\s]+$/.test(inner);

type Pending = { span: HTMLElement; tex: string; display: boolean };

function shouldSkip(node: Text): boolean {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.classList.contains('katex') || el.dataset.mathRendered) return true;
  }
  return false;
}

function splitTextNode(node: Text): HTMLElement[] {
  const doc = node.ownerDocument;
  const value = node.nodeValue || '';
  const spans: HTMLElement[] = [];
  const frag = doc.createDocumentFragment();
  let last = 0;
  let match: RegExpExecArray | null;

  MATH_RE.lastIndex = 0;
  while ((match = MATH_RE.exec(value))) {
    const raw = match[0];
    const display = raw.startsWith('$$');
    const inner = display ? raw.slice(2, -2) : raw.slice(1, -1);
    if (!inner.trim() || isCurrency(inner)) continue;

    if (match.index > last) frag.appendChild(doc.createTextNode(value.slice(last, match.index)));
    const span = doc.createElement('span');
    span.className = 'md-math';
    span.textContent = raw;
    frag.appendChild(span);
    spans.push(span);
    last = match.index + raw.length;
  }

  if (!spans.length) return spans;
  if (last < value.length) frag.appendChild(doc.createTextNode(value.slice(last)));
  node.parentNode?.replaceChild(frag, node);
  return spans;
}

function collectWholeBlockFormula(block: HTMLElement, pending: Pending[]): boolean {
  const raw = (block.textContent || '').trim();
  if (raw.length <= 4 || !raw.startsWith('$$') || !raw.endsWith('$$')) return false;
  if (block.querySelector('p, div, ul, ol, blockquote, table, pre')) return false;

  const inner = raw.slice(2, -2);
  if (!inner.trim()) return false;

  const doc = block.ownerDocument;
  block.textContent = '';
  const span = doc.createElement('span');
  span.className = 'md-math';
  span.textContent = raw;
  span.dataset.mathRendered = 'pending';
  block.appendChild(span);
  block.dataset.mathRendered = '1';
  pending.push({ span, tex: inner, display: true });
  return true;
}

export async function renderMathIn(root: HTMLElement) {
  const pending: Pending[] = [];

  root.querySelectorAll<HTMLElement>('p, div, li, td, th').forEach((block) => {
    if (block.dataset.mathRendered === '1') return;
    collectWholeBlockFormula(block, pending);
  });

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!text.nodeValue?.includes('$')) continue;
    if (shouldSkip(text)) continue;
    targets.push(text);
  }

  targets.forEach((text) => {
    splitTextNode(text).forEach((span) => {
      const raw = span.textContent || '';
      const display = raw.startsWith('$$');
      span.dataset.mathRendered = 'pending';
      pending.push({ span, tex: display ? raw.slice(2, -2) : raw.slice(1, -1), display });
    });
  });

  if (!pending.length) return;

  const mod = await import('katex').catch(() => null);
  if (!mod) return;
  const katex = mod.default;

  pending.forEach(({ span, tex, display }) => {
    try {
      katex.render(tex, span, { displayMode: display, throwOnError: false });
      span.dataset.mathRendered = '1';
    } catch {
    }
  });
}