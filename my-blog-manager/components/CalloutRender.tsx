// components/CalloutRender.tsx
"use client";

/**
 * Obsidian 风格的 Callout（标注块）——**预览端**的 DOM 增强。
 *
 * 背景：控制台的「资源分享」预览是后端（python-markdown）吐 HTML 的，
 * 拿到的就是普通 `<blockquote><p>[!info] 标题</p>…</blockquote>`，
 * 所以里面写的 `> [!info] …` 只会显示成一段带竖线的引用。
 * 前台博客那一侧是 Node 管线（rehypeCallout）渲染的，早就变成带图标的框了。
 *
 * 这里在前端把预览里的引号块就地换成同一套结构（跟 rehypeCallout 完全一致）：
 *
 *   <div class="callout callout-info not-prose" data-callout="info">
 *     <div class="callout-title"><span class="callout-icon">图标</span><span class="callout-title-text">标题</span></div>
 *     <div class="callout-body">正文……</div>
 *   </div>
 *
 * ⚠️ 两条铁律：
 *   1. **只动预览的 DOM，不碰后端返回的 HTML 字符串**，所以编辑器加载内容那条路一点没变。
 *   2. **跳过 `.editor-content-area`**：编辑器里必须保留 `[!info]` 原文（可编辑），
 *      外观交给 CalloutDecoration 那套 ProseMirror 装饰。
 */

import { useEffect } from 'react';

const SCOPE = '.prose, .resource-preview';
const SKIP_INSIDE = '.editor-content-area';

/** `> [!info] 标题` / `> [!note]- 标题`（末尾 - / + 是 Obsidian 的折叠标记，这里只吃掉符号） */
const MARKER = /^\s*\[!\s*([A-Za-z0-9_-]+)\s*\]\s*([-+]?)\s*([\s\S]*)$/;

/** 图标：内联 SVG，跟着文字颜色走（stroke=currentColor） */
const wrap = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<string, string> = {
  note: wrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/>'),
  tip: wrap('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z"/>'),
  hint: wrap('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z"/>'),
  success: wrap('<path d="M20 6 9 17l-5-5"/>'),
  check: wrap('<path d="M20 6 9 17l-5-5"/>'),
  done: wrap('<path d="M20 6 9 17l-5-5"/>'),
  warning: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  caution: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  attention: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  danger: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  error: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  failure: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  bug: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  question: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  help: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  faq: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  quote: wrap('<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M15 7h2v4a4 4 0 0 1-4 4"/>'),
  cite: wrap('<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M15 7h2v4a4 4 0 0 1-4 4"/>'),
  example: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  abstract: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  summary: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  todo: wrap('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>'),
};

const DEFAULT_ICON = ICONS.note;

function convert(blockquote: HTMLElement) {
  if (blockquote.dataset.calloutReady === '1') return;
  if (blockquote.classList.contains('callout')) return;

  // 只认「引用块里的第一个段落」是不是 [!type] 标记，普通引用一个字都不碰
  const first = Array.from(blockquote.children).find((el) => el.tagName === 'P') as HTMLElement | undefined;
  if (!first) return;

  const match = (first.textContent || '').match(MARKER);
  if (!match) return;

  const type = match[1].toLowerCase();
  const title = (match[3] || '').trim() || type.charAt(0).toUpperCase() + type.slice(1);

  blockquote.dataset.calloutReady = '1';

  const box = document.createElement('div');
  box.className = `callout callout-${type} not-prose`;
  box.setAttribute('data-callout', type);

  const titleRow = document.createElement('div');
  titleRow.className = 'callout-title';
  const icon = document.createElement('span');
  icon.className = 'callout-icon';
  icon.innerHTML = ICONS[type] || DEFAULT_ICON; // 固定常量，不含外部输入
  const titleText = document.createElement('span');
  titleText.className = 'callout-title-text';
  titleText.textContent = title;
  titleRow.append(icon, titleText);

  // 标记所在的那个段落已经被标题行取代了，剩下的子节点才是正文
  const body = document.createElement('div');
  body.className = 'callout-body';
  Array.from(blockquote.children).forEach((child) => {
    if (child !== first) body.appendChild(child);
  });

  box.appendChild(titleRow);
  if (body.childNodes.length) box.appendChild(body);
  blockquote.replaceWith(box);
}

export default function CalloutRender() {
  useEffect(() => {
    const attach = () => {
      document.querySelectorAll<HTMLElement>(SCOPE).forEach((scope) => {
        if (scope.closest(SKIP_INSIDE)) return; // 编辑器里保留 [!info] 原文
        scope.querySelectorAll<HTMLElement>('blockquote').forEach((bq) => {
          if (bq.closest(SKIP_INSIDE)) return;
          convert(bq);
        });
      });
    };

    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          attach();
        });
      }
    };

    schedule();
    // 预览内容是切文件时重新灌进来的，所以盯着 DOM 变化重新扫一遍
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
