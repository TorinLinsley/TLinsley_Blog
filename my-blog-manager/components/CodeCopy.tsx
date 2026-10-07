// components/CodeCopy.tsx
"use client";

/**
 * 给 markdown 渲染出来的代码块加「复制」按钮。
 *
 * 设计要点：
 * 1. 只做增强，不改渲染链路 —— 页面里那些 dangerouslySetInnerHTML 出来的
 *    `.prose pre` / `.resource-preview pre` 一律在客户端被包一层 .cc-wrap，
 *    右上角挂一个胶囊按钮：有语言就显示语言名（```powershell → PowerShell），
 *    没有语言就只显示图标。点一下复制整段代码。
 * 2. 手机必须能用：站点现在跑在 http 上，**非安全上下文里 navigator.clipboard
 *    是 undefined**，所以兜底用 textarea + execCommand('copy')，并且**在点击事件
 *    的同一个任务里同步执行**（iOS Safari 只认用户手势当次调用，await 之后再调
 *    会被拒）。textarea 字号给 16px，避免 iOS 聚焦时页面被放大。
 * 3. 不侵入：按钮是 pre 的兄弟节点（不是子节点），所以手动框选代码复制时
 *    不会把「PowerShell / 已复制」这些字带进去；编辑器区域（.editor-content-area）
 *    明确排除，免得干扰编辑。
 */

import { useEffect } from 'react';

const SELECTOR = '.prose pre, .resource-preview pre';
const SKIP_INSIDE = '.editor-content-area, [data-no-code-copy]';

const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11.5" height="11.5" rx="2.5"/><path d="M6.5 15.5h-1A1.5 1.5 0 0 1 4 14V4.5A1.5 1.5 0 0 1 5.5 3H15a1.5 1.5 0 0 1 1.5 1.5v1"/></svg>`;

const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6.5 9.2 17.3 4 12.1"/></svg>`;

/** 折叠箭头：只用这一个朝下的 chevron，展开状态由 CSS 转 180°（有过渡，比直接换图标灵动） */
const CHEVRON_DOWN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9.5 6 6 6-6"/></svg>`;

/** 超过这个行数的代码块默认折叠，只露前 FOLD_AFTER 行（编辑器的行号逻辑也要用它） */
export const FOLD_AFTER = 10;
/** 折叠时在第 10 行下面额外留出的空隙：只够放底部那颗「展开」按钮。
    不能留大 —— 留多了渐变就全压在空白上，而空白本来就是底色，等于看不见渐变。 */
const FOLD_GAP = 12;

// 语言显示名：```js → JavaScript，```powershell → PowerShell
const LANG_NAMES: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  ruby: 'Ruby',
  rs: 'Rust',
  rust: 'Rust',
  go: 'Go',
  golang: 'Go',
  java: 'Java',
  kt: 'Kotlin',
  kotlin: 'Kotlin',
  swift: 'Swift',
  php: 'PHP',
  cs: 'C#',
  csharp: 'C#',
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  objc: 'Objective-C',
  lua: 'Lua',
  dart: 'Dart',
  scala: 'Scala',
  r: 'R',
  matlab: 'MATLAB',
  sh: 'Bash',
  bash: 'Bash',
  shell: 'Bash',
  zsh: 'Zsh',
  ps: 'PowerShell',
  ps1: 'PowerShell',
  powershell: 'PowerShell',
  cmd: 'Cmd',
  bat: 'Batch',
  batch: 'Batch',
  dos: 'DOS',
  html: 'HTML',
  xml: 'XML',
  svg: 'SVG',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  json: 'JSON',
  jsonc: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  ini: 'INI',
  conf: 'Conf',
  sql: 'SQL',
  graphql: 'GraphQL',
  md: 'Markdown',
  markdown: 'Markdown',
  tex: 'LaTeX',
  latex: 'LaTeX',
  diff: 'Diff',
  patch: 'Diff',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  makefile: 'Makefile',
  make: 'Makefile',
  nginx: 'Nginx',
  vim: 'Vim',
  vue: 'Vue',
  svelte: 'Svelte',
  arduino: 'Arduino',
  asm: 'Assembly',
  wasm: 'WASM',
  nix: 'Nix',
  groovy: 'Groovy',
  perl: 'Perl',
  pl: 'Perl',
  razor: 'Razor',
  cshtml: 'Razor',
  http: 'HTTP',
  properties: 'Properties',
  '1c': '1C',
};

const NO_LABEL = ['none', 'nohighlight', 'plain', 'plaintext', 'text', 'txt', 'hljs', 'null', 'undefined'];

export function prettyLang(raw: string): string {
  const key = raw.toLowerCase();
  if (key in LANG_NAMES) return LANG_NAMES[key];
  if (NO_LABEL.includes(key)) return '';
  return raw;
}

/**
 * 语言名的来源（作者显式写了才显示）：
 * 1. data-cc-lang —— 由 lib/rehypeCodeLang.ts 在服务端标好，最准；
 * 2. data-cc-detected —— 作者没写语言，哪怕 highlight 猜了一个也不显示；
 * 3. 都没有（后端 python-markdown / 编辑器存下来的 HTML）→ 退回看 language-* class。
 */
function explicitLang(code: Element): string {
  const el = code as HTMLElement;
  if (el.dataset.ccLang) return prettyLang(el.dataset.ccLang);
  if (el.dataset.ccDetected === '1') return '';
  const matched = (code.className || '').match(/language-([A-Za-z0-9_+#.\-]+)/);
  return matched ? prettyLang(matched[1]) : '';
}

/**
 * iPadOS 13+ 的 UA 是 Macintosh（"请求桌面网站"），所以还要看触摸点数
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
}

/**
 * 临时节点统一处理：
 * - 必须**真的被渲染**才选得中：不能 display:none，也别用 opacity:0（Safari 会当成
 *   没渲染），所以用 1px + opacity .01 + z-index:-1，放视口正中，避免 iOS 聚焦时页面乱跳。
 * - 字号 ≥16px，否则 iOS 聚焦会缩放页面。
 * - 复制完别立刻 remove：部分 iOS 版本会把刚写进去的剪贴板一起清掉，延后一拍再删。
 * - 原来用户的选区要还回去。
 */
function withTempNode<T extends HTMLElement>(node: T, extraStyle: string, select: (el: T) => void): boolean {
  // 后台标签页里 setTimeout 会被节流，可能留下上次的临时节点，先扫掉
  document.querySelectorAll('[data-cc-temp]').forEach((stale) => stale.remove());

  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('data-cc-temp', '1');
  node.tabIndex = -1;
  node.style.cssText = [
    'position:fixed',
    'top:50%',
    'left:50%',
    'width:1px',
    'height:1px',
    'padding:0',
    'margin:0',
    'border:0',
    'outline:none',
    'box-shadow:none',
    'background:transparent',
    'color:transparent',
    'opacity:0.01',
    'z-index:-1',
    'overflow:hidden',
    'pointer-events:none',
    'font-size:16px',
    extraStyle,
  ]
    .filter(Boolean)
    .join(';');

  document.body.appendChild(node);

  const selection = window.getSelection();
  const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

  let ok = false;
  try {
    select(node);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  if (selection) {
    selection.removeAllRanges();
    if (savedRange) selection.addRange(savedRange);
  }
  window.setTimeout(() => {
    node.remove();
  }, 120);

  return ok;
}

/** 桌面端（Windows / macOS 各浏览器）最稳的一条路 */
function copyViaTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.readOnly = true;
  return withTempNode(ta, '', (el) => {
    el.focus({ preventScroll: true });
    el.select();
    if (typeof el.setSelectionRange === 'function') el.setSelectionRange(0, text.length);
  });
}

/** iOS / iPadOS：必须在 contenteditable 元素里用 Range 选区才认 */
function copyViaContentEditable(text: string): boolean {
  const div = document.createElement('div');
  div.textContent = text; // 纯文本，没有子元素，所以复制出来不带任何 HTML 味道
  div.setAttribute('contenteditable', 'true');
  return withTempNode(div, 'white-space:pre', (el) => {
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
}

/**
 * 老办法复制：非 https 环境（你现在的 http）、老浏览器、Safari / iOS 都靠它。
 *
 * ⚠️ 关键坑：**在 textarea 上用 Range 选区**（`range.selectNodeContents(ta)`）会把选区
 * 变成"这个元素本身"，`execCommand('copy')` 照样返回 true，但复制出来是空的。
 * 所以两条路必须分开：iOS 用 contenteditable + Range，桌面端只用 textarea.select()。
 *
 * ⚠️ 必须在用户手势的同一拍里同步调用（macOS Safari / iOS 都不允许 await 之后再复制）。
 */
function legacyCopy(text: string): boolean {
  try {
    if (isIOS()) {
      return copyViaContentEditable(text) || copyViaTextarea(text);
    }
    return copyViaTextarea(text) || copyViaContentEditable(text);
  } catch {
    return false;
  }
}

/** pywebview 暴露的原生接口（控制台窗口里有，普通浏览器里没有） */
type PywebviewBridge = {
  api?: { copy_to_clipboard?: (text: string) => Promise<boolean> | boolean };
};

/**
 * 控制台是 pywebview 窗口，这里优先走 Python 侧的原生 Win32 写剪贴板。
 *
 * 原因（项目里原本就有注释记录过）：Chromium 对「脚本写入」的剪贴板内容会附上
 * `ExcludeClipboardContentFromMonitorProcessing / CanIncludeInClipboardHistory=0`
 * 两个标记 —— 表现是**能粘贴，但 Win+V 剪贴板历史里看不到这条**。
 * 走原生 API 写出来的内容没这些标记，历史里就能看到。
 */
function nativeCopy(text: string): Promise<boolean> | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { pywebview?: PywebviewBridge }).pywebview?.api;
  if (!api || typeof api.copy_to_clipboard !== 'function') return null;
  try {
    return Promise.resolve(api.copy_to_clipboard(text))
      .then((ok) => ok === true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** 浏览器方案：安全上下文用 Clipboard API，其余立刻同步走兜底（保住用户手势） */
function browserCopy(text: string): Promise<boolean> {
  const canUseApi =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    typeof window !== 'undefined' &&
    window.isSecureContext;

  if (canUseApi) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => legacyCopy(text));
  }
  // 非 https（比如服务器上的 http）没有 Clipboard API，同步兜底
  return Promise.resolve(legacyCopy(text));
}

/**
 * 复制入口：pywebview 原生 → Clipboard API → textarea/contenteditable 兜底。
 */
export function copyToClipboard(text: string): Promise<boolean> {
  const native = nativeCopy(text);
  if (native) return native.then((ok) => (ok ? true : browserCopy(text)));
  return browserCopy(text);
}

/**
 * 造一个复制按钮（前台增强和编辑器里的 NodeView 共用同一份，保证长相/行为一致）。
 *
 * @param lang     要标在按钮上的语言名（空字符串 = 只显示图标）
 * @param getText  点下去时现取要复制的文本（编辑器里内容是会变的，所以传函数不传字符串）
 */
export function createCopyBar(lang: string, getText: () => string): HTMLButtonElement {
  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'cc-bar';
  // ⚠️ 故意**不设** title：按钮上已经有语言名（或复制图标），鼠标悬停再弹一条
  //    「复制代码」是多余的，还挡代码。aria-label 留着（它不弹提示，只是给读屏用）。
  bar.setAttribute('aria-label', '复制代码');
  // 编辑器里是 contenteditable，按钮不能被当成可编辑内容/可落光标的位置
  bar.setAttribute('contenteditable', 'false');

  if (lang) {
    const label = document.createElement('span');
    label.className = 'cc-lang';
    label.textContent = lang;
    bar.appendChild(label);
  }

  const icon = document.createElement('span');
  icon.className = 'cc-ic';
  icon.innerHTML = COPY_ICON;
  bar.appendChild(icon);

  let resetTimer = 0;

  bar.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    // 连按两次别把上一轮的还原计时留着
    window.clearTimeout(resetTimer);

    // 只取 textContent（高亮的 span 会被自动拍平），再统一换行，
    // 这样进剪贴板的是纯文本 text/plain，不带任何 HTML 味道
    const text = (getText() || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    void copyToClipboard(text).then((ok) => {
      bar.dataset.state = ok ? 'ok' : 'err';
      icon.innerHTML = ok ? CHECK_ICON : COPY_ICON;

      const tip = ok ? '已复制' : '复制失败';
      let label = bar.querySelector<HTMLElement>('.cc-lang');
      if (label) {
        if (!label.dataset.original) label.dataset.original = label.textContent || '';
        label.textContent = tip;
      } else {
        label = document.createElement('span');
        label.className = 'cc-lang';
        label.textContent = tip;
        bar.insertBefore(label, icon);
      }

      resetTimer = window.setTimeout(() => {
        bar.removeAttribute('data-state');
        icon.innerHTML = COPY_ICON;
        const current = bar.querySelector<HTMLElement>('.cc-lang');
        if (current) {
          if (current.dataset.original) current.textContent = current.dataset.original;
          else current.remove();
        }
      }, 1600);
    });
  });

  return bar;
}

/** 代码块实际有几行（尾部空行不算） */
function countLines(code: Element): number {
  const text = (code.textContent || '').replace(/\n+$/, '');
  return text ? text.split('\n').length : 0;
}

/**
 * 把 computed 的 line-height 换算成**行盒高度（px）**。
 *
 * ⚠️ 两个坑，都实测踩过：
 *  1. line-height 写成不带单位的倍数时（globals 里就是 1.5）：
 *     · 元素**可见**时浏览器给的是用值 "26px"，parseFloat 直接能用 ✓
 *     · 元素在 display:none 的子树里（控制台资源页默认停在「预览态」，编辑器就是隐藏的）
 *       浏览器给的是**计算值 "1.5"** —— 当 px 用就只剩 1.5px 高，代码块折成一条缝。
 *     所以小于 4 的一律按「倍数 × 字号」换算。
 *  2. 代码块里真正的行盒高度由 **pre 自己的 strut** 决定，不是 code 的：
 *     code 是 inline 元素、字号 0.9em（14.4px → 行高 21.6px），但 pre 的字号是 16px，
 *     行盒取两者较大者 = 16 × 1.5 = **24px**。以前只读 code 的 21.6px，
 *     算出来的折叠高度比实际少一行多 —— 收起后第 10 行被切掉一半，看着就像只露了 9 行。
 */
function usedLineHeight(cs: CSSStyleDeclaration): number {
  const fontSize = parseFloat(cs.fontSize) || 14;
  const raw = parseFloat(cs.lineHeight);
  if (!Number.isFinite(raw) || raw <= 0) return fontSize * 1.5;
  return raw < 4 ? fontSize * raw : raw;
}

/**
 * 折叠时该留多高：顶部那条按钮的留白 + 10 行文字 + 一点空隙。
 *
 * 空隙（FOLD_GAP）是专门留给底部渐变的 —— 紧贴着第 10 行收边的话，
 * 渐变就只能糊在字上，最后一行会看不清。
 */
function collapsedHeight(pre: HTMLPreElement, code: Element): number {
  const ps = getComputedStyle(pre);
  const cs = getComputedStyle(code);
  const line = Math.max(usedLineHeight(ps), usedLineHeight(cs));
  const top = parseFloat(ps.paddingTop) || 0;
  return Math.round(top + line * FOLD_AFTER + FOLD_GAP);
}

/** 造一个「展开 / 收起」按钮（右上角那个和底部那个共用长相） */
function createFoldBar(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cc-fold';
  btn.setAttribute('contenteditable', 'false');

  const label = document.createElement('span');
  label.className = 'cc-fold-text';
  const icon = document.createElement('span');
  icon.className = 'cc-ic';
  // ⚠️ 箭头必须在这里就塞进去：方向改由 CSS 旋转控制之后，
  //    apply() 里不再写 innerHTML —— 忘了这里，按钮就永远是"只有字没有箭头"。
  icon.innerHTML = CHEVRON_DOWN;
  btn.append(label, icon);
  return btn;
}

/**
 * 📏 代码块左边的行号栏（浏览状态用）。
 *
 * 编辑器里的代码块行号是 ProseMirror 的 widget decoration，前台和控制台预览没有编辑器，
 * 所以这里在代码块左边竖一列行号，行高跟 code 的 line-height 精确对齐。
 *
 * 为什么不往 <code> 里插东西：那会拆散 highlight.js 的 span 结构（跨行的染色直接废掉），
 * 而且复制、框选都会受影响。独立的列则完全不动代码本体。
 */
function attachGutter(wrap: HTMLElement, pre: HTMLPreElement, code: Element) {
  const text = (code.textContent || '').replace(/\n+$/, '');
  if (!text) return;
  const lines = text.split('\n');
  if (lines.length <= 1) return;   // 就一行代码，不值得占一列

  const gutter = document.createElement('div');
  gutter.className = 'cc-lines';
  gutter.setAttribute('aria-hidden', 'true');

  // 把 code 里的文本节点收集起来，建立「整段字符偏移 → (文本节点, 节点内偏移)」的映射，
  // 这样每一行都能用 Range 量到**它自己那一行**的真实位置。
  // ⚠️ 不能像以前那样「首行位置 + 行高 × 行号」：行高只要差零点几像素，
  //    几十行之后整体错位，末尾几行还会跑出行号栏（预览里行号对不上就是这么来的）。
  const pieces: { start: number; node: Text }[] = [];
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    if (tn.length) {
      pieces.push({ start: acc, node: tn });
      acc += tn.length;
    }
  }
  if (!pieces.length) return;

  const locate = (index: number) => {
    for (let i = pieces.length - 1; i >= 0; i -= 1) {
      const p = pieces[i];
      if (index >= p.start) return { node: p.node, offset: Math.min(index - p.start, p.node.length) };
    }
    return { node: pieces[0].node, offset: 0 };
  };

  const ps = getComputedStyle(pre);
  const cs = getComputedStyle(code);
  // 同 collapsedHeight：行盒高度要按 pre 的 strut 和 code 里较大的那个算
  const lineHeight = Math.max(usedLineHeight(ps), usedLineHeight(cs));
  const padTop = parseFloat(ps.paddingTop) || 0;

  const wrapTop = wrap.getBoundingClientRect().top;
  let cursor = 0;
  let lastTop = padTop;

  lines.forEach((line, i) => {
    const item = document.createElement('span');
    item.textContent = String(i + 1);

    const at = locate(cursor);
    if (line.length && at.node.length) {
      const end = Math.min(at.offset + 1, at.node.length);
      if (end > at.offset) {
        const range = document.createRange();
        range.setStart(at.node, at.offset);
        range.setEnd(at.node, end);
        const rect = range.getBoundingClientRect();
        if (rect.height || rect.top) lastTop = rect.top - wrapTop;
      }
    }
    item.style.top = `${lastTop}px`;
    gutter.appendChild(item);

    cursor += line.length + 1;
    lastTop += lineHeight;   // 空行量不到字符，就按上一行加一个行高往下走
  });

  wrap.style.setProperty('--cc-line', `${lineHeight}px`);
  wrap.style.setProperty('--cc-top', `${padTop}px`);
  wrap.dataset.ccLines = '1';

  wrap.appendChild(gutter);
}

/** 折叠控件句柄 */
export type CodeFold = { refresh: () => void; expand: () => void };

/**
 * 给长代码块装「展开 / 收起」（前台浏览和控制台编辑器共用同一份，长得一样、行为也一样）。
 *
 * 规则：
 * - 只有超过 FOLD_AFTER 行的块才折叠，默认露前 10 行；
 * - 折叠时**底部中间**还有一个「展开 ⌄」，浮在渐变上 —— 长代码看到底时不用再滚回去找按钮；
 * - 展开后这个底部按钮落到代码块**下面的空白**里，变成「收起 ⌃」；
 * - 右上角按钮始终跟着状态走：折叠「展开 ⌄」、展开「收起 ⌃」；
 * - 渐变底色取 pre 自己的 computed background（浅色/深色都不跑偏），
 *   且只在最下面一截压暗 —— 第 10 行必须看得清。
 *
 * @param host 右上角按钮挂进的容器（前台是 .cc-actions，编辑器是 .cc-tools）
 * @param startOpen 一开始是展开还是折叠。浏览状态默认折叠（省版面）；
 *                  编辑器里传 true 默认展开 —— 正敲的代码块突然折起来，光标就跑进看不见的行了。
 */
export function attachCodeFold(
  wrap: HTMLElement,
  pre: HTMLPreElement,
  code: Element,
  host: HTMLElement,
  startOpen = false
): CodeFold {
  let top: HTMLButtonElement | null = null;
  let fade: HTMLDivElement | null = null;
  let bottom: HTMLButtonElement | null = null;
  let open = false;

  const apply = () => {
    if (!top || !bottom) return;
    wrap.dataset.ccFold = open ? 'open' : 'closed';
    const text = open ? '收起' : '展开';
    for (const btn of [top, bottom]) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      // ⚠️ 故意**不设** title：按钮上就写着「展开 / 收起」还带箭头，一眼就懂，
      //    鼠标悬停再弹一条「展开代码块」纯属多余（截图里挡着代码的就是它）。
      btn.setAttribute('aria-label', `${text}代码块`);
      const label = btn.querySelector<HTMLElement>('.cc-fold-text');
      if (label) label.textContent = text;
      // 箭头不换图形：始终是那个朝下的 chevron，方向交给 CSS 旋转，
      // 展开/收起时它是"翻过去"的，比突然换个图标顺眼。
    }

    /* 底部按钮的两套配色交给 CSS 变量（见下面 STYLE 里的 :root / .dark）。
       别用内联样式：内联虽然能盖住一切，但**切主题时不会自己更新** ——
       深色模式下展开、再切到浅色，字还是白的，非刷新不可，那个坑就是这么来的。 */
  };

  const toggle = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    open = !open;
    apply();
  };

  const measure = () => {
    // 折叠高度直接取"第 11 行行号的位置"（行号是逐行真实定位的），这样正好露满 10 行。
    // 用 paddingTop + 行高 × 10 那种算法只要差一点点，实际就只露 9 行、第 10 行被裁掉半个
    // （行号还会因为溢出跑到代码块外面）。
    // ⚠️ 只认前台那套行号（.cc-lines）。**绝不能**去量编辑器的 .code-line-no：
    //    折叠之后那些 widget 的位置会被压扁，量出来是错的，会把代码块折成一条缝（实测踩过）。
    const marks = wrap.querySelectorAll('.cc-lines > span');
    const next = marks[FOLD_AFTER] as HTMLElement | undefined;
    const raw = next && next.style.top ? parseFloat(next.style.top) : NaN;
    // ⚠️ 量到的值要「讲得通」才敢用：元素在 display:none 的子树里时，行号栏是量不到位置的，
    //    拿到的是 0（或者干脆没有）。直接拿 0 去设 --cc-max，代码块就被折成一条缝、
    //    什么都看不见 —— 这正是 1448 之后线上代码块"折成一条缝"的成因，实测踩过。
    //    不合理就退回 collapsedHeight()（只依赖 computed 样式，隐藏状态下也算得对）。
    const nextTop = Number.isFinite(raw) && raw > FOLD_GAP ? raw : NaN;
    wrap.style.setProperty(
      '--cc-max',
      (Number.isFinite(nextTop) ? Math.round(nextTop + FOLD_GAP) : collapsedHeight(pre, code)) + 'px'
    );
    // 渐变层是个贴在 pre 底部的矩形，会把代码块底部的圆角盖成直角 ——
    // 所以把 pre 自己的圆角读出来，只补在下面两个角上（收起/展开都正常）。
    if (fade) {
      const ps = getComputedStyle(pre);
      fade.style.borderRadius = `0 0 ${ps.borderBottomRightRadius} ${ps.borderBottomLeftRadius}`;
    }
    // 渐变底色 = 代码块自己的背景色；取不到（透明）时退回主题深色
    const bg = getComputedStyle(pre).backgroundColor;
    const opaque = !!bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0(\.0+)?\)$/.test(bg);
    wrap.style.setProperty('--cc-bg', opaque ? bg : '#1e293b');
  };

  const mount = () => {
    top = createFoldBar();
    top.classList.add('cc-fold-top');
    bottom = createFoldBar();
    bottom.classList.add('cc-fold-bottom');
    fade = document.createElement('div');
    fade.className = 'cc-fade';
    fade.setAttribute('aria-hidden', 'true');

    measure();

    top.addEventListener('click', toggle);
    bottom.addEventListener('click', toggle);
    // 右上角排在最前，后面才是语言下拉 / 复制
    host.insertBefore(top, host.firstChild);
    wrap.append(fade, bottom);
    open = startOpen;
    apply();
  };

  const unmount = () => {
    top?.removeEventListener('click', toggle);
    bottom?.removeEventListener('click', toggle);
    top?.remove();
    bottom?.remove();
    fade?.remove();
    delete wrap.dataset.ccFold;
    wrap.style.removeProperty('--cc-max');
    top = null;
    bottom = null;
    fade = null;
    open = false;
  };

  // 上次量过的高度对应的行数：编辑器里每敲一个字都会调 refresh()，
  // 这种热路径上不能反复 getComputedStyle（会触发强制同步布局）
  let measuredLines = -1;

  return {
    /** 内容变了就调一次：超过阈值就装上，掉回阈值以下就卸掉 */
    refresh: () => {
      const total = countLines(code);
      const long = total > FOLD_AFTER;
      if (long && !top) {
        mount();
        measuredLines = total;
      } else if (!long && top) {
        unmount();
        measuredLines = -1;
      } else if (long && total !== measuredLines) {
        // 行数真的变了才重新量（裁切高度、渐变底色跟着更新）
        measuredLines = total;
        measure();
      }
    },
    /** 展开（编辑器里把光标移进代码块时调它：折叠状态下看不见正在编辑的行） */
    expand: () => {
      if (top && !open) {
        open = true;
        apply();
      }
    },
  };
}

function enhance(pre: HTMLPreElement) {
  const code = pre.querySelector('code');
  if (!code) return;
  pre.dataset.ccReady = '1';

  // 包一层做定位容器，按钮挂在 pre 外面，不污染代码文本
  const wrap = document.createElement('div');
  wrap.className = 'cc-wrap';
  pre.parentNode?.insertBefore(wrap, pre);
  wrap.appendChild(pre);

  attachGutter(wrap, pre, code);

  // 右上角排一行：「展开」（只有长块才有）+「复制」。
  // 复制按钮仍然是那条最常见的胶囊，只是位置交给这行 flex 统一管。
  const actions = document.createElement('div');
  actions.className = 'cc-actions';
  wrap.appendChild(actions);
  actions.appendChild(createCopyBar(explicitLang(code), () => code.textContent || ''));
  attachCodeFold(wrap, pre, code, actions).refresh();
}

const STYLE = `
  .cc-wrap { position: relative; }
  /* 📐 顶部留出「语言 / 复制」按钮那一条的高度。
     按钮是绝对定位在右上角的，不留白的话第一行代码会被它盖住（长代码行尤其明显）。 */
  .cc-wrap > pre[data-cc-ready] { padding-top: 2.75rem !important; }
  /* 📏 左边那条行号栏也要占位置（只有真的带行号的块才留白，单行代码不留） */
  .cc-wrap[data-cc-lines="1"] > pre[data-cc-ready] { padding-left: 3.2rem !important; }
  @media (hover: none) {
    .cc-wrap > pre[data-cc-ready] { padding-top: 3rem !important; }
  }
  .cc-bar {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    z-index: 5;
    display: inline-flex;
    align-items: center;
    gap: 0.36rem;
    max-width: calc(100% - 1.2rem);
    min-height: 1.8rem;
    padding: 0.3rem 0.6rem;
    border: 0;
    border-radius: 999px;
    /* ⚠️ 代码块里的按钮一律用**深色实底**，别用"半透明白"：
       展开态那个浮在代码块外面的按钮就踩过坑 —— 半透明白落在浅色页面上 = 白底，
       而文字是近白色 → 浅色模式下白底白字，什么都看不见。 */
    background: rgba(17, 24, 39, 0.55);
    color: #e2e8f0;
    font-family: 'JetBrains Mono','Fira Code','Cascadia Code',Menlo,Consolas,ui-monospace,monospace;
    font-size: 0.7rem;
    font-weight: 500;
    line-height: 1;
    letter-spacing: 0.02em;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-user-drag: none;
    -webkit-touch-callout: none;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    opacity: 0.72;
    /* 按下反馈那条 transform 用 140ms 强 ease-out ——
       和 lib/motion.ts 里的 D_PRESS(0.14) / EASE_OUT(0.23,1,0.32,1) 同值。
       （CSS 里没法 import TS 常量，所以这里是同一份数值的镜像，改一处记得改两处） */
    transition: opacity .2s ease, background-color .2s ease, color .2s ease, border-color .2s ease,
                transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .cc-wrap:hover .cc-bar { opacity: 1; }
  .cc-bar:hover,
  .cc-bar:focus-visible { background: rgba(17, 24, 39, 0.82); color: #ffffff; outline: none; }
  .cc-bar:active { background: rgba(17, 24, 39, 0.95); transform: scale(0.97); }
  /* 减少动效：颜色反馈照旧，去掉缩放那一下 */
  @media (prefers-reduced-motion: reduce) {
    .cc-bar { transition: opacity .2s ease, background-color .2s ease, color .2s ease, border-color .2s ease; }
    .cc-bar:active { transform: none; }
  }
  .cc-bar .cc-lang { max-width: 9rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .cc-bar .cc-ic { display: inline-flex; width: 0.9rem; height: 0.9rem; flex: 0 0 auto; }
  .cc-bar .cc-ic svg { display: block; width: 100%; height: 100%; }
  .cc-bar[data-state="ok"] {
    color: #4ade80;
    border-color: rgba(74,222,128,0.45);
    background: rgba(74,222,128,0.14);
    opacity: 1;
  }
  .cc-bar[data-state="err"] {
    color: #fca5a5;
    border-color: rgba(248,113,113,0.45);
    background: rgba(248,113,113,0.14);
    opacity: 1;
  }
  /* 触屏设备（iPhone / Android）没有 hover，直接常显 */
  @media (hover: none) {
    .cc-bar { opacity: 0.9; min-height: 2rem; padding: 0.35rem 0.65rem; }
    /* 视觉上不放大，但把可点区域撑到 ~44px，满足 iOS 的触摸热区建议 */
    .cc-bar::after {
      content: '';
      position: absolute;
      top: -0.45rem;
      right: -0.4rem;
      bottom: -0.45rem;
      left: -0.4rem;
    }
  }
  @media (max-width: 520px) {
    .cc-bar { top: 0.45rem; right: 0.45rem; font-size: 0.66rem; }
    .cc-bar .cc-lang { max-width: 6.5rem; }
    .cc-bar .cc-ic { width: 0.85rem; height: 0.85rem; }
  }

  /* ===== 长代码块：默认折叠 + 展开/收起 ===== */
  /* 右上角那一行：折叠按钮 + 复制按钮，位置统一交给 flex 管 */
  .cc-actions {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: calc(100% - 1.2rem);
  }
  /* 进了这一行就交回 flex 排版（编辑器里单独用的 .cc-bar 依然是绝对定位） */
  .cc-actions > .cc-bar { position: static; top: auto; right: auto; }
  /* ⛔ 必须把 .cc-bar 自己那条 max-width 关掉。
     那条 max-width: calc(100% - 1.2rem) 是给「编辑器里绝对定位」的场合写的，
     在那里 100% = 代码块宽度，合理；可一旦 bar 变成 .cc-actions 的 flex 子项，
     100% 就变成**.cc-actions 自身的宽度**，而 .cc-actions 又是按内容收缩的 ——
     等于自己限制自己，按钮会被算得比内容还窄（实测：插进「已复制」之后
     按钮只有 38px，文字需要 24px 只显示 10px，就露出一个残字）。
     关掉之后宽度由内容决定；长语言名由 .cc-lang 自己的 max-width + 省略号兜住。 */
  .cc-actions > .cc-bar { max-width: none; }
  /* 撑触摸热区的那层 ::after 在行内会盖住旁边的按钮，去掉 ——
     触屏下两个按钮本身都加高到 2rem 了 */
  .cc-actions > .cc-bar::after { display: none; }
  /* ⚠️ 这两个按钮**不许被压扁**（flex: 0 0 auto）。
     以前写的是 flex: 0 1 auto 加 min-width: 0 —— 允许收缩 + 取消最小宽度，
     结果按钮会比自己的内容还窄：语言名被裁，更明显的是点完复制之后
     「已复制」只露出一个字（手机截图里那个残字就是这么来的。实测：
     按钮 62px → 38px，文字需要 24px 却只显示 10px）。
     长语言名由 .cc-lang 自己的 max-width + 省略号兜着，不会撑爆这一行。 */
  .cc-actions > .cc-bar,
  .cc-actions > .cc-fold { flex: 0 0 auto; }

  /* 折叠按钮：走轻量风 —— 不要硬边框、不要等宽字，一颗圆润的胶囊 + 淡背景，
     悬停时轻轻浮起来、箭头是转过去的（跟代码块那种"终端感"错开，看着灵动些） */
  .cc-fold {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.7rem;
    padding: 0.28rem 0.72rem;
    border: 0;
    border-radius: 999px;
    background: rgba(17, 24, 39, 0.55);
    color: #e2e8f0;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1;
    letter-spacing: 0.03em;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-user-drag: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    box-shadow: 0 1px 1px rgba(0,0,0,0.12);
    opacity: 0.82;
    transition: opacity .2s ease, background-color .2s ease, color .2s ease, transform .18s ease, box-shadow .22s ease;
  }
  .cc-wrap:hover .cc-fold { opacity: 1; }
  .cc-fold:hover,
  .cc-fold:focus-visible {
    background: rgba(17, 24, 39, 0.82);
    color: #ffffff;
    outline: none;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.26);
  }
  .cc-fold:active { background: rgba(17, 24, 39, 0.95); transform: translateY(0) scale(0.97); }
  .cc-fold .cc-ic {
    display: inline-flex;
    width: 0.8rem;
    height: 0.8rem;
    flex: 0 0 auto;
    transition: transform .28s cubic-bezier(.22,1,.36,1);
  }
  .cc-fold .cc-ic svg { display: block; width: 100%; height: 100%; }
  /* 展开状态：同一个箭头翻上去 */
  .cc-wrap[data-cc-fold="open"] .cc-fold .cc-ic { transform: rotate(180deg); }

  /* 折叠状态：只留前 10 行，多出来的裁掉（横向滚动照旧可用） */
  .cc-wrap[data-cc-fold="closed"] > pre {
    max-height: var(--cc-max, 22rem);
    overflow-x: auto;
    overflow-y: hidden;
  }

  /* 📏 行号栏：贴在代码块左边，每个行号各自绝对定位到它那一行的真实位置 */
  .cc-lines {
    position: absolute;
    /* ⚠️ top/left 必须明确写出来。行号是各自绝对定位的，容器自己不带 top 的话
       会停在"静态位置"——也就是 pre 的下方，整列行号就飘到代码块外面去了。 */
    top: 0;
    left: 0;
    width: 3.2rem;
    z-index: 1;
    font-family: ui-monospace, 'JetBrains Mono', 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: var(--cc-line, 1.5);
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.64);
    -webkit-user-select: none;
    user-select: none;
    pointer-events: none;
  }
  .cc-lines > span { position: absolute; right: 0.8rem; }
  /* 折叠时行号跟着代码一起收起来。这里**不能**再用 max-height + overflow:hidden ——
     行号现在各自绝对定位，容器本身高度是 0，那样会把整列裁得一个不剩。
     直接按序号藏掉第 11 行往后的（对应 FOLD_AFTER = 10）。 */
  .cc-wrap[data-cc-fold="closed"] > .cc-lines {
    /* 跟 pre 一样高、裁掉溢出：第 10 行正好落在底边，再往下的行号不该露到代码块外面
       （行号是绝对定位的，不这么裁就会画出去）。 */
    height: var(--cc-max, 22rem);
    overflow: hidden;
  }
  .cc-wrap[data-cc-fold="closed"] > .cc-lines > span:nth-child(n + 11) { display: none; }

  /* 底部渐变：底色取代码块自己的背景色，用 mask 做透明过渡。
     上半段几乎不压暗 —— 第 10 行必须看得清，只有最底下那截才真的糊掉 */
  .cc-fade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4.2rem;
    z-index: 2;
    display: none;
    pointer-events: none;
    /* 渐变曲线（10 格刻度尺，两端是颜色点）：
         0% ~ 46% = 完全透明（上面四成半多一点不压暗）
         46% ~ 100% = 从透明渐到纯黑（最底下那截实打实黑掉）
       遮罩高度 4.2rem，也就是说最后约 2.27rem 开始渐隐。 */
    background: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 46%, #000 100%);
  }
  /* 折叠时那层遮罩才出现；展开就收掉 */
  .cc-wrap[data-cc-fold="closed"] > .cc-fade { display: block; }

  /* 底部那颗按钮：
     · 折叠时浮在代码块内部的渐变上居中 —— 长代码看到底不用再滚回去找右上角那个；
     · 展开后落到代码块**下面**的空白里，依然居中。
       （它是 pre 的兄弟节点，不盖正文，也不占行号那一列） */
  .cc-wrap > .cc-fold-bottom {
    display: none;
    width: fit-content;
  }
  .cc-wrap[data-cc-fold="closed"] > .cc-fold-bottom {
    display: flex;
    position: absolute;
    /* 居中用 left/right:0 + auto 边距，不用 translateX(-50%)：
       那个 transform 切回展开态（position:static）时依然生效，
       会把按钮整体左移半个宽度。 */
    left: 0;
    right: 0;
    bottom: 0.4rem;
    margin: 0 auto;
    width: fit-content;
    z-index: 3;
    opacity: 0.95;
  }
  /* 站点主题紫，但**不是实心**：半透明紫底 + 实色紫描边。
     实心紫太重；而纯半透明深色又会跟代码块糊在一起 —— 描边正好把边界勾出来。 */
  .cc-wrap > .cc-fold-bottom {
    background: rgba(99, 102, 241, 0.18);
    border: 1px solid #6366f1;
    color: #c7d2fe;
    box-shadow: 0 2px 10px rgba(79, 70, 229, 0.22);
  }
  /* 折叠时它压在深色代码块上 → 浅紫字；展开时落在页面背景上 → 浅色主题要用深紫字 */
  .cc-wrap[data-cc-fold="open"] > .cc-fold-bottom { color: #4f46e5; }
  .dark .cc-wrap[data-cc-fold="open"] > .cc-fold-bottom { color: #c7d2fe; }
  .cc-wrap > .cc-fold-bottom:hover,
  .cc-wrap > .cc-fold-bottom:focus-visible {
    background: rgba(99, 102, 241, 0.32);
    border-color: #818cf8;
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
  }
  .cc-wrap[data-cc-fold="open"] > .cc-fold-bottom {
    display: flex;
    position: static;
    left: auto;
    right: auto;
    transform: none;
    margin: 0.75rem auto 0.15rem;
  }

  @media (hover: none) {
    .cc-fold { opacity: 0.9; min-height: 2rem; padding: 0.35rem 0.6rem; }
  }
  @media (max-width: 520px) {
    .cc-actions { top: 0.45rem; right: 0.45rem; gap: 0.3rem; }
    .cc-fold { font-size: 0.66rem; padding: 0.28rem 0.5rem; }
  }
`;

export default function CodeCopy() {
  useEffect(() => {
    let frame = 0;

    const enhanceAll = () => {
      frame = 0;
      const blocks = document.querySelectorAll<HTMLPreElement>(SELECTOR);
      blocks.forEach((pre) => {
        if (pre.dataset.ccReady === '1') return;
        if (pre.closest(SKIP_INSIDE)) return;
        enhance(pre);
      });
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(enhanceAll);
    };

    schedule();

    // 客户端切页 / 编辑器预览切换都会换掉 DOM，这里跟着重新扫
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: STYLE }} />;
}
