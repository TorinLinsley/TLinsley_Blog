"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { SPRING_MORPH } from "../lib/motion";

/**
 * 📊 文章阅读进度条：顶部一条 2px 的线，跟着滚动走。
 *
 * ── 为什么"动效"在这里是合理的 ──────────────────────────────
 * 长文里它承担的是**状态指示**（读到哪儿了 / 还有多少），不是装饰 ✓
 *
 * ── 动效规矩 ─────────────────────────────────────────────
 * · 只动 `transform: scaleX`（GPU）+ `transform-origin: left` ✓ 不动 width ✓
 * · **这里刻意没有缓动曲线**：进度条是"跟着滚动走的恒定运动"，
 *   本来就该匀速 —— 唯一允许不用贝塞尔/弹簧的场景 ✓
 * · 但给滚动值套了一层阻尼弹簧（SPRING_MORPH，bounce 0）：
 *   手指离开滚轮/屏幕后线还会"稳稳落位"，而不是跟着滚动条一格一格跳 ✓
 * · `prefers-reduced-motion`：去掉阻尼，直接跟着滚动走（更轻，进度仍然可见）✓
 */
export default function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const reduce = useReducedMotion();

  // ⚠️ hook 必须无条件调用，所以先算出来、再按喜好选用哪一条
  const smoothed = useSpring(scrollYProgress, {
    duration: SPRING_MORPH.duration,
    bounce: SPRING_MORPH.bounce,
  });

  return (
    <motion.div
      aria-hidden
      className="fixed left-0 right-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-indigo-500 to-purple-500"
      style={{ scaleX: reduce ? scrollYProgress : smoothed }}
    />
  );
}
