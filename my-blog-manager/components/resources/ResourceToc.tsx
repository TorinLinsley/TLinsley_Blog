"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { pageScrollKeys } from '../pageScrollKeys';

export type TocItem = { level: number; text: string; id: string };

/**
 * 给大纲条目加层级序号：1 / 1.1 / 1.2 / 2 / 2.1.1 …
 * 三级各自独立计数，遇到上一级就归零，这样"谁属于谁"在文字上也一眼看得出来。
 * （和博客前台 TLBlog/components/ResourceToc.tsx 保持一致，改一边记得改另一边。）
 */
function withNumbers(items: TocItem[]) {
  if (items.length === 0) return [];
  // 以「实际出现的最浅一级」当第 1 级：有的文章只有三级标题（h3），
  // 直接照 tagName 编号会变成 1.1.1 / 1.1.2 这种莫名其妙的前缀。
  const base = Math.min(...items.map((i) => i.level));
  /**
   * 🌟 1~6 级全都算数。
   *   以前这里把 4/5/6 级**强行压成第 3 级**（Math.min(3, …)），于是大纲里
   *   H4/H5/H6 显示得跟 H3 一模一样，还会被当成"第三级"接着编号 ✗
   *   现在 n[0]~n[5] 分别是 1~6 级的计数器，进到某一级就把更深的那些清零 ✓
   */
  const n = [0, 0, 0, 0, 0, 0];
  return items.map((it) => {
    const lv = Math.min(6, Math.max(1, it.level - base + 1));
    n[lv - 1] += 1;
    for (let d = lv; d < 6; d += 1) n[d] = 0;
    // 序号按层级拼起来：1 / 1.1 / 1.1.1 / 1.1.1.1 …（父级还没出现过就按 1 算）
    const no = n.slice(0, lv).map((v) => v || 1).join('.');
    // lv 一起带出来：视觉层级也用"归一化后的级别"，
    // 这样只有三级标题的文章不会整篇都缩到最深那一档。
    return { ...it, no, lv };
  });
}

// 🌟 与项目原有的 ClientTOC.tsx 保持完全一致的 ID 生成规则
const getSafeId = (rawText: string) =>
  'toc-' + (rawText || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase();

/** 向上找到第一个真正可滚动的祖先元素 */
function findScroller(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll)/.test(style.overflowY) && cur.scrollHeight > cur.clientHeight) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * 跳转时"到底该滚哪一层"。
 *
 * 两条约束：
 *   ① 只在正文容器（内容区）**以内**找，绝不继续往上 —— 否则会把整个面板/整页滚走；
 *   ② 优先选"真的能滚"的那层（scrollHeight > clientHeight）：
 *      编辑态里标题外面是 .ProseMirror（一般不滚），再外面那层 overflow-y-auto 才是滚动容器；
 *      只按 CSS 上写着 auto/scroll 就返回的话，可能拿到一个滚不动的东西，表现就是"点了没反应"。
 */
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

/** 序号列的宽度：按各级最长序号取值并右对齐，这样同一级的竖线能上下对齐成一条 */
const NO_W: Record<number, string> = {
  1: 'min-w-[0.875rem]', 2: 'min-w-[1.5rem]', 3: 'min-w-[2.25rem]',
  4: 'min-w-[3rem]', 5: 'min-w-[3.75rem]', 6: 'min-w-[4.5rem]',   // 4~6 级的序号更长（1.1.1.1…），列也要更宽
};
/** 竖线宽度：一级最粗、三级最细 */
const BAR_W: Record<number, string> = { 1: 'w-[3px]', 2: 'w-[2px]', 3: 'w-px', 4: 'w-px', 5: 'w-px', 6: 'w-px' };

/**
 * 在容器**内部**找真正能滚的那一层。
 *
 * 为什么需要它：各处的结构不一样 ——
 *   · 控制台编辑态：滚动容器（编辑器里的 div.overflow-y-auto）在 #resource-content **里面**；
 *   · 控制台预览态：同上的预览层也在里面；
 *   · 博客前台：滚动容器是正文容器的**父级**（外面）。
 * 所以监听滚动时要"先往上找、找不到再往下找"，否则会挂到 window 上，
 * 结果就是滚正文时大纲一直不高亮（点击前高亮是 -1 就是这个原因）。
 */
function findInnerScroller(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null;
  const divs = Array.from(container.querySelectorAll<HTMLElement>('div'));
  for (const el of divs) {
    const cs = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return null;
}

/**
 * 大纲条目的层级样式。
 *
 * 结构是「序号 │ 标题」三栏 flex：
 *   ① 序号在最左边（**在竖线左边**，不是竖线右边）
 *   ② 中间一条竖线：一级 3px 蓝条 / 二级 2px 灰条 / 三级 1px 浅灰细线
 *   ③ 右边是标题
 * 层级靠"缩进 + 竖线粗细 + 字号字重"三重线索区分：
 *   缩进 0 / +10px / +20px，字号 1rem / 0.94rem / 0.88rem，字重 900 / 600 / 400。
 *
 * ⚠️ 颜色、字重必须写在各自的"分支"里，不要写成「基础类 + 覆盖类」：
 *    Tailwind 里 text-slate-600 和 text-indigo-600 是同一类工具类，谁生效取决于
 *    它们在 CSS 里的先后顺序，而不是 class 的书写顺序 —— 写两遍必然翻车。
 *    （这份实现和博客前台 TLBlog/components/ResourceToc.tsx 是**故意保持一致**的，
 *      改一边记得改另一边。）
 */
function levelClass(level: number, isActive: boolean) {
  // 🌟 1~6 级各有一档：缩进逐级加深、字号逐级变小、字重/颜色逐级变淡（绝不再把 4~6 级并成一档 ✗）
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

/** 中间那条竖线的颜色（选中时整条变蓝） */
function barClass(level: number, isActive: boolean) {
  if (isActive) return 'bg-indigo-500';
  // 越深越淡：1 级最亮最粗，6 级最浅最细
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

/** 序号本身的颜色（比标题淡一点，不抢戏；选中时跟着变蓝） */
function noClass(isActive: boolean) {
  return isActive ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500';
}

export default function ResourceToc({
  contentId,
  contentKey,
}: {
  contentId: string;
  /** 内容变化的标识（文章路径 / 模式 / 编辑版本号），变化时重新扫描标题 */
  contentKey: string;
}) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');
  /** 刚点完大纲的时间戳：这段时间内不让滚动位置改写高亮 */
  const jumpLockRef = useRef(0);
  /** 最近一次扫描时挂上的"按滚动位置算高亮"的函数，供下面的补测调用 */
  const onScrollRef = useRef<null | (() => void)>(null);

  /**
   * 只在正文容器里找「当前可见」的标题。
   *
   * ⚠️ 绝对不要依赖"扫描时存下来的东西"来定位标题。
   *    编辑态的正文在 tiptap/ProseMirror 里，DOM 由编辑器自己管理：
   *      · 手动挂上去的 id 会在节点重建时被抹掉 → getElementById 返回 null；
   *      · 扫描时拿到的元素引用也可能已经脱离文档（isConnected === false）。
   *    实测症状：点大纲既不滚动也不高亮（函数在找到元素之前就 return 了）。
   *    正确做法：**点击 / 滚动的那一刻重新查一遍 DOM**，用标题文字来配对。
   */
  const readHeadings = useCallback(() => {
    const container = document.getElementById(contentId);
    if (!container) return [] as HTMLElement[];
    return (Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[])
      .filter(h => h.offsetParent !== null);
  }, [contentId]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    // 防抖：编辑时每敲一个字都会变 key，250ms 内的连续变化只扫一次
    const timer = setTimeout(() => {
      const container = document.getElementById(contentId);
      if (!container) return;

      // 编辑态与预览态的内容同时存在（一个被隐藏），只取可见的那些
      const headings = readHeadings();
      const next: TocItem[] = headings.map(h => {
        const text = (h.textContent || '').trim();
        const id = getSafeId(text);
        h.id = id;                              // 预览态是静态 HTML，这个 id 有用；编辑态会丢，所以下面不依赖它
        h.style.scrollMarginTop = '24px';
        return { level: Number(h.tagName[1]), text, id };
      });
      setItems(next);

      if (headings.length === 0) return;

      // 滚动容器在"这一刻"可能还没排好版（编辑器/预览首帧），所以监听不绑定具体元素，
      // 而是用**捕获阶段**挂在 window 上：任何后代的滚动事件都会被收到，之后每次再现场找滚动容器。
      const onScroll = () => {
        // ⏳ 刚点完大纲的 800ms 内不要用滚动位置改高亮（避免和跳转打架）
        if (Date.now() < jumpLockRef.current) return;
        const live = readHeadings();            // 每次重新查，避免用到已经失效的元素
        if (live.length === 0) return;
        const sc = findScroller(container) ?? findInnerScroller(container);
        const baseTop = sc ? sc.getBoundingClientRect().top : 0;
        // 阈值只留一点点余量（原来 130px 会把目标下面一百多像素内的小标题也算成"当前"）
        // 48px：比"首标题距顶部"的留白(32px)大一点，顶部时首条才算"当前"；又远小于两条标题间距(~100px)，不会误判到下一条
        const threshold = baseTop + 48;
        let current = '';
        for (const h of live) {
          if (h.getBoundingClientRect().top <= threshold) current = getSafeId((h.textContent || '').trim());
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

  /**
   * 标题列表就绪后补测几次高亮。
   * 编辑器/预览首帧常常还没排版完，那一刻量出来的位置是 0，
   * 结果就是"刚进编辑态一条都不高亮"，所以隔几拍再各算一次。
   */
  useEffect(() => {
    if (items.length === 0) return;
    const timers = [150, 600, 1500].map(ms => window.setTimeout(() => onScrollRef.current?.(), ms));
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [items]);

  /**
   * 点大纲跳转到对应标题。
   *
   * ⚠️ 不能用 el.scrollIntoView()：它会把这个元素的**所有**可滚动祖先一起滚，
   * 连外层容器/整页都会跟着动（效果就是"点一下大纲，整个界面往上跑了"）。
   * 这里只滚正文自己那个滚动容器，父级一律不动。
   *
   * ⚠️ 定位标题：点击这一刻重新查 DOM，用"标题文字"配对（找不到再退回序号）。
   *    不能靠扫描时存下来的 id/元素引用 —— 编辑态在 tiptap 里，
   *    手动挂的 id 会被 ProseMirror 重建节点时丢掉，存下来的引用也可能已脱离文档。
   */
  const jump = (index: number, id: string, text: string) => {
    // 点击这一刻重新查 DOM：编辑器那边存下来的引用/id 都可能已经失效
    const live = readHeadings();
    const el = live.find(h => (h.textContent || '').trim() === text) ?? live[index];
    if (!el) return;

    // 先钉住高亮：点谁高亮谁，滚动动画期间不被滚动位置改写
    jumpLockRef.current = Date.now() + 800;
    setActiveId(id);

    // 📱 手机上大纲装在抽屉里，此刻 body 被锁了滚动 —— 不放开的话窗口滚不动，
    //    表现就是「点了没反应」。⚠️ 这里**只解锁、不收抽屉**：抽屉留不留由用户自己点。
    if (typeof document !== 'undefined' && document.body.style.overflow === 'hidden') {
      document.body.style.overflow = '';
    }

    const container = document.getElementById(contentId);
    const scroller = findJumpScroller(el.parentElement ?? el, container)
      ?? findInnerScroller(container)
      ?? findScroller(container);

    // 兜底：万一它三个都找不到（正文跟着整页滚、里面没有任何滚动容器），就滚窗口
    if (!scroller) {
      const delta = el.getBoundingClientRect().top - 24;
      window.scrollBy({ top: delta, behavior: 'auto' });
      return;
    }

    // 直接瞬间定位（不再用 behavior:'smooth'）：
    // 平滑滚动在编辑器里会被"失焦重排"打断，实测落点会偏（而且时好时坏）；
    // 直接赋 scrollTop 是同步的、结果确定，点哪条就停在哪条。
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
                {/* ① 序号：放在竖线**左边**，右对齐 */}
                <span className={`${NO_W[lv]} shrink-0 text-right font-mono tabular-nums leading-[1.55] ${lv === 1 ? 'text-[0.85em]' : lv <= 3 ? 'text-[0.8em]' : 'text-[0.75em]'} ${noClass(isActive)}`}>
                  {item.no}
                </span>
                {/* ② 竖线：不再是 button 的 border-left，因为那样序号只能待在竖线右边 */}
                <span aria-hidden className={`${BAR_W[lv]} shrink-0 self-stretch mx-1.5 rounded-full ${barClass(lv, isActive)}`} />
                {/* ③ 标题 */}
                <span className="flex-1 min-w-0 line-clamp-2">{item.text}</span>
              </button>
            );
          })
        )}
      </nav>
    </div>
  );
}




