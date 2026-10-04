/**
 * Obsidian 风格的 Callout（标注块）。
 *
 * 源码写法：
 *   > [!note] 标题
 *   > 正文……
 *
 * 渲染成：
 *   <div class="callout callout-note">
 *     <div class="callout-title"><span class="callout-icon">图标</span><span>标题</span></div>
 *     <div class="callout-body">正文……</div>
 *   </div>
 *
 * 类型取 `[!xxx]` 里的 xxx（不区分大小写）；没写标题就用类型名当标题。
 */

type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

/** 图标：内联 SVG，跟着文字颜色走（stroke=currentColor） */
const wrap = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<string, string> = {
  // 铅笔
  note: wrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  // 圆圈感叹号
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/>'),
  // 灯泡
  tip: wrap('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z"/>'),
  hint: wrap('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z"/>'),
  // 对勾
  success: wrap('<path d="M20 6 9 17l-5-5"/>'),
  check: wrap('<path d="M20 6 9 17l-5-5"/>'),
  done: wrap('<path d="M20 6 9 17l-5-5"/>'),
  // 警告三角
  warning: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  caution: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  attention: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  // 禁止 / 叉
  danger: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  error: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  failure: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  bug: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  // 问号
  question: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  help: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  faq: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  // 引用符号
  quote: wrap('<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M15 7h2v4a4 4 0 0 1-4 4"/>'),
  cite: wrap('<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M15 7h2v4a4 4 0 0 1-4 4"/>'),
  // 清单
  example: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  abstract: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  summary: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  todo: wrap('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>'),
};

const DEFAULT_ICON = ICONS.note;

function textOf(node: HastNode): string {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (Array.isArray(node.children)) return node.children.map(textOf).join('');
  return '';
}

/** 把首段里的 [!type] 抠出来，返回 {type, title}；不是 callout 就返回 null */
function parseMarker(node: HastNode): { type: string; title: string } | null {
  if (!node || node.type !== 'element' || node.tagName !== 'p') return null;
  const text = textOf(node);
  /**
   * ⚠️ 这里必须用 `[\s\S]*`，不能用 `.*`：
   *    `.*` 不匹配换行，而 callout 的标题行后面**通常就跟着正文**（`[!note] 标题\n正文`），
   *    一遇到换行整条正则就匹配失败 —— 表现就是「只有一部分 callout 能渲染，
   *    其余全是 [!xxx] 原文」。这个坑藏得很深，踩过一次记在这里。
   * 末尾的 - / + 是 Obsidian 的"默认折叠/展开"标记，这里只吃掉符号本身。
   */
  const match = text.match(/^\s*\[!\s*([A-Za-z0-9_-]+)\s*\]\s*([-+]?)\s*([\s\S]*)$/);
  if (!match) return null;
  const type = match[1].toLowerCase();
  // 标题只取**第一行**（后面的都是正文，不能一股脑塞进标题里）
  const titleLine = (match[3] || '').split('\n')[0].trim();
  const title = titleLine || type.charAt(0).toUpperCase() + type.slice(1);
  return { type, title };
}

/**
 * 首段里「去掉 marker 和标题行之后」剩下的内容（也就是正文）。
 *
 * ⚠️ 以前这里是把首段整个丢掉、只拿它当标题 —— 于是
 *    `> [!note] 标题 ↵ 正文` 这种写法的**正文会被吃掉** ✗。
 * 现在把标题行剪掉之后余下的部分原样返回（包成一个 <p> 塞进 callout 正文）。
 */
function firstParagraphBody(node: HastNode): HastNode | null {
  const kids = (node.children || []).slice();
  let idx = -1;
  for (let i = 0; i < kids.length; i += 1) {
    if (kids[i].type === 'text' && kids[i].value) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;

  const rest = (kids[idx].value || '')
    .replace(/^\s*\[!\s*[A-Za-z0-9_-]+\s*\]\s*[-+]?\s*[^\n]*/, '')
    .replace(/^\n+/, '');

  // 标题行与正文之间那个 <br> 只是换行排版，不是正文
  const tail = kids.slice(idx + 1);
  while (tail.length && tail[0].type === 'element' && tail[0].tagName === 'br') tail.shift();

  const body: HastNode[] = [];
  if (rest.trim()) body.push({ type: 'text', value: rest });
  body.push(...tail);

  const hasContent = body.some((n) => (n.type === 'text' ? (n.value || '').trim() !== '' : true));
  if (!hasContent) return null;

  return { type: 'element', tagName: 'p', properties: {}, children: body };
}

/**
 * 🧩 一个 blockquote 里连着写了好几个 callout → 拆成多个独立的 blockquote。
 *
 * Obsidian 允许这么写（它见到新的 `[!type]` 就开一个新 callout）：
 *     > [!note] 标题一
 *     > 正文一
 *     > [!abstract] 标题二
 *     > 正文二
 * 但在标准 Markdown 里这**只是一个** blockquote → 不拆的话只有第一个能变成 callout，
 * 其余全部退化成普通引用里的一行原文（就是"粘过来一堆 [!xxx] 原文"那个现象）。
 *
 * 拆法：以每个「首行是 [!type] 的段落」为界切段，每段复制成一个新的 blockquote。
 * 前面若有不是 callout 的内容，原样留在第一个块里。
 */
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

      // 先把子层里「一个引用块塞了多个 callout」的拆开，再逐个处理
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
          // 标题行下面的正文（如果有）要留着，不能跟着标题一起丢掉
          const remainder = firstParagraphBody(firstP);
          const bodyChildren = [
            ...(remainder ? [remainder] : []),
            ...node.children.filter((child) => child !== firstP),
          ];

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
          return; // 里面不再递归
        }
      }

      if (Array.isArray(node.children)) node.children.forEach(walk);
    };

    walk(tree);
  };
}
