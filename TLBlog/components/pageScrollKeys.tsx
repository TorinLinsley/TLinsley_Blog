"use client";

import { useEffect } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Home / End / PageUp / PageDown —— 永远作用在「整页」上。
 *
 * 要解决两个坑：
 *  ① 大纲（TOC）面板自己是 `overflow-y: auto`，点过条目后焦点留在面板里，
 *     这四个键会去滚那个小面板而不是整页（表现：Home/End 在大纲里跳）。
 *  ② 在正文里框选过文字之后，Home/End 会去动选区/光标（在那一行里定位），
 *     而不是回到页面顶/底。
 *
 * 所以：
 *  · `PageKeys` 挂在 layout 上，全局捕获这四个键，滚整页；
 *    但**输入框 / 文本域 / 富文本编辑器**里不抢（那儿 Home/End 就该移动光标），
 *    带 Shift（选择）、Ctrl/Alt（浏览器快捷键）的也不抢。
 *  · 只在「最近的滚动祖先就是整页」时接管；页面里那些自己会滚的容器
 *    （比如归档的卡片流 `h-[75vh] overflow-y-auto`）保持原生行为。
 *  · `.page-scroll-keys`（大纲面板）上再单独兜一层：面板没出现滚动条时
 *    最近的滚动祖先确实是整页，但面板里的键盘操作也不该把视野带走。
 */

const KEYS = ['Home', 'End', 'PageUp', 'PageDown'];

/** 按一下到底滚多少：和浏览器原生一致，翻一屏留一点重叠 */
function scrollPageFor(key: string) {
  if (key === 'Home') {
    window.scrollTo(0, 0);
  } else if (key === 'End') {
    window.scrollTo(0, document.documentElement.scrollHeight);
  } else {
    const step = Math.round(window.innerHeight * 0.9);
    window.scrollBy(0, key === 'PageDown' ? step : -step);
  }
}

/** 正在输入的地方（输入框、文本域、编辑器）不抢按键 */
function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** 离这个元素最近的可滚动祖先（不含整页本身）；没有就返回 null = 由整页来滚 */
function nearestScrollable(start: HTMLElement | null) {
  let cur: HTMLElement | null = start;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll)/.test(style.overflowY) && cur.scrollHeight > cur.clientHeight + 1) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/** 挂在大纲面板上的这一层（React 事件） */
export function pageScrollKeys(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented) return;
  const key = event.key;
  if (!KEYS.includes(key)) return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

  event.preventDefault();
  event.stopPropagation();
  scrollPageFor(key);
}

export default function PageKeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!KEYS.includes(event.key)) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;

      // 页面里自己会滚的容器（归档卡片流这种）交给它自己处理
      const scroller = nearestScrollable(event.target as HTMLElement | null);
      if (scroller && !scroller.classList.contains('page-scroll-keys')) return;

      event.preventDefault();
      scrollPageFor(event.key);
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return null;
}
