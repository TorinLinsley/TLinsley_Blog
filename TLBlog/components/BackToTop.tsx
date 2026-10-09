"use client";

import { useEffect, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';

/**
 * 📱 手机端「返回顶部」按钮（大屏不出现，靠 lg:hidden）。
 *
 * 需求拆解：
 *   · 图标是**静态**的朝上线条箭头（就是 `^` 那个样子），不做任何形变 / 过渡 ——
 *     因为点一下就回顶、按钮当场消失，那个过程没人看得到，加了动画也是白加 ✗
 *   · 该不该出现，要**同时**照顾两种"滚动"：
 *       ① 文章页那种「整页跟着滚」（window / documentElement）
 *       ② 资源分享页、控制台预览那种「区域自己滚」（页面里的 overflow-y-auto 容器）
 *     两个都看，哪个滚得深就按哪个算 ✓
 *   · 只要不在顶部、往下滑过一段，就把它放出来；滑回顶部它自己消失 ✓
 *   · 大小和**右边距**和大纲按钮一致：w-9 h-9，right-3 = 12px（正好等于大纲按钮行的 px-3）✓
 *   · 离屏幕底部按**视口高度的 10%**（bottom-[10vh]）往上放 —— 不能按之前那种"和大纲按钮
 *     一样的 4px"贴底：现在的手机屏幕四角是硬件级大圆角，贴底会被圆角啃掉一块 ✗
 *     10vh 在 844 高的屏上约 84px、667 高的屏上约 67px，足够避开圆角又不会飘到屏幕中间 ✓
 *   · 位置在右下角，不跟右上角那个大纲按钮打架 ✓
 *   · 点一下**瞬间**回顶（和大纲跳转一个规矩，直接归零，不用 behavior:'smooth'）✓
 *   · 图标颜色跟着网站主题走：浅色黑、深色白 ✓
 *
 * 为什么 scroll 挂在 window 的**捕获阶段**：
 *   滚动事件本身**不冒泡**，但在捕获阶段会经过 window ——
 *   所以同一个监听能同时收到"整页滚动"和"任意内层容器滚动"，
 *   不用去遍历页面找滚动容器。（资源页右侧大纲 ResourceToc 也是这个套路。）
 */

/** 往下滑过这么多像素才把按钮放出来（太小会一直在眼前晃） */
const SHOW_AFTER = 240;

export default function BackToTop() {
  /** 按钮是否显示 */
  const [visible, setVisible] = useState(false);
  /** 最近一次滚动的那个内层容器：回顶时也要把它归零，否则只回到一半 ✗ */
  const innerScrollerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    /** 整页滚动的深度（三种取法都留着，各浏览器/各文档模式认的不一样） */
    const pageTop = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

    const onScroll = (event: Event) => {
      let innerTop = 0;
      const target = event.target;
      if (target instanceof HTMLElement) {
        innerTop = target.scrollTop;
        innerScrollerRef.current = target;
      }
      // 整页和内层谁滚得深听谁的
      setVisible(Math.max(pageTop(), innerTop) > SHOW_AFTER);
    };

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    // 进页面先自己算一次：刷新后浏览器会恢复上次的滚动位置，这时候按钮得直接是出来的
    onScroll(new Event('scroll'));

    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  // 不做进出场动画（用户明确说这个按钮不需要看动画），所以直接整体挂 / 卸
  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="返回顶部"
      data-back-to-top
      onClick={() => {
        // ⚡ 瞬间回顶：和大纲跳转一样直接归零，不用平滑滚动
        if (innerScrollerRef.current) innerScrollerRef.current.scrollTop = 0;
        window.scrollTo(0, 0);
        setVisible(false);
      }}
      className="lg:hidden fixed right-3 bottom-[10vh] z-40 w-9 h-9 flex items-center justify-center rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg text-black dark:text-white cursor-pointer"
    >
      {/* 静态线条箭头：strokeWidth 和大纲/菜单那几个手绘图标保持一个粗细观感 */}
      <ChevronUp className="w-5 h-5" strokeWidth={2.5} aria-hidden />
    </button>
  );
}
