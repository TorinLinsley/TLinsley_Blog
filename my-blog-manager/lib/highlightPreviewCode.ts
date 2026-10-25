
import { createLowlight } from 'lowlight';
import { hljsLanguages } from './hljsLanguages';

const lowlight = createLowlight(hljsLanguages);

type HastNode = {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function serialize(node: HastNode): string {
  if (node.type === 'root') return (node.children || []).map(serialize).join('');
  if (node.type === 'text') return escapeHtml(node.value || '');
  if (node.type !== 'element') return '';
  const inner = (node.children || []).map(serialize).join('');
  const cls = Array.isArray(node.properties?.className) ? (node.properties!.className as string[]).join(' ') : '';
  return cls ? `<span class="${escapeHtml(cls)}">${inner}</span>` : inner;
}

function alreadyColored(code: Element): boolean {
  if (code.querySelector('[class*="hljs-"]')) return true;
  return [...code.querySelectorAll('span')].some((s) => /color/i.test(s.getAttribute('style') || ''));
}

const observed = new WeakSet<HTMLElement>();

function run(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('pre code').forEach((code) => {
    try {
      if (alreadyColored(code)) return;

      const match = /(?:^|\s)language-([\w+#.-]+)/.exec(code.className || '');
      const lang = (match ? match[1] : '').toLowerCase();
      if (!lang) return;

      const text = code.textContent || '';
      if (!text.trim()) return;

      const tree = lowlight.highlight(lang, text) as unknown as HastNode;
      code.innerHTML = serialize(tree);
    } catch {
    }
  });
}

export function highlightPreviewCode(root: HTMLElement) {
  if (!root) return;
  run(root);
  if (observed.has(root)) return;
  observed.add(root);

  let scheduled = 0;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = window.requestAnimationFrame(() => {
      scheduled = 0;
      run(root);
    });
  });
  observer.observe(root, { childList: true, subtree: true });
}