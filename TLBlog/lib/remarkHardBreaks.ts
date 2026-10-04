/**
 * 🔧 让「单个换行」也变成真正的换行 —— 等价于 python-markdown 的 nl2br / remark-breaks。
 *
 * 为什么需要它：控制台那边（编辑器所见即所得 + 预览走 markdown 的 nl2br）**你敲的每个回车都算换行**；
 * 而前端这套 remark 管线默认把段落里的单个换行当**空格**（软换行）——
 * 于是同一篇东西「编辑器里一行是一行、前端糊成一整段」✗
 * 这里把 mdast 里文本节点的 \n 拆成 break 节点，两边就一致了 ✓
 *
 * 只碰普通文本节点，所以：
 *   · 代码块是 code 节点（内容在 value 里、没有 children）→ 原样不动 ✓
 *   · 行内代码 inlineCode 同理 ✓
 *   · 手写的 <br>（html 节点）也原样保留 ✓
 */
type MdNode = { type: string; value?: string; children?: MdNode[] };

function walk(node: MdNode) {
  if (!Array.isArray(node.children)) return;
  const out: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('\n')) {
      const lines = child.value.split('\n');
      lines.forEach((line, i) => {
        if (i > 0) out.push({ type: 'break' });   // 上一行之后 → 换行
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
