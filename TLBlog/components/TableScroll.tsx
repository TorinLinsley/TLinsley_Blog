"use client";


import { useEffect } from 'react';

const PIXELS_PER_NOTCH = 80;
const EASING = 0.16;
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

      if (!event.shiftKey) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;

      const raw = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!raw) return;

      event.preventDefault();
      event.stopPropagation();

      let state = states.get(el);
      if (!state) {
        state = { target: el.scrollLeft, frame: 0 };
        states.set(el, state);
      }

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