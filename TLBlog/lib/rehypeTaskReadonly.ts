import { visit } from 'unist-util-visit';
import type { Root, Element } from 'hast';

export default function rehypeTaskReadonly() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'input') return;
      const type = node.properties && (node.properties.type as string);
      if (type !== 'checkbox') return;
      node.properties = node.properties || {};
      node.properties.disabled = true;
      node.properties.readOnly = true;
      node.properties.tabIndex = -1;
      node.properties['data-readonly'] = 'true';
      node.properties.style = 'pointer-events:none';
    });
  };
}
