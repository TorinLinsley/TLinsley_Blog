import { visit } from 'unist-util-visit';
import type { Root } from 'hast';

const ZERO_WIDTH = /[\s\u00a0\u200b\u200c\u2060\ufeff\u3000]+/g;

const textOf = (node: any): string => {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (Array.isArray(node.children)) return node.children.map(textOf).join('');
  return '';
};

const hasMedia = (node: any): boolean => {
  if (!node) return false;
  if (node.tagName === 'img' || node.tagName === 'video' || node.tagName === 'iframe') return true;
  return Array.isArray(node.children) ? node.children.some(hasMedia) : false;
};

const isBlankLine = (node: any): boolean => textOf(node).replace(ZERO_WIDTH, '') === '\u200d';

export default function rehypeDropEmpty() {
  return (tree: Root) => {
    const blank = (node: any) => textOf(node).replace(ZERO_WIDTH, '') === '';
    const clean = (parent: any) => {
      if (!Array.isArray(parent.children)) return;
      parent.children = parent.children.filter((child: any) => {
        if (!child || child.type !== 'element') return true;
        if (child.tagName === 'p' && !hasMedia(child)) {
          if (isBlankLine(child)) {
            const prev = Array.isArray(child.properties?.className) ? child.properties.className : [];
            child.properties = { ...(child.properties || {}), className: [...prev, 'blank-line'] };
            child.children = [];
            return true;
          }
          if (blank(child)) return false;
        }
        clean(child);
        return true;
      });
    };
    visit(tree, 'element', (node: any) => clean(node));
    clean(tree);
  };
}
