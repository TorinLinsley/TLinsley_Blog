"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { D_ENTER, EASE_OUT } from "../lib/motion";

/**
 * 🖼️ 图片淡入：解码完成前保持透明，加载完再淡进来 ——
 * 而不是"先一块空白、然后啪地蹦出来"。
 *
 * ── 为什么用"包一层 span"而不是直接给 <img> 加类 ──────────────
 * 这些 <img> 身上已经挂了 `transition-transform duration-700 group-hover:scale-105`
 * 之类的**悬停放大**效果。直接给 img 写内联 `transition` 会把那条 Tailwind 的
 * transition 覆盖掉 → 悬停放大就废了 ✗。
 * 所以把"淡入"这层放在外面这层上，`<img>` 的类和效果**一个字都不动** ✓
 *
 * ── 为什么这里"只淡"，不加位移/缩放 ───────────────────────────
 * 一页照片墙几十张图，每张都"淡入 + 上浮 + 缩放"会很闹 ✗。
 * 而且图片是**各自加载完各自出现**的，本来就有天然的先后层次，
 * 不需要再人为错峰（STAGGER）—— 给它加错峰等于故意延迟已经在等的图 ✓
 *
 * ── 动效规矩 ─────────────────────────────────────────────
 * · 只动 `opacity`（纯透明度 → 配 `EASE_OUT` 短 tween；弹簧对透明度没有意义 ✗）
 * · `prefers-reduced-motion`：仍然淡入，但更短（更轻，而不是完全不动）✓
 *
 * ⚠️ 必须补 `img.complete` 那一下：命中浏览器缓存、或 SSR 时就已解码完的图，
 *    `onLoad` **有可能永远不触发** —— 那样图片会一直停在透明上，等于把图弄没了。
 */
export default function FadeInImage({
  className = "",
  wrapperClassName = "",
  onLoad,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & { wrapperClassName?: string }) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  return (
    <motion.span
      className={`block ${wrapperClassName}`}
      initial={false}
      animate={{ opacity: loaded ? 1 : 0 }}
      transition={{ duration: reduce ? 0.12 : D_ENTER, ease: EASE_OUT }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...rest}
        ref={ref}
        className={className}
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
      />
    </motion.span>
  );
}
