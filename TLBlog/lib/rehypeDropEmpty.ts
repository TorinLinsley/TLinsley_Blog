import { visit } from 'unist-util-visit';
import type { Root } from 'hast';

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

export default function rehypeDropEmpty() {
  return (tree: Root) => {
    const clean = (parent: any) => {
      if (!Array.isArray(parent.children)) return;
      parent.children = parent.children.filter((child: any) => {
        if (!child || child.type !== 'element') return true;
        if (child.tagName === 'p' && !textOf(child).trim() && !hasMedia(child)) return false;
        clean(child);
        return true;
      });
    };
    visit(tree, 'element', (node: any) => clean(node));
    clean(tree);
  };
}
