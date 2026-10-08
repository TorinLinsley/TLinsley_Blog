"use client";

import { motion } from "framer-motion";
import { ReactNode, useEffect, useRef } from "react";

export default function PageTransition({
  children,
  disabled = false,
  /**
   * 🚫 **只淡入、不要位移** —— 给"这一页里有 position:fixed 元素"的页面用（目前是资源分享页）。
   *
   * ⚠️ 为什么必须单独有这么一档（用户实测反馈）：framer 只要给这个 div 动 `transform`，
   *    它立刻就成了内部**所有 fixed 元素的定位参照物** ✗ ——
   *    资源页那两个展开按钮（fixed + top:3.25rem）于是跟着入场动画一起往下飘，
   *    等动画播完 transform 被移除，它们才"啪"地跳回导航栏正下方 ✗
   *    （表现就是："进页面后按钮先在下面一段距离，过一会才变到顶部"）
   *
   * ✅ 只动 `opacity` 不会有这个问题：opacity 不改变 containing block ✓
   *    所以这一档的代价仅仅是少了那 20px 的上滑，淡入效果照旧 ✓
   *    —— 宁可少一个位移，也不能让 fixed 的按钮乱跑（那是影响操作的 ✗）
   */
  fadeOnly = false,
}: {
  children: ReactNode;
  /** 跳过入场动画，直接显示内容（用于页内切换，例如资源分享里切换文章） */
  disabled?: boolean;
  /** 只淡入、不做 20px 上滑（页内有 fixed 元素时必须用它，理由见上） */
  fadeOnly?: boolean;
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
  //
  // ⚠️ fadeOnly 同理：**只是不传 transform 相关的值**，元素本身还是 motion.div ✓
  //    （framer 在没有 transform 值可动时不会写 transform，containing block 就不会变 ✓）
  return (
    <motion.div
      ref={ref}
      initial={disabled ? false : fadeOnly ? { opacity: 0 } : { y: 20, opacity: 0 }}
      animate={fadeOnly ? { opacity: 1 } : { y: 0, opacity: 1 }}
      transition={
        disabled
          ? { duration: 0 }
          : fadeOnly
            ? { ease: 'easeOut', duration: 0.4 }
            : { ease: "easeOut", duration: 0.8 }
      }
    >
      {children}
    </motion.div>
  );
}
