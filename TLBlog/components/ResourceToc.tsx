"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { pageScrollKeys } from './pageScrollKeys';

export type TocItem = { level: number; text: string; id: string };

function withNumbers(items: TocItem[]) {
  if (items.length === 0) return [];
  const base = Math.min(...items.map((i) => i.level));
  const n = [0, 0, 0, 0, 0, 0];
  return items.map((it) => {
    const lv = Math.min(6, Math.max(1, it.level - base + 1));
    n[lv - 1] += 1;
    for (let d = lv; d < 6; d += 1) n[d] = 0;
    const no = n.slice(0, lv).map((v) => v || 1).join('.');
    return { ...it, no, lv };
  });
}

const getSafeId = (rawText: string) =>
  'toc-' + (rawText || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase();

function findScroller(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll)/.test(style.overflowY) && cur.scrollHeight > cur.clientHeight) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function findJumpScroller(el: HTMLElement | null, boundary: HTMLElement | null): HTMLElement | null {
  const stop = boundary ? boundary.parentElement : null;
  let cur: HTMLElement | null = el;
  let fallback: HTMLElement | null = null;
  while (cur && cur !== stop) {
    if (/(auto|scroll)/.test(window.getComputedStyle(cur).overflowY)) {
      if (cur.scrollHeight > cur.clientHeight + 1) return cur;
      fallback = fallback ?? cur;
    }
    cur = cur.parentElement;
  }
  return fallback;
}

const NO_W: Record<number, string> = {
  1: 'min-w-[0.875rem]', 2: 'min-w-[1.5rem]', 3: 'min-w-[2.25rem]',
  4: 'min-w-[3rem]', 5: 'min-w-[3.75rem]', 6: 'min-w-[4.5rem]',
};
const BAR_W: Record<number, string> = { 1: 'w-[3px]', 2: 'w-[2px]', 3: 'w-px', 4: 'w-px', 5: 'w-px', 6: 'w-px' };

function findInnerScroller(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null;
  const divs = Array.from(container.querySelectorAll<HTMLElement>('div'));
  for (const el of divs) {
    const cs = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return null;
}

function levelClass(level: number, isActive: boolean) {
  const INDENT = ['mt-3', 'ml-2.5', 'ml-5', 'ml-7', 'ml-9', 'ml-11'];
  const SIZE = ['text-[1rem]', 'text-[0.94rem]', 'text-[0.88rem]', 'text-[0.84rem]', 'text-[0.8rem]', 'text-[0.76rem]'];
  const WEIGHT = ['font-black', 'font-semibold', 'font-normal', 'font-normal', 'font-normal', 'font-normal'];
  const COLOR = [
    'text-slate-800 dark:text-slate-100',
    'text-slate-600 dark:text-slate-300',
    'text-slate-500 dark:text-slate-400',
    'text-slate-500 dark:text-slate-400',
    'text-slate-400 dark:text-slate-500',
    'text-slate-400 dark:text-slate-500',
  ];
  const i = Math.min(6, Math.max(1, level)) - 1;
  const indent = INDENT[i];
  const size = SIZE[i];

  if (isActive) {
    return `${indent} ${size} font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 rounded-r-md`;
  }
  const weight = WEIGHT[i];
  const color = COLOR[i];
  return `${indent} ${size} ${weight} ${color} hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-slate-500/10 rounded-r-md`;
}

function barClass(level: number, isActive: boolean) {
  if (isActive) return 'bg-indigo-500';
  const BAR = [
    'bg-indigo-500/75',
    'bg-slate-300/90 dark:bg-slate-600/80',
    'bg-slate-200 dark:bg-slate-700',
    'bg-slate-200/80 dark:bg-slate-700/80',
    'bg-slate-200/70 dark:bg-slate-700/70',
    'bg-slate-200/60 dark:bg-slate-700/60',
  ];
  return BAR[Math.min(6, Math.max(1, level)) - 1];
}

function noClass(isActive: boolean) {
  return isActive ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500';
}

export default function ResourceToc({
  contentId,
  contentKey,
}: {
  contentId: string;
  contentKey: string;
}) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');
  const jumpLockRef = useRef(0);
  const onScrollRef = useRef<null | (() => void)>(null);

  const readHeadings = useCallback(() => {
    const container = document.getElementById(contentId);
    if (!container) return [] as HTMLElement[];
    return (Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[])
      .filter(h => h.offsetParent !== null);
  }, [contentId]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const timer = setTimeout(() => {
      const container = document.getElementById(contentId);
      if (!container) return;

      const headings = readHeadings();
      const used = new Map<string, number>();
      const next: TocItem[] = headings.map(h => {
        const text = (h.textContent || '').trim();
        const base = getSafeId(text);
        const n = (used.get(base) || 0) + 1;
        used.set(base, n);
        const id = n === 1 ? base : `${base}-${n}`;
        h.id = id;
        h.dataset.tocId = id;
        h.style.scrollMarginTop = '24px';
        return { level: Number(h.tagName[1]), text, id };
      });
      setItems(next);

      if (headings.length === 0) return;

      const onScroll = () => {
        if (Date.now() < jumpLockRef.current) return;
        const live = readHeadings();
        if (live.length === 0) return;
        const sc = findScroller(container) ?? findInnerScroller(container);
        const baseTop = sc ? sc.getBoundingClientRect().top : 0;
        const threshold = baseTop + 48;
        let current = '';
        for (const h of live) {
          if (h.getBoundingClientRect().top <= threshold) current = h.dataset.tocId || getSafeId((h.textContent || '').trim());
          else break;
        }
        if (current) setActiveId(current);
      };

      onScrollRef.current = onScroll;
      window.addEventListener('scroll', onScroll, { passive: true, capture: true });
      onScroll();
      cleanup = () => {
        window.removeEventListener('scroll', onScroll, { capture: true });
        if (onScrollRef.current === onScroll) onScrollRef.current = null;
      };
    }, 250);

    return () => {
      clearTimeout(timer);
      if (cleanup) cleanup();
    };
  }, [contentId, contentKey, readHeadings]);

  useEffect(() => {
    if (items.length === 0) return;
    const timers = [150, 600, 1500].map(ms => window.setTimeout(() => onScrollRef.current?.(), ms));
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [items]);

  const jump = (index: number, id: string, text: string) => {
    const live = readHeadings();
    const el = live.find(h => (h.textContent || '').trim() === text) ?? live[index];
    if (!el) return;

    jumpLockRef.current = Date.now() + 800;
    setActiveId(id);

    if (typeof document !== 'undefined' && document.body.style.overflow === 'hidden') {
      document.body.style.overflow = '';
    }

    const container = document.getElementById(contentId);
    const scroller = findJumpScroller(el.parentElement ?? el, container)
      ?? findInnerScroller(container)
      ?? findScroller(container);

    if (!scroller) {
      const delta = el.getBoundingClientRect().top - 24;
      window.scrollBy({ top: delta, behavior: 'auto' });
      return;
    }

    const delta = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <h3 className="shrink-0 font-black text-slate-900 dark:text-white text-base uppercase tracking-widest border-l-4 border-indigo-500 ml-5 pl-2 mt-5 mb-3">
        Table of Contents <span className="opacity-40 mx-0.5">|</span> <span className="tracking-normal">大纲</span>
      </h3>
      <nav
        className="page-scroll-keys flex-1 overflow-y-auto px-5 pb-5 custom-scrollbar flex flex-col gap-1.5"
        onKeyDownCapture={pageScrollKeys}
      >
        {items.length === 0 ? (
          <div className="text-[15px] text-slate-400 py-4">这篇文章还没有标题</div>
        ) : (
          withNumbers(items).map((item, index) => {
            const isActive = activeId === item.id;
            const lv = item.lv;
            return (
              <button
                key={`${item.id}-${index}`}
                type="button"
                data-toc-level={lv}
                onClick={(e) => { jump(index, item.id, item.text); e.currentTarget.blur(); }}
                className={`flex w-full items-start text-left py-0.5 transition-all duration-300 cursor-pointer ${levelClass(lv, isActive)}`}
              >
                <span className={`${NO_W[lv]} shrink-0 text-right font-mono tabular-nums leading-[1.55] ${lv === 1 ? 'text-[0.85em]' : lv <= 3 ? 'text-[0.8em]' : 'text-[0.75em]'} ${noClass(isActive)}`}>
                  {item.no}
                </span>
                <span aria-hidden className={`${BAR_W[lv]} shrink-0 self-stretch mx-1.5 rounded-full ${barClass(lv, isActive)}`} />
                <span className="flex-1 min-w-0 line-clamp-2">{item.text}</span>
              </button>
            );
          })
        )}
      </nav>
    </div>
  );
}




