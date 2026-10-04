/**
 * 🎨 给「预览区」的代码块补一次语法着色 —— 在**浏览器里**做，不依赖服务器环境。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────
 * 博客前台（XHBlogs）的正文是 remark / rehype-highlight 在 **JS 里**着的色：只往标签上打
 * `hljs-*` 类名，颜色交给 CSS。整条链路跟 Python 环境毫无关系，所以前台**永远**是好的。
 *
 * 控制台资源页的预览正相反：它把后端 `contentHtml`（python-markdown + codehilite）直接
 * 注入预览区，而 codehilite 是靠 **Pygments** 吐内联 `style="color: …"` 的。
 * 服务器上没装 Pygments 时，python-markdown 会走兜底分支，只输出
 *   <pre class="codehilite"><code class="language-html">…转义后的纯文本…</code></pre>
 * 一个颜色都没有 —— 这就是「前台正常、控制台预览一片白」的全部原因。
 *
 * ── 这里怎么修 ──────────────────────────────────────────────────
 * 不要求服务器装任何东西：在浏览器里补一次色，语言集合和编辑器那份保持一致
 * （`globals.css` 里那 9 条 `.hljs-*` 规则现在同时挂在 `.editor-content-area`
 * 和 `.resource-preview` 上，所以配色天然是同一套）。
 *
 * ⚠️ 这个文件是**自包含**的：自带一份 lowlight 实例，**不 import 任何组件**。
 *    原因有两个：① 编辑器那边正在正常工作，别去动它；
 *    ② 从一个 `"use client"` 组件模块里取导出的值会拿到客户端引用代理，
 *       取不到真身（实测：调用静默失败，一个 span 都出不来）。
 *
 * 规则（和博客前台 `rehype-highlight` 的配置对齐）：
 *   · `detect: false` —— 没写语言就保持纯文本，**不猜**。猜错比不亮更糟。
 *   · 已经有着色的块一律不碰：后端装了 Pygments（内联 style）、
 *     或者编辑器吐出来的 HTML（本来就有 hljs-*）、又或者前台那条 rehype 链路。
 *   · 单个块失败只跳过它自己，绝不影响其它块，也绝不影响正文。
 */

import { createLowlight } from 'lowlight';

import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import dos from 'highlight.js/lib/languages/dos';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import lua from 'highlight.js/lib/languages/lua';
import markdown from 'highlight.js/lib/languages/markdown';
import matlab from 'highlight.js/lib/languages/matlab';
import nginx from 'highlight.js/lib/languages/nginx';
import php from 'highlight.js/lib/languages/php';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

/**
 * 只注册编辑器工具栏里那些语言（清单见 RichTextEditor 的 CODE_LANGUAGES）。
 * **绝不能用 lowlight 的 `all`**：那是 384 种语言、1.5 MB，会把首屏拖死。
 * jsx/tsx 走 javascript/typescript 的别名，html 走 xml 的别名，cmd/bat 走 dos 的别名。
 */
const lowlight = createLowlight({
  bash, c, cpp, csharp, css, diff, dockerfile, dos, go, ini, java, javascript, json,
  lua, markdown, matlab, nginx, php, powershell, python, rust, sql, typescript, xml, yaml,
});

/** lowlight 返回的是 hast，我们只会遇到 element(span) 和 text，手写个极小的序列化就够了 */
type HastNode = {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function serialize(node: HastNode): string {
  // ⚠️ lowlight 返回的顶层是 `root`（不是 element），漏了它整段就序列化成空串 ——
  //    表现是"函数跑了、语言也认出来了，可代码块还是白的"，实测踩过。
  if (node.type === 'root') return (node.children || []).map(serialize).join('');
  if (node.type === 'text') return escapeHtml(node.value || '');
  if (node.type !== 'element') return '';
  const inner = (node.children || []).map(serialize).join('');
  const cls = Array.isArray(node.properties?.className) ? (node.properties!.className as string[]).join(' ') : '';
  return cls ? `<span class="${escapeHtml(cls)}">${inner}</span>` : inner;
}

/** 这个块是不是已经上过色了（任何一条链路上的都算） */
function alreadyColored(code: Element): boolean {
  if (code.querySelector('[class*="hljs-"]')) return true;              // rehype-highlight / 编辑器
  return [...code.querySelectorAll('span')].some((s) => /color/i.test(s.getAttribute('style') || '')); // Pygments 内联色
}

/** 这块预览区挂过观察器没有（挂一次就够，避免重复挂） */
const observed = new WeakSet<HTMLElement>();

/** 真正的扫描 + 补色（不含观察器） */
function run(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('pre code').forEach((code) => {
    try {
      if (alreadyColored(code)) return;

      // 语言取围栏写的那门（markdown 会落成 class="language-xxx"）
      const match = /(?:^|\s)language-([\w+#.-]+)/.exec(code.className || '');
      const lang = (match ? match[1] : '').toLowerCase();
      if (!lang) return;                     // 没写语言 → 保持纯文本，和前台 detect:false 一致

      const text = code.textContent || '';
      if (!text.trim()) return;

      // 语言不在那份名单里时 lowlight 会抛错（不会退回自动猜色），跳过就行
      const tree = lowlight.highlight(lang, text) as unknown as HastNode;
      code.innerHTML = serialize(tree);
    } catch {
      /* 这一块保持原样（纯文本），不影响别的块 */
    }
  });
}

/**
 * 扫描 root 里的代码块并就地补色，同时挂一个观察器盯着它。
 *
 * ⚠️ 为什么不能只扫一次：预览这块 HTML 是 React 用 `dangerouslySetInnerHTML` 塞进来的，
 *    而且**后面还会被整体重设一遍**（切预览态 / 编辑器 onChange 后的那次提交）。
 *    实测：本函数跑完、92 个着色 span 都打好了，过一会儿整块又被换成纯文本 ——
 *    而那次重设并不会让调用方的 useEffect 重跑，所以颜色就没了。
 *    挂个 MutationObserver「内容被换掉就补一次」才稳；已经着色的会跳过，不会自我循环。
 */
export function highlightPreviewCode(root: HTMLElement) {
  if (!root) return;
  run(root);
  if (observed.has(root)) return;
  observed.add(root);

  let scheduled = 0;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = window.requestAnimationFrame(() => {
      scheduled = 0;
      run(root);
    });
  });
  observer.observe(root, { childList: true, subtree: true });
}
