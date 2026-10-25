type MdNode = { type: string; value?: string; children?: MdNode[] };

function walk(node: MdNode) {
  if (!Array.isArray(node.children)) return;
  const out: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('\n')) {
      const lines = child.value.split('\n');
      lines.forEach((line, i) => {
        if (i > 0) out.push({ type: 'break' });
        if (line) out.push({ type: 'text', value: line });
      });
    } else {
      walk(child);
      out.push(child);
    }
  }
  node.children = out;
}

export default function remarkHardBreaks() {
  return (tree: MdNode) => {
    walk(tree);
  };
}