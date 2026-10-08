"use client";

import { motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { EASE_OUT } from '../lib/motion';

/**
 * 🎬 让「条在动」和「界面在换」**真正同时开始**。
 *
 * 两件事一起做，缺一不可：
 *
 * ① **提前把数据拿到手**（真正解决问题的那一半，在 Navbar 里：悬停就 router.prefetch）
 *    · 这些页面的内容都要等服务器返回（读磁盘），点下去才开始要 → 必然有等待 ✗
 *    · 悬停就预取 → 等你真按下去时数据已经在浏览器里了 → **内容当帧就换** ✓
 *      和条的动画同一帧开始 → 这才是"真·同时" ✓
 *    · 所以：预取成功时，这层**什么都不用做**（下面那个 110ms 延后就是为它准备的 ✓）
 *
 * ② **万一还是卡住了，给个反馈**（兜底的那一半，就是这层 div）
 *    · 数据没预取到（没悬停就点 / 服务器慢 / 网速差）→ 内容区不能一动不动 ✗
 *    · ⚠️ 变暗**故意延后 110ms** 才发生：预取成功的导航在 110ms 内就切完了，
 *      这时候如果立刻变暗，反而会闪一下 ✗ —— 只有真的等超时才说明卡住了 ✓
 *
 * ⚠️⚠️ 这一层只动 `opacity`，**绝对不要加 transform / filter / backdrop-filter** ✗✗
 *   它们会让这层 div 变成内部所有 `position: fixed` 元素的**定位参照物** ——
 *   导航栏、手机抽屉、资源页那两个按钮会全部跟着乱飘 ✗
 *   （这个坑已经踩过一次，见 components/PageTransition.tsx 里的 fadeOnly 说明）
 */

/** 正在导航中（全局单例，不放进 React state —— 点下去要**立刻**通知到，不能等 re-render ✓） */
let navigating = false;
const listeners = new Set<() => void>();

/** 导航项被点下去的那一刻调用它（Navbar 里调）✓ */
export function signalNavStart() {
  if (navigating) return;
  navigating = true;
  listeners.forEach((f) => f());
}

function signalNavEnd() {
  if (!navigating) return;
  navigating = false;
  listeners.forEach((f) => f());
}

export default function NavSwitchDim({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [on, setOn] = useState(false);      // 正在导航（点下去就有了）
  const [dim, setDim] = useState(false);    // 真的卡住了、该变暗了（延后 110ms 才置 true）

  // 订阅"正在导航"这个全局信号
  useEffect(() => {
    const sync = () => setOn(navigating);
    listeners.add(sync);
    sync();                                   // 挂载时先对齐一次（万一挂载前就点过了）
    return () => { listeners.delete(sync); };
  }, []);

  // 路由真的变了 → 立刻恢复 ✓（新内容由各页自己的 PageTransition 淡入 ✓）
  useEffect(() => { signalNavEnd(); }, [pathname]);

  /**
   * ⏱️ 延后 110ms 才变暗：
   *   · 预取命中 → 110ms 内路由就变了 → 这个定时器被清掉 → **一次都不闪** ✓
   *   · 真卡住了 → 110ms 后才暗下来，告诉用户"在切了" ✓
   * 🛟 再兜一层：1.5s 还没切过去（点了当前栏目 / 导航被打断）→ 强制恢复，别一直暗着 ✗
   */
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => setDim(true), 110);
    const guard = window.setTimeout(signalNavEnd, 1500);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(guard);
      setDim(false);
    };
  }, [on]);

  return (
    <motion.div
      /* 和 layout 里那一层同样的排版，保证里面各页的布局一个像素都不变 ✓ */
      className="flex-1 flex flex-col"
      initial={false}
      /* 变暗快（0.13s，卡住了就马上看得见）✓ 恢复稍慢（0.22s）更顺 ✓ */
      animate={{ opacity: dim ? 0.55 : 1 }}
      transition={{ duration: reduce ? 0 : dim ? 0.13 : 0.22, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
