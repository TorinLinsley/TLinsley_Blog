// components/TableScroll.tsx
"use client";

/**
 * 表格横向滚动：外层套一个滚动容器 + 桌面端 Shift+滚轮平滑横滚。
 *
 * ⚠️ 结构：滚动容器必须在表格**外面**（.table-scroll）。
 *    直接在 <table> 上写 overflow-x:auto 再让它 max-content 宽，
 *    表格盒子自己会撑出卡片 —— 必须"外层收口 100%、内层按内容自然宽"。
 *
 * 桌面端滚轮行为（可调）：
 *   - 不按 Shift：交给页面正常上下滚，不干预
 *   - 按住 Shift：按下面两个常量横向滚动
 *       PIXELS_PER_NOTCH 一格滚轮滚多少像素（原生一格 deltaY 约 100，太"硬"，这里换算成自定义值）
 *       EASING           缓动系数（0~1，越小越柔；0.16 左右手感接近触控板的惯性滑动）
 */

import { useEffect } from 'react';

/** 一格滚轮横向滚多少像素（想更细腻就调小，例如 1 就是每格 1 像素；想更快就调大） */
const PIXELS_PER_NOTCH = 80;
/** 缓动系数：每帧向目标靠近的比例，越小越柔（建议 0.12 ~ 0.25） */
const EASING = 0.16;
/** 原生一格滚轮的 deltaY 基准值（Chromium 约 100，触控板会更小） */
const NATIVE_NOTCH = 100;

const TABLE_SELECTOR = '.prose table, .resource-preview table';
const SKIP_INSIDE = '.editor-content-area';

export default function TableScroll() {
  useEffect(() => {
    const states = new WeakMap<HTMLElement, { target: number; frame: number }>();

    const animate = (el: HTMLElement) => {
      const state = states.get(el);
      if (!state) return;

      const diff = state.target - el.scrollLeft;
      if (Math.abs(diff) < 0.5) {
        el.scrollLeft = state.target;
        state.frame = 0;
        return;
      }

      el.scrollLeft += diff * EASING;
      state.frame = window.requestAnimationFrame(() => animate(el));
    };

    const onWheel = (event: WheelEvent) => {
      const el = event.currentTarget as HTMLElement;

      if (!event.shiftKey) return; // 不按 Shift：页面正常上下滚
      if (el.scrollWidth <= el.clientWidth + 1) return; // 没超出：不拦

      const raw = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!raw) return;

      event.preventDefault();
      event.stopPropagation();

      let state = states.get(el);
      if (!state) {
        state = { target: el.scrollLeft, frame: 0 };
        states.set(el, state);
      }

      // 把原生 delta 换算成"每格 N 像素"，再累加到目标位置（连滚会平滑叠加，不会一顿一顿）
      const notches = raw / NATIVE_NOTCH;
      const max = el.scrollWidth - el.clientWidth;
      state.target = Math.max(0, Math.min(max, state.target + notches * PIXELS_PER_NOTCH));

      if (!state.frame) state.frame = window.requestAnimationFrame(() => animate(el));
    };

    const attach = () => {
      document.querySelectorAll<HTMLElement>(TABLE_SELECTOR).forEach((table) => {
        if (table.closest(SKIP_INSIDE)) return;
        if (table.dataset.tableScrollReady === '1') return;
        table.dataset.tableScrollReady = '1';

        const parent = table.parentElement;
        if (parent && parent.classList.contains('table-scroll')) {
          parent.addEventListener('wheel', onWheel, { passive: false });
          return;
        }

        const scroller = document.createElement('div');
        scroller.className = 'table-scroll';
        parent?.insertBefore(scroller, table);
        scroller.appendChild(table);
        scroller.addEventListener('wheel', onWheel, { passive: false });
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
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
