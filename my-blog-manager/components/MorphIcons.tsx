"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_OUT, D_MORPH, D_RETRACT, STAGGER, SPRING_MORPH, SPRING_MORPH_SOFT } from "../lib/motion";

/**
 * 🎞️ 三个「图标形变」图标（菜单 / 文章列表 / 大纲）。
 *
 * ── 为什么要重画，而不是继续用 svg 遮罩 ──────────────────────────
 * 原来这三个按钮都是「两张 svg 当 mask，切 open 时只改透明度」。
 * 遮罩的内部线条**浏览器不允许动画**，所以想「横线转 45° 交叉成叉」这类形变，
 * 必须把线**画成真实元素**，再用 transform 去动它。
 *
 * ── 保留了什么、改了什么 ────────────────────────────────────
 * · 菜单图标：menu.svg 本来就是「三行（圆点＋长条）」，这里按同样的几何重画 → 外观一致 ✓
 * · 文章列表：file_list.svg 是「文件夹外框 + 里面两条不等长横线」，外框和两条线都重画 ✓
 *   ⚠️ 外框是用圆角矩形拼的，和图标字体那份在圆角弧度上会有**极细微**差别（肉眼基本看不出）
 * · 大纲：**默认（未展开）那一态继续用 outline.svg 遮罩**（那份是自定义不规则轮廓，
 *   没法用基本图形忠实复刻，照原样保留）；展开态用三个真实圆角矩形，
 *   从左边依次向右「伸」出来 ✓
 *
 * ── 动效规矩（跟着 animate skill 走）─────────────────────────
 * · 只动 `transform` 和 `opacity`（GPU，不触发布局/重绘）✓
 *   线条「变短」用的是 `scaleX` 而不是 `width` —— 动 width 会触发布局，卡 ✓
 * · 缓动：`cubic-bezier(0.23, 1, 0.32, 1)`（强 ease-out），**不用 linear、更不用 ease-in** ✓
 * · 时长：形变 240ms，线条缩回 180ms —— UI 动效一律 300ms 以内 ✓
 * · 收缩比展开快一点（非对称）：用户按下后要的是"立刻响应" ✓
 * · `prefers-reduced-motion` 时**不转不位移**，只保留透明度变化（更轻，而不是完全不动）✓
 * · 用 transition（framer-motion 的 animate/exit）而不是 keyframes：
 *   连点两次能从当前状态接着走，不会"归零重播" ✓
 */

/** 线条的填色：跟随深浅色主题 */
const BAR = "bg-slate-800 dark:bg-slate-100";

/* ═══════════════════════════════════════════════════════════════
   ① 导航栏菜单按钮：三行（圆点＋长条） ⇄ 叉
      展开：中间那条以自身左端为锚点非线性缩没，上下两条各自朝中心靠拢 5px
            并转 ±45° 交叉成叉；圆点同步淡出（叉上不该有圆点）
      收起：原路反向 —— 上下两条转回水平、中间那条从左端重新伸出来
   ═══════════════════════════════════════════════════════════════ */
export function MenuLines({ open, size = 18 }: { open: boolean; size?: number }) {
  const reduce = useReducedMotion();
  // 三行的纵向位置、长条宽度（相对 18px 图标盒）
  const rows = [
    { top: 3.25, w: 12.5 }, // 上
    { top: 8.0, w: 12.5 },  // 中
    { top: 12.75, w: 12.5 },// 下
  ];
  // 上下两条要往中心靠（各行间距 4.75px），再转 ±45° 才交于同一点
  const SHIFT = 4.75;

  return (
    <span
      aria-hidden
      className="absolute inset-0 m-auto block"
      style={{ width: size, height: size }}
    >
      {rows.map((r, i) => {
        const isTop = i === 0;
        const isMid = i === 1;
        // 展开后的目标状态
        const to = isMid
          ? { y: 0, scaleX: 0, opacity: 0 }
          : { y: isTop ? SHIFT : -SHIFT, rotate: isTop ? 45 : -45, scaleX: 1, opacity: 1 };
        // 收起后的目标状态
        const rest = { y: 0, rotate: 0, scaleX: 1, opacity: 1 };
        return (
          <span key={i} className="absolute left-0 right-0 block" style={{ top: r.top, height: 2 }}>
            {/* 圆点：叉上不要，展开时淡出 */}
            <motion.span
              className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-full ${BAR}`}
              style={{ width: 3, height: 3 }}
              animate={{ opacity: open ? 0 : 1 }}
              transition={{ duration: reduce ? D_RETRACT : D_MORPH, ease: EASE_OUT }}
            />
            {/* 长条：左端为锚点（缩回时像被抽回圆点里） */}
            <motion.span
              className={`absolute top-0 rounded-full ${BAR}`}
              style={{ left: 3, width: r.w, height: 2, transformOrigin: "left center" }}
              initial={false}
              animate={reduce ? { opacity: isMid && open ? 0 : 1 } : (open ? to : rest)}
              transition={
                reduce
                  ? { duration: D_RETRACT, ease: EASE_OUT }
                  : {
                      ...SPRING_MORPH,
                      // 收起时让"中间那条伸回来"稍晚一点，先让上下两条转平，顺序更好读
                      delay: !open && isMid ? 0.06 : 0,
                    }
              }
            />
          </span>
        );
      })}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ② 文章列表按钮：文件夹外框（里面两条横线） ⇄ 两条线交叉成叉
      外框**不动**，只有里面那两条线转起来：短的转 +45°、长的转 -45°，
      各自朝文件夹中心靠拢，最后交成一个叉
   ═══════════════════════════════════════════════════════════════ */
export function FolderLines({ open, size = 16 }: { open: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const W = size;
  const H = size;
  const bodyTop = 3.5;
  const bodyH = H - bodyTop - 0.5;

  // 里面两条线：一短一长（和 file_list.svg 一样不等长）
  const lines = [
    { top: 8.5, w: 6.5, rot: 45 },
    { top: 11.5, w: 9.5, rot: -45 },
  ];
  // 两条线交叉的目标点：文件夹体中心
  const cx = W / 2;
  const cy = bodyTop + bodyH / 2;

  return (
    <span aria-hidden className="absolute inset-0 m-auto block" style={{ width: W, height: H }}>
      {/* 外框：文件夹体（不参与动效） */}
      <span
        className="absolute left-0 right-0 rounded-[2px] border-[1.5px] border-slate-800 dark:border-slate-100"
        style={{ top: bodyTop, height: bodyH }}
      />
      {/* 左上角那个"文件夹耳朵" */}
      <span
        className="absolute left-0 rounded-t-[2px] border-[1.5px] border-b-0 border-slate-800 dark:border-slate-100"
        style={{ top: bodyTop - 2.5, width: W * 0.42, height: 2.5 }}
      />
      {/* 里面两条线：以各自中心旋转并平移，最后交于同一点 */}
      {lines.map((l, i) => {
        const toY = cy - (l.top + 0.8);
        const to = { y: toY, rotate: l.rot };
        const rest = { y: 0, rotate: 0 };
        return (
          <motion.span
            key={i}
            className={`absolute rounded-full ${BAR}`}
            style={{
              left: (W - l.w) / 2,
              top: l.top,
              width: l.w,
              height: 1.6,
              transformOrigin: "center center",
            }}
            initial={false}
            animate={reduce ? { opacity: open ? 0.6 : 1 } : (open ? to : rest)}
            transition={reduce ? { duration: D_MORPH, ease: EASE_OUT } : SPRING_MORPH_SOFT}
          />
        );
      })}
      {reduce && open && (
        // 减少动效时：不转线，直接给一个静态的叉做状态提示
        <span
          aria-hidden
          className="absolute left-0 right-0 m-auto text-center font-black leading-none text-slate-800 dark:text-slate-100"
          style={{ top: cy - 7, fontSize: 13 }}
        >
          ×
        </span>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ③ 大纲按钮：默认态沿用 outline.svg 遮罩 ⇄ 展开态三条圆角矩形
      展开：三条从**左边**依次向右"伸"出来（scaleX，左端为锚点），依次错开 45ms
      收起：原路缩回去（反向错开，读起来像被依次收走）
   ═══════════════════════════════════════════════════════════════ */
export function TocBars({ open, size = 16 }: { open: boolean; size?: number }) {
  const reduce = useReducedMotion();
  // 三条的宽度比例，取自 outline-open.svg 的几何（640 / 384 / 384）
  const bars = [
    { top: 2.0, w: 1.0 },
    { top: 6.8, w: 0.62 },
    { top: 11.6, w: 0.62 },
  ];
  const maskStyle: React.CSSProperties = {
    WebkitMaskImage: "url(/outline.svg)",
    maskImage: "url(/outline.svg)",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };

  return (
    <span aria-hidden className="absolute inset-0 m-auto block" style={{ width: size, height: size }}>
      {/* 默认态：原样保留那张遮罩图 */}
      <motion.span
        className={`absolute inset-0 m-auto block w-4 h-4 ${BAR}`}
        style={maskStyle}
        initial={false}
        animate={{ opacity: open ? 0 : 1 }}
        transition={{ duration: reduce ? 0.12 : 0.16, ease: EASE_OUT }}
      />
      {/* 展开态：三个真实圆角矩形，从左边"依次伸"出来（这就是"伸"的那一拍） */}
      {bars.map((b, i) => {
        const delay = reduce ? 0 : (open ? i : bars.length - 1 - i) * STAGGER;
        return (
          <motion.span
            key={i}
            className="absolute rounded-[2px] border-[1.5px] border-slate-800 dark:border-slate-100"
            style={{
              left: 0,
              top: b.top,
              width: size * b.w,
              height: 3.2,
              transformOrigin: "left center",
            }}
            initial={false}
            animate={{ scaleX: open ? 1 : 0, opacity: open ? 0 : 1 }}
            transition={{
              // "伸出来 / 缩回去"用弹簧：连点能带着速度接着走，不会重新起步 ✓
              scaleX: reduce
                ? { duration: 0.12, ease: EASE_OUT, delay }
                : { ...SPRING_MORPH, delay },
              // 透明度用贝塞尔就够（弹簧对纯透明度没意义）
              opacity: { duration: 0.14, ease: EASE_OUT, delay: open && !reduce ? 0.2 : 0 },
            }}
          />
        );
      })}
      {/*
        "伸完"之后的静止态：原样淡入 outline-open.svg。
        为什么要这一步：outline-open.svg 里除了三条长矩形，还有左侧一根竖条和三个小横头，
        用基本图形重画会丢细节。所以让真实矩形只负责"伸出来"这一拍，
        最终停在**和以前完全相同**的那张原图上 ✓
      */}
      <motion.span
        className={`absolute inset-0 m-auto block w-4 h-4 ${BAR}`}
        style={{
          WebkitMaskImage: "url(/outline-open.svg)",
          maskImage: "url(/outline-open.svg)",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.16, ease: EASE_OUT, delay: open && !reduce ? 0.2 : 0 }}
      />
    </span>
  );
}
