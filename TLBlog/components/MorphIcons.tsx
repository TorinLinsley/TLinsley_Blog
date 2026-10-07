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
              style={{
                left: 3,
                width: r.w,
                height: 2,
                // ⚠️⚠️ 锚点必须分开：
                //   中间那条要"缩回圆点里" → 锚点在**左端**（scaleX 才会从左边收回）
                //   上下两条要绕**自身中心**转 45° → 锚点放左端的话会把交点拖到左边去 ✗
                // （之前三条都写了 left center，用户一眼看出"没在中心交叉"）
                transformOrigin: isMid ? "left center" : "center center",
              }}
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

  // 里面两条线的位置/长度**完全取自原图 file_list.svg**（1024 视图盒 → 16px 换算）
  //   短的：x 317→534，y 中心 438   |   长的：x 317→703，y 中心 625
  const lines = [
    { left: 4.96, top: 6.05, w: 3.40, rot: 45, dx: 1.34, dy: 1.05 },
    { left: 4.96, top: 8.97, w: 6.03, rot: -45, dx: 0.03, dy: -1.87 },
  ];

  return (
    <span aria-hidden className="absolute inset-0 m-auto block" style={{ width: W, height: H }}>
      {/*
        外框：**直接用原图 file_list.svg 里那条外框路径抽出来的遮罩**
        （public/file_list-body.svg）—— 这样外框和用户原来看到的**逐像素一致** ✓
        上一版我是用圆角矩形自己拼的，形状明显不一样，被用户一眼看出来 ✗
      */}
      <span
        className={`absolute inset-0 m-auto block ${BAR}`}
        style={{
          width: W,
          height: H,
          WebkitMaskImage: "url(/file_list-body.svg)",
          maskImage: "url(/file_list-body.svg)",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
      {/* 里面两条线：以各自中心旋转并朝文件夹体中心平移，最后交成一个叉 */}
      {lines.map((l, i) => {
        // 整条 transform 串在一起写：framer-motion 才能把它交给 GPU 合成（分开写 x/y/rotate 会走主线程）✓
        const to = { transform: `translate(${l.dx}px, ${l.dy}px) rotate(${l.rot}deg)` };
        const rest = { transform: "translate(0px, 0px) rotate(0deg)" };
        return (
          <motion.span
            key={i}
            className={`absolute rounded-full ${BAR}`}
            style={{
              left: l.left,
              top: l.top,
              width: l.w,
              height: 1.2,
              transformOrigin: "center center",
            }}
            initial={false}
            animate={reduce ? { opacity: open ? 0.5 : 1 } : (open ? to : rest)}
            transition={reduce ? { duration: D_MORPH, ease: EASE_OUT } : SPRING_MORPH_SOFT}
          />
        );
      })}
      {reduce && open && (
        // 减少动效时：不转线，直接给一个居中的静态叉做状态提示
        // （用 inset-0 + flex 居中，别再依赖已经删掉的那个 cy 变量）
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center font-black leading-none text-slate-800 dark:text-slate-100"
          style={{ fontSize: 13 }}
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
  // 三条的**起点和宽度**都按原图 outline-open.svg 的几何来（1024 视图盒 → 16px）：
  //   圆角矩形左端 x = 256/1024 × 16 ≈ 4px（**就是圆圈所在的那条竖线上**，不是图标最左边 ✗）
  //   宽度 640 / 384 / 384
  const bars = [
    { top: 2.0, left: 4, w: 0.625 },
    { top: 6.8, left: 4, w: 0.375 },
    { top: 11.6, left: 4, w: 0.375 },
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
              // ⚠️ 从**圆圈那条竖线**（x≈4px）开始伸，不是图标最左边 ✗
              left: b.left,
              top: b.top,
              width: size * b.w,
              height: 3.2,
              transformOrigin: "left center",
            }}
            initial={false}
            // 展开后**就停在这儿**（不再淡出）—— 之前有个"淡出→淡入原图"的交接，
            // 那个交接不可靠，用户看到的是"伸出来又没了，伸了个寂寞" ✗ 直接去掉 ✓
            animate={{ scaleX: open ? 1 : 0, opacity: 1 }}
            transition={
              reduce
                ? { duration: 0.12, ease: EASE_OUT, delay }
                : { ...SPRING_MORPH, delay }
            }
          />
        );
      })}
      {/*
        ⚠️ 这里原来还有一个"伸完 → 淡入 outline-open.svg"的交接层，已经**删掉**：
        用户实测看到的是"伸出来又没了，伸了个寂寞"—— 那个交接不可靠（淡出和淡入之间
        容易出现一段两边都不可见的窗口）。现在三条矩形**展开后就停在原地**当最终状态，
        不再有任何交接，不可能再出现"伸完就消失" ✓
      */}
    </span>
  );
}
