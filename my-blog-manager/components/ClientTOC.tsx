"use client";
import { useEffect, useState } from 'react';
import { pageScrollKeys } from './pageScrollKeys';

type TocItem = {
  level: number;
  text: string;
  id: string;
};

// 🌟 核心增幅：终极 Markdown 净化器！
// 专门用来扒掉诸如 [链接名字](https://...) 的外壳，只留下 "链接名字"
const cleanMarkdownHeading = (rawText: string) => {
  if (!rawText) return '';
  return rawText
    // 1. 提取超链接中的文本内容：[我的标题](https://...) -> 我的标题
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 2. 去除 Markdown 图片：![图片](URL) -> 图片
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // 3. 兜底防御：去除可能混入的 HTML 标签
    .replace(/<\/?[^>]+(>|$)/g, '')
    // 4. 去除加粗、斜体、删除线、行内代码符号等
    .replace(/[*_~`#]/g, '')
    .trim();
};

// 🌟 底层 ID 净化器
const getSafeId = (rawText: string) => {
  // 先把超链接外壳扒掉，得到纯文本
  const cleanText = cleanMarkdownHeading(rawText);
  // 再杀掉所有标点、空格，只保留汉字、字母和数字生成绝对安全的 ID
  return 'toc-' + cleanText
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .toLowerCase();
};

// 🌟 侧边栏视觉净化器
const getDisplayText = (rawText: string) => {
  // 直接调用终极净化器，展示纯洁无瑕的标题名！
  return cleanMarkdownHeading(rawText);
};

/**
 * 大纲条目的层级样式（和 resources/ResourceToc.tsx 用同一套视觉语言）：
 *   ① 序号列：1 / 1.1 / 1.2 …（右对齐，同级竖线能对齐成一条）
 *   ② 竖线：一级 3px 蓝色粗条 / 二级 2px 灰条 / 三级 1px 浅灰细线
 *   ③ 缩进 + 字号字重：一级最显眼，往下依次减弱
 *
 * ⚠️ 颜色/字重必须写在各自分支里，不能「基础类 + 覆盖类」——
 *    Tailwind 同种工具类谁生效看 CSS 顺序，不看 class 书写顺序。
 */
/**
 * 给大纲条目加层级序号：1 / 1.1 / 1.2 / 2 / 2.1.1 …
 * 三级各自独立计数，遇到上一级就归零，这样"谁属于谁"在文字上也一眼看得出来。
 * （和 resources/ResourceToc.tsx、博客前台 TLBlog/components/ClientTOC.tsx 保持一致，改一边记得改另一边。）
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

/** 序号列的宽度：按各级最长序号取值并右对齐，这样同一级的竖线能上下对齐成一条 */
const NO_W: Record<number, string> = {
  1: 'min-w-[0.875rem]', 2: 'min-w-[1.5rem]', 3: 'min-w-[2.25rem]',
  4: 'min-w-[3rem]', 5: 'min-w-[3.75rem]', 6: 'min-w-[4.5rem]',   // 4~6 级的序号更长（1.1.1.1…），列也要更宽
};
/** 竖线宽度：一级最粗、三级最细 */
const BAR_W: Record<number, string> = { 1: 'w-[3px]', 2: 'w-[2px]', 3: 'w-px', 4: 'w-px', 5: 'w-px', 6: 'w-px' };

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

export default function ClientTOC({ toc }: { toc: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const contentDiv = document.getElementById('article-content');
    if (!contentDiv) return;

    const headings = Array.from(contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    // 🌟 强制统一正文 ID
    headings.forEach((heading) => {
      // heading.textContent 拿到的是渲染后的纯文字（已经没有超链接语法了）
      // 再过一遍 getSafeId，确保正文和侧边栏的 ID 100% 对齐！
      heading.id = getSafeId(heading.textContent || '');
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
    // 🌟 防止任何超链接的意外默认行为
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

  return (
    <div
      className="page-scroll-keys max-lg:hidden bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-6 border border-white/40 dark:border-white/10 shadow-xl sticky top-28 max-lg:top-16 transition-colors duration-700 max-h-[75vh] overflow-y-auto custom-scrollbar"
      onKeyDownCapture={pageScrollKeys}
    >
      <h3 className="font-black text-slate-900 dark:text-white mb-4 border-l-4 border-indigo-500 pl-2 text-sm uppercase tracking-widest">
        Table of Contents
      </h3>
      <nav className="flex flex-col gap-1.5">
        {withNumbers(toc).map((item, index) => {
          // 视觉上：扒掉超链接，完美展示 "3.万度"
          const displayText = getDisplayText(item.text);

          // 底层跳转：生成纯净版的 ID "toc-3万度"，绝对不会找错目标！
          const safeId = getSafeId(item.text);
          const isActive = activeId === safeId;
          const lv = item.lv;

          return (
            <button
              key={index}
              data-toc-level={lv}
              onClick={(e) => { scrollToHeading(e, safeId); e.currentTarget.blur(); }}
              className={`flex w-full items-start text-left py-0.5 transition-all duration-300 cursor-pointer ${levelClass(lv, isActive)}`}
            >
              {/* ① 序号：放在竖线左边，右对齐 */}
              <span className={`${NO_W[lv]} shrink-0 text-right font-mono tabular-nums leading-[1.55] ${lv === 1 ? 'text-[0.85em]' : lv <= 3 ? 'text-[0.8em]' : 'text-[0.75em]'} ${noClass(isActive)}`}>
                {item.no}
              </span>
              {/* ② 竖线：不再是 button 的 border-left，因为那样序号只能待在竖线右边 */}
              <span aria-hidden className={`${BAR_W[lv]} shrink-0 self-stretch mx-1.5 rounded-full ${barClass(lv, isActive)}`} />
              {/* ③ 标题 */}
              <span className="flex-1 min-w-0 line-clamp-2">{displayText}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}