
type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const IGNORED = new Set(['none', 'nohighlight', 'plain', 'plaintext', 'text', 'txt', 'null', 'undefined']);

export default function rehypeCodeLang() {
  return (tree: HastNode) => {
    const walk = (node: HastNode, insidePre: boolean) => {
      if (!node || typeof node !== 'object') return;

      let childInsidePre = insidePre;

      if (node.type === 'element') {
        if (node.tagName === 'pre') childInsidePre = true;

        if (insidePre && node.tagName === 'code') {
          const properties = node.properties ?? (node.properties = {});
          const classes = Array.isArray(properties.className) ? properties.className : [];
          const explicit = classes
            .map((value) => String(value))
            .find((name) => name.startsWith('language-') && !IGNORED.has(name.slice(9).toLowerCase()));

          if (explicit) {
            const raw = explicit.slice(9);
            properties['data-cc-lang'] = raw;

            const lower = raw.toLowerCase();
            if (lower !== raw) {
              properties.className = [
                ...classes.filter((value) => String(value) !== explicit),
                `language-${lower}`,
              ];
            }
          } else {
            properties['data-cc-detected'] = '1';
          }
        }
      }

      if (Array.isArray(node.children)) {
        node.children.forEach((child) => walk(child, childInsidePre));
      }
    };

    walk(tree, false);
  };
}