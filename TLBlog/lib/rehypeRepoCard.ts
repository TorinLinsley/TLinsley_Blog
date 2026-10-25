
import { parseRepoLink } from './repoCard';
import { loadRepoCard } from './repoCardServer';
import { cardHtml } from './repoCardHtml';

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const BLOCKS = new Set(['p', 'li', 'div', 'td', 'blockquote']);

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value || '';
  return (node.children || []).map(textOf).join('');
}

function isStandalone(node: HastNode, parent: HastNode | null): boolean {
  if (!parent || !parent.tagName || !BLOCKS.has(parent.tagName)) return false;
  const kids = parent.children || [];
  const elems = kids.filter((c) => c.type === 'element');
  if (elems.length !== 1 || elems[0] !== node) return false;
  return kids.map(textOf).join('').trim() === textOf(node).trim();
}

export default function rehypeRepoCard(options?: { perLinkMs?: number }) {
  const perLinkMs = options?.perLinkMs ?? 1200;

  return async (tree: HastNode) => {
    const jobs: { parent: HastNode; index: number; href: string }[] = [];

    const walk = (node: HastNode) => {
      const kids = node.children;
      if (!kids) return;
      kids.forEach((child, index) => {
        if (
          child.type === 'element' &&
          child.tagName === 'a' &&
          typeof child.properties?.href === 'string' &&
          isStandalone(child, node)
        ) {
          jobs.push({ parent: node, index, href: String(child.properties.href) });
          return;
        }
        walk(child);
      });
    };
    walk(tree);

    if (!jobs.length) return;

    await Promise.all(
      jobs.map(async (job) => {
        const link = parseRepoLink(job.href);
        if (!link) return;
        try {
          const data = await Promise.race([
            loadRepoCard(link.url).catch(() => null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), perLinkMs)),
          ]);
          if (!data) return;
          job.parent.children![job.index] = { type: 'raw', value: cardHtml(data) };
        } catch {
        }
      }),
    );
  };
}