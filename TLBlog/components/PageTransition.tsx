"use client";

import { motion } from "framer-motion";
import { ReactNode, useEffect, useRef } from "react";

export default function PageTransition({
  children,
  disabled = false,
}: {
  children: ReactNode;
  /** 跳过入场动画，直接显示内容（用于页内切换，例如资源分享里切换文章） */
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * 🛟 兜底：别让这一层永远停在 opacity: 0
   *
   * 这层是整页内容的包壳，初始状态是 `opacity: 0`（靠入场动画淡进来）。
   * 但有两种情况动画不会播：
   *   ① 浏览器「后退/前进」时页面被 bfcache 原样恢复，framer-motion 不重放动画；
   *   ② 动画被打断（切到后台、极快连续跳转等）。
   * 一旦卡在初始帧，整页内容就全透明了 —— 而背景图在 layout.tsx 里、位于这层**外面**，
   * 所以表现就是「返回后只剩背景图」。
   *
   * 这里做两件小事，都不影响正常动画：
   *   · pageshow（仅 bfcache 恢复，persisted === true）→ 立刻恢复成最终状态；
   *   · 挂载 2 秒后再查一次，万一还是透明就强制显示（正常情况这时早就是 1 了）。
   */
  useEffect(() => {
    const forceVisible = () => {
      const el = ref.current;
      if (!el) return;
      el.style.opacity = "1";
      el.style.transform = "none";
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) forceVisible();
    };
    window.addEventListener("pageshow", onPageShow);

    const t = window.setTimeout(() => {
      const el = ref.current;
      if (el && parseFloat(getComputedStyle(el).opacity) < 0.99) forceVisible();
    }, 2000);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.clearTimeout(t);
    };
  }, []);

  // ⚠️ 这里必须**始终返回同一种元素**！
  // 之前写成：disabled 就 return <>{children}</>，否则 return <motion.div>。
  // 元素类型一变，React 会把整棵子树卸载再重建 —— 于是页内组件的 state 全被清空。
  // 资源分享页那个小屏抽屉的开合状态就是这么被"自动收起"的（从 /resources 点进
  // /resources/xxx 时 disabled 从 false 变 true，抽屉当场复位）。
  // 现在统一都用 motion.div，只用参数把入场动画关掉，DOM 结构保持稳定。
  return (
    <motion.div
      ref={ref}
      initial={disabled ? false : { y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={disabled ? { duration: 0 } : { ease: "easeOut", duration: 0.8 }}
    >
      {children}
    </motion.div>
  );
}
