/**
 * 🧮 把 HTML 里的数学公式渲染出来（KaTeX）。
 *
 * 公式的来源有两处，但**规则是同一套**：
 *   ① 资源分享预览：后端 python-markdown 渲染的 HTML，公式是原样的 `$…$ / $$…$$` 文本
 *      （后端只保证"别把公式改坏"，见 cms_core/api/markdown_utils.py 的 MathExtension）；
 *   ② 点过「编辑」再点「预览」：预览用的是编辑器吐出来的 HTML，公式同样是 `$…$` 文本
 *      （tiptap 不认识的 span 会被拆掉，所以不能靠后端打标记）。
 *
 * ⚠️ 这里**不用 KaTeX 的 auto-render**：它找定界符时没有任何货币/空格判定，
 *    正文里一句「这本书 $100，那本 $200」会被它当成公式渲染成红字。
 *    下面的规则和博客前台（remark-math）以及后端（markdown_utils._MATH_RE）对齐：
 *      · `$` 后面不能紧跟空白，闭合 `$` 前面不能是空白
 *      · 内容全是数字/逗号/点的（$100）当货币，不当公式
 *      · 行内代码、围栏、脚本标签里的 `$` 一律不碰
 *
 * 🚀 性能：KaTeX 本体有 300 KB（压缩包），**改成按需加载**了 ——
 *    先把公式抠成 span 收集起来，一条都没有就直接返回，一个字节都不下；
 *    真的有公式才 `import('katex')`。资源分享页里 99% 的文章没有公式，
 *    这一下就省掉首屏 300 KB（详见 renderMathIn 结尾）。
 */

/** 块级公式 | 行内公式（和后端 _MATH_RE 的后两个分支保持一致） */
const MATH_RE = /\$\$[\s\S]+?\$\$|\$(?!\s)(?:\\.|[^$\n])*?[^\s$]\$/g;

/** 这些标签里面永远不找公式 */
const SKIP_TAGS = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE', 'TEXTAREA']);

/** `$100` / `$1,234.5` 这种是钱不是公式 */
const isCurrency = (inner: string) => /^[\d,.\s]+$/.test(inner);

/** 抠出来、等着渲染的一条公式 */
type Pending = { span: HTMLElement; tex: string; display: boolean };

/** 这个文本节点该不该跳过（代码块 / 正在排队的 md-math span / 已经渲染过的 KaTeX 内部） */
function shouldSkip(node: Text): boolean {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    // 'pending' = 已经抠成 span 排上队了（KaTeX 是异步加载的，这里必须同步占位，
    //            否则下一次调用会把同一段源码又抠一遍，套娃成 span>span）
    // '1'       = 已经渲染完
    if (el.classList.contains('katex') || el.dataset.mathRendered) return true;
  }
  return false;
}

/** 把一个文本节点里的公式抠成 span，返回新生成的公式 span（按出现顺序） */
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
    if (!inner.trim() || isCurrency(inner)) continue;   // 货币/空的：原样留着

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

/**
 * 兜底：整块就是一条 `$$…$$` 的块级公式。
 *
 * 为什么单独处理：老版本后端（没带 MathExtension 的那份）会被 nl2br 往公式中间插 `<br>`，
 * 公式被切成「文本 + <br> + 文本 + <br> + 文本」好几个节点，
 * 光看某一个文本节点永远凑不齐一对 `$$` —— 表现就是「行内公式好了，块级公式还是源码」。
 * 编辑器里同理：后端 HTML 里的 `<br>` 会被 tiptap 存成 hardBreak，改一次再预览就散架。
 *
 * 只在「整个块从头到尾就是一条公式」时接管，别的情况一个字都不动。
 */
function collectWholeBlockFormula(block: HTMLElement, pending: Pending[]): boolean {
  const raw = (block.textContent || '').trim();
  if (raw.length <= 4 || !raw.startsWith('$$') || !raw.endsWith('$$')) return false;
  // 块里还套着别的块（列表 / 表格 / 引用 / 代码…）就不是「整块一条公式」，别碰
  if (block.querySelector('p, div, ul, ol, blockquote, table, pre')) return false;

  const inner = raw.slice(2, -2);
  if (!inner.trim()) return false;

  const doc = block.ownerDocument;
  block.textContent = '';            // 连里面的 <br> 一起清掉
  const span = doc.createElement('span');
  span.className = 'md-math';
  span.textContent = raw;
  span.dataset.mathRendered = 'pending';   // 同步占位，理由同 shouldSkip 里的注释
  block.appendChild(span);
  block.dataset.mathRendered = '1';
  pending.push({ span, tex: inner, display: true });
  return true;
}

/**
 * 扫描 root 里的公式并就地渲染。可以重复调用（已经渲染过的会跳过），
 * 所以 React 每次重渲染之后直接调一次就行。
 *
 * 注意是 **async**：KaTeX 本体按需下载（没有公式就完全不下载）。
 * 调用处直接 `void renderMathIn(el)` 就行，算完自己会改 DOM。
 */
export async function renderMathIn(root: HTMLElement) {
  /** 这一轮扫出来的所有公式，攒齐了再一起渲染 */
  const pending: Pending[] = [];

  // ① 整块一条的块级公式（含被 <br> 切开的，见上面说明）
  root.querySelectorAll<HTMLElement>('p, div, li, td, th').forEach((block) => {
    if (block.dataset.mathRendered === '1') return;
    collectWholeBlockFormula(block, pending);
  });

  // ② 行内公式、以及混在文字里的 $$…$$：按文本节点扫
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

  // 🚀 一条公式都没有 → 到此为止，KaTeX（300 KB）一个字节都不下载
  if (!pending.length) return;

  // 有公式才去拿 KaTeX；拿不到（离线/断网）就保持 `$…$` 源码文本，至少内容还在
  const mod = await import('katex').catch(() => null);
  if (!mod) return;
  const katex = mod.default;

  pending.forEach(({ span, tex, display }) => {
    try {
      // throwOnError: false → 写错的公式标红显示，而不是把整页预览搞崩
      katex.render(tex, span, { displayMode: display, throwOnError: false });
      span.dataset.mathRendered = '1';
    } catch {
      /* 渲染失败就保持源码文本，至少内容还在 */
    }
  });
}
