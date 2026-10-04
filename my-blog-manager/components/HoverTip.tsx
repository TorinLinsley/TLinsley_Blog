"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 🖱️ 全站悬停提示：只用网页自己的深色气泡，**彻底不用浏览器原生的 title 提示**。
 *
 * 之前是两种提示混在一起：
 *   · 一些按钮写了 `data-tip`，靠 CSS 的 `[data-tip]::after` 画气泡（现在这段 CSS 修好了才真的显示出来）；
 *   · 另一些按钮只写了原生 `title` —— 于是鼠标一停，系统那个浅色方框也冒出来，和网页风格完全不搭，
 *     有时候两个提示还叠在一起 ✗
 *
 * 这里一次性收干净，**所有**有提示的地方都走同一个气泡：
 *   ① 原生 `title` → 自动转成 `data-tip`（并补一份 `aria-label`，无障碍和自动化都不受影响）；
 *   ② `data-tip` 的气泡改成 portal 渲染 —— 贴在元素上/下方，空间不够自动翻面，
 *      再也不会被面板的 overflow:hidden 裁掉半截（原来那些只敢写 title 的按钮就是怕被裁）。
 *
 * ⚠️ 正文内容（编辑器里的 .ProseMirror、预览 .resource-preview/.prose、卡片预览…）一律不碰：
 *    那些 title 是文章自己的内容，改了会写回 .md。只处理 UI 外壳。
 */

/** 正文区域：里面的 title 属于文章内容，绝不能动 */
const CONTENT_SELECTOR = '.ProseMirror, .resource-preview, .prose, .chatter-preview, [contenteditable="true"]';

/** 已经有自己气泡的组件（Tooltip）——不用我们再管，免得两层气泡叠一起 */
const OWN_TIP_SELECTOR = '[data-tooltip-anchor]';

/** 这些标签的 title 不是「悬停提示」（有的是给读屏/SEO 用的），别乱转 */
const SKIP_TAGS = new Set(['HTML', 'HEAD', 'BODY', 'LINK', 'META', 'STYLE', 'SCRIPT', 'TITLE', 'BASE', 'IFRAME', 'AUDIO', 'VIDEO', 'TRACK', 'SOURCE', 'OBJECT', 'EMBED']);

/** 气泡的定位/文案 */
type Tip = { text: string; x: number; y: number; place: 'top' | 'bottom' };

const room = 48; // 气泡高约 28px + 间距，两侧都留点余量再决定翻不翻面

export default function HoverTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const anchorRef = useRef<Element | null>(null);

  /** 原生 title → data-tip（只转 UI 外壳里的） */
  const convertTitles = useCallback(() => {
    const nodes = document.querySelectorAll('[title]');
    nodes.forEach((el) => {
      if (SKIP_TAGS.has(el.tagName)) return;
      if (el.closest(CONTENT_SELECTOR)) return;          // 正文内容不碰
      if (el.closest(OWN_TIP_SELECTOR)) return;          // 已经有自己的气泡了
      const text = el.getAttribute('title');
      if (!text || !text.trim()) return;
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
      if (!el.hasAttribute('data-tip')) el.setAttribute('data-tip', text);
      el.removeAttribute('title');                        // ← 原生提示就此消失
    });
  }, []);

  // 持续盯着：组件是懒加载/条件渲染的（编辑器、弹窗、树里的行…），晚出现的也要转
  useEffect(() => {
    let raf = 0;
    const run = () => { raf = 0; convertTitles(); };
    const schedule = () => { if (!raf) raf = window.requestAnimationFrame(run); };

    convertTitles();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
    return () => { mo.disconnect(); if (raf) window.cancelAnimationFrame(raf); };
  }, [convertTitles]);

  // 悬停/聚焦 → 显示气泡；移开/失焦/滚动/点击 → 收起来
  useEffect(() => {
    const show = (el: Element) => {
      if (el.closest(CONTENT_SELECTOR) || el.closest(OWN_TIP_SELECTOR)) { setTip(null); return; }
      const text = el.getAttribute('data-tip');
      if (!text) { setTip(null); return; }
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) { setTip(null); return; }
      const above = r.top >= room;
      anchorRef.current = el;
      setTip({ text, x: r.left + r.width / 2, y: above ? r.top : r.bottom, place: above ? 'top' : 'bottom' });
    };
    const hide = () => { anchorRef.current = null; setTip(null); };

    const onOver = (e: Event) => {
      const t = e.target as Element | null;
      const el = t?.closest?.('[data-tip]');
      if (!el) { hide(); return; }
      if (el === anchorRef.current && tip) return;
      show(el);
    };
    const onOut = (e: Event) => {
      const related = (e as MouseEvent).relatedTarget as Element | null;
      if (anchorRef.current && related && anchorRef.current.contains(related)) return;
      hide();
    };
    const onFocusIn = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]');
      if (el) show(el); else hide();
    };

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('mousedown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide, true);
    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('mousedown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide, true);
    };
  }, [tip]);

  if (!tip || typeof document === 'undefined') return null;

  return createPortal(
    <span
      data-tooltip
      aria-hidden="true"
      className="fixed z-[9999] pointer-events-none"
      style={{ left: tip.x, top: tip.y }}
    >
      <span
        className={`block rounded-[0.6rem] px-2.5 py-1.5 text-white font-semibold shadow-2xl ${
          tip.place === 'top'
            ? '-translate-x-1/2 -translate-y-[calc(100%+8px)]'
            : '-translate-x-1/2 translate-y-2'
        }`}
        style={{
          background: 'rgba(15, 23, 42, 0.97)',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.35)',
          fontSize: '0.95rem',
          lineHeight: 1.35,
          maxWidth: 'min(78vw, 32rem)',
          textAlign: 'center',
        }}
      >
        {tip.text}
      </span>
    </span>,
    document.body
  );
}
