"use client";

import { motion } from "framer-motion";
import { ReactNode, useEffect, useRef, useState } from "react";

/**
 * 🏁 「整篇文档里第一次挂载 PageTransition」才算真·首次进入（F5 / 刷新 / 直接粘链接打开）。
 * 之后的所有挂载都算 SPA 内部跳转（点链接、搜索结果、首页快捷卡片…）。
 *
 * 为什么需要这个标记：资源分享页是客户端整页 —— 挂载之后还要「取端口 → 拉目录 → 读文章」，
 * 每跳进来一次都从头播一遍 0.8s 的入场动画，看起来就像"刷新进来 / 首次进来，有个进入动画"。
 * 给那一页带上 onlyOnDocumentLoad 之后：
 *   · 站内点链接进来 → 直接显示（无感、瞬间，和左边列表点文章一个手感）；
 *   · 真的刷新 / 首次打开 → 照旧播一遍，原来那份手感不变。
 * （同一个套路见 components/resources/ResourcePanels.tsx 里跳过抽屉入场动画的写法。）
 */
let documentEntryPlayed = false;

export default function PageTransition({
  children,
  onlyOnDocumentLoad = false,
}: {
  children: ReactNode;
  /** true = 只有「整篇文档刚加载」的那一次才播入场动画，站内跳转一律直接显示（不传则完全保持原样） */
  onlyOnDocumentLoad?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 首帧就定下来：false → 直接渲染成最终状态，免得先透明再补显示（那反而要多闪一下）
  const [animate] = useState(() => (onlyOnDocumentLoad ? !documentEntryPlayed : true));

  useEffect(() => {
    documentEntryPlayed = true;
  }, []);

  /**
   * 🛟 兜底：别让这一层永远停在 opacity: 0（和博客前台的 PageTransition 同一套逻辑）
   *
   * 这层是整页内容的包壳，初始状态是 opacity: 0。浏览器后退/前进时页面可能被
   * bfcache 原样恢复，入场动画不重放，这层就会永远透明 → 看起来"页面加载不出来"。
   *   · pageshow（persisted === true，仅 bfcache 恢复）→ 立刻恢复最终状态；
   *   · 挂载 2 秒后还没变透明就强制显示（正常情况这时早就不透明了）。
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

  return (
    <motion.div
      ref={ref}
      // 刚加载页面时：往下偏 20px，完全透明（站内跳转时 initial=false：直接就是最终状态，不演）
      initial={animate ? { y: 20, opacity: 0 } : false}
      // 加载完毕后：回到原位，完全不透明
      animate={{ y: 0, opacity: 1 }}
      // 动画怎么演：用优雅的弹性物理动画，持续 0.8 秒
      transition={animate ? { ease: "easeOut", duration: 0.8 } : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}
