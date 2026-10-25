"use client";
import { useEffect, useState } from 'react';
import { pageScrollKeys } from './pageScrollKeys';

type TocItem = {
  level: number;
  text: string;
  id: string;
};

const cleanMarkdownHeading = (rawText: string) => {
  if (!rawText) return '';
  return rawText
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/[*_~`#]/g, '')
    .trim();
};

const getSafeId = (rawText: string) => {
  const cleanText = cleanMarkdownHeading(rawText);
  return 'toc-' + cleanText
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .toLowerCase();
};

function dedupeIds(texts: string[]): string[] {
  const used = new Map<string, number>();
  return texts.map((text) => {
    const base = getSafeId(text);
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

const getDisplayText = (rawText: string) => {
  return cleanMarkdownHeading(rawText);
};

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

const NO_W: Record<number, string> = {
  1: 'min-w-[0.875rem]', 2: 'min-w-[1.5rem]', 3: 'min-w-[2.25rem]',
  4: 'min-w-[3rem]', 5: 'min-w-[3.75rem]', 6: 'min-w-[4.5rem]',
};
const BAR_W: Record<number, string> = { 1: 'w-[3px]', 2: 'w-[2px]', 3: 'w-px', 4: 'w-px', 5: 'w-px', 6: 'w-px' };

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

export default function ClientTOC({ toc, panelClass = 'bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl' }: { toc: TocItem[]; panelClass?: string }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const contentDiv = document.getElementById('article-content');
    if (!contentDiv) return;

    const headings = Array.from(contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    const headingIds = dedupeIds(headings.map((heading) => heading.textContent || ''));
    headings.forEach((heading, index) => {
      heading.id = headingIds[index];
    });

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const offset = 150;

      let currentActiveId = "";

      for (const heading of headings) {
        const elementTop = heading.getBoundingClientRect().top + scrollY;
        if (scrollY >= elementTop - offset) {
          currentActiveId = heading.id;
        } else {
          break;
        }
      }

      if (currentActiveId) setActiveId(currentActiveId);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    setTimeout(handleScroll, 100);

    return () => window.removeEventListener('scroll', handleScroll);
  }, [toc]);

  const scrollToHeading = (e: React.MouseEvent, id: string) => {
    e.preventDefault();

    const targetElement = document.getElementById(id);
    if (!targetElement) return;

    const offset = 100;
    const targetY = targetElement.getBoundingClientRect().top + window.scrollY - offset;
    const startY = window.scrollY;
    const distance = targetY - startY;
    const duration = 600;
    let startTime: number | null = null;

    const easeInOutCubic = (t: number, b: number, c: number, d: number) => {
      t /= d / 2;
      if (t < 1) return c / 2 * t * t * t + b;
      t -= 2;
      return c / 2 * (t * t * t + 2) + b;
    };

    const animation = (currentTime: number) => {
      if (startTime === null) startTime = currentTime;
      const timeElapsed = currentTime - startTime;

      const nextY = easeInOutCubic(timeElapsed, startY, distance, duration);
      window.scrollTo(0, nextY);

      if (timeElapsed < duration) {
        requestAnimationFrame(animation);
      } else {
        window.scrollTo(0, targetY);
      }
    };

    requestAnimationFrame(animation);
    setActiveId(id);
  };

  if (!toc || toc.length === 0) return null;

  const tocIds = dedupeIds(toc.map((item) => item.text));

  return (
    <div
      className={`page-scroll-keys max-lg:hidden ${panelClass} rounded-3xl p-6 border border-white/40 dark:border-white/10 shadow-xl sticky top-28 transition-colors duration-700 max-h-[75vh] overflow-y-auto custom-scrollbar`}
      onKeyDownCapture={pageScrollKeys}
    >
      <h3 className="font-black text-slate-900 dark:text-white mb-4 border-l-4 border-indigo-500 pl-2 text-sm uppercase tracking-widest">
        Table of Contents
      </h3>
      <nav className="flex flex-col gap-1.5">
        {withNumbers(toc).map((item, index) => {
          const displayText = getDisplayText(item.text);

          const safeId = tocIds[index];
          const isActive = activeId === safeId;
          const lv = item.lv;

          return (
            <button
              key={index}
              data-toc-level={lv}
              onClick={(e) => { scrollToHeading(e, safeId); e.currentTarget.blur(); }}
              className={`flex w-full items-start text-left py-0.5 transition-all duration-300 cursor-pointer ${levelClass(lv, isActive)}`}
            >
              <span className={`${NO_W[lv]} shrink-0 text-right font-mono tabular-nums leading-[1.55] ${lv === 1 ? 'text-[0.85em]' : lv <= 3 ? 'text-[0.8em]' : 'text-[0.75em]'} ${noClass(isActive)}`}>
                {item.no}
              </span>
              <span aria-hidden className={`${BAR_W[lv]} shrink-0 self-stretch mx-1.5 rounded-full ${barClass(lv, isActive)}`} />
              <span className="flex-1 min-w-0 line-clamp-2">{displayText}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}