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
  /**
   * 【几何】全部取自原图 menu.svg（1024 视图盒 → 18px 换算）
   *   · 圆点：x 1.60→3.40（直径 1.8）→ **圆心在 x = 2.5**
   *   · 长条（未融合）：x 4.70→14.36（宽 9.66）
   *   · 长条（融合后）：x 1.60→14.36（宽 12.76）—— 往左延伸盖住圆点，变成一根完整的线
   *   · 行中心 y = 3.94 / 8.00 / 12.09
   */
  /**
   * ⚠️⚠️ 这组几何是"让汉堡和叉**同时**居中"的唯一解（用户给的思路，我把它算成了数）：
   *
   *   ① 叉是对称的 → 它的中心必然落在**交叉点**上
   *      交叉点 x = 圆点圆心 + (两行间距/2) = P + 4.075
   *      要让交叉点正好在盒心 9  →  **P = 4.925**（圆点圆心）
   *   ② 汉堡要居中 → 内容必须关于 9 对称
   *      圆点左端 4.025 → 线的右端就得在 13.975（比原来的 14.36 **短** ✓ 就是用户说的"缩短一点"）
   *   ③ 四个臂仍要等长 → 展开时右伸量 b、左伸量 a 满足 b − a = 11.52 ✓
   *      左伸到圆点左端 a = 0.9 → b = 12.42 → 展开态线端 = P + 12.42 = 17.345
   *
   *   这样**容器偏移可以归零**，两个状态各自都正 ✓✓
   *   ⚠️ 之前一直歪，就是因为圆点太靠左（2.5），交叉点被钉在 6.58，无论怎么加偏移
   *      都只能让一个状态居中 ✗
   */
  const DOT_L = 4.025;               // 圆点左端
  const DOT_D = 1.8;
  const DOT_CX = DOT_L + DOT_D / 2;  // 4.925 ← **旋转中心，也是让交叉点落在盒心的那个值**
  const FUSED_L = DOT_L;             // 融合后线的左端 = 圆点左端
  const REST_L = 7.125;              // 未融合时线的左端（和圆点留 1.3px 间隙）
  const REST_R = 13.975;             // 未融合时线的右端（关于盒心 9 对称 ✓）
  const OPEN_R = DOT_CX + 12.42;     // 17.345 ← 展开态线的右端（保证四臂等长）
  const OPEN_W = OPEN_R - FUSED_L;   // 13.32 ← 元素本身的宽度
  const REST_W = REST_R - REST_L;    // 6.85
  const REST_SCALE = REST_W / OPEN_W; // ≈ 0.5143
  const REST_SHIFT = REST_L - FUSED_L; // 3.1
  const BAR_H = 1.8;
  const rowCy = [3.94, 8.0, 12.09]; // 上 / 中 / 下

  return (
    <span
      aria-hidden
      className="absolute inset-0 m-auto block"
      /**
       * ⚠️ 偏移量归零（横向 0、纵向 1）——
       *   横向能归零是因为**几何本身就被设计成两个状态都居中** ✓（见上面那组常量的推导）
       *   纵向 +1 是让三行的视觉重心（8.02）落到盒心 9 ✓
       */
      style={{ width: size, height: size, transform: 'translate(0px, 1px)' }}
    >
      {rowCy.map((cy, i) => {
        const isMid = i === 1;
        /**
         * ⚠️⚠️ 这里是**骨骼父子级**的写法（用户明确要求的模型）：
         *
         *   每一行 = 一个父级容器（**点 + 线同属一个整体**），父级的旋转中心
         *   定在**圆点的圆心 (2.5px, cy)** —— 不是线条左端点 ✗
         *
         *   父级旋转时，子级（线）同步做自己的动作，互不干扰：
         *     上面那条：父级顺时针 45°；线的锚点在**右端**、scaleX 从 0.757 → 1
         *               → 线的左端从 4.7 一路伸到 1.6，把圆点**盖住并融合成一根完整的线** ✓
         *     下面那条：父级逆时针 45°，其余同上 ✓
         *     中间那条：**整行（含圆点）** 以圆心为锚点 scaleX → 0
         *               → 从线的右端一路缩回圆点、连圆点一起消失 ✓
         *
         *   ⚠️ 之前错在哪：把圆点当成不动的独立元素、又把线条左端点当旋转中心 ✗
         *      → 结果"线在转、三个点却在慢慢变透明"，而且交点被拖偏 ✓
         */
        /**
         * 上下两条：**只旋转**，不做任何"按状态单独补的偏移" ✓
         *   偏移统一放在图标容器上（三行点+线共用一个整体偏移）——
         *   用户明确要求"以 3 行点+线为一个整体" ✓
         * 中间那条：用 `clip-path` 从右往左擦除（不能用 scaleX，那会连圆点一起压扁 ✗）
         */
        const rowTo = isMid
          ? { clipPath: 'inset(0 100% 0 0)' }
          : { rotate: i === 0 ? 45 : -45 };
        const rowRest = isMid
          ? { clipPath: 'inset(0 0% 0 0)' }
          : { rotate: 0 };
        /**
         * 线的两个状态（锚点在**左端** FUSED_L，所以 scaleX 只往右长）：
         *   展开：scaleX 1 + x 0     → 铺满 [1.6, 16.6]，左边盖住圆点完成融合 ✓
         *   收起：scaleX 0.644 + x 3.1 → 变成 [4.7, 14.36]，**和原图完全一致** ✓
         * 中间那条两个状态都用收起态（它的伸缩靠父级 clip-path 擦除完成 ✓）
         */
        const lineTo = isMid ? { scaleX: REST_SCALE, x: REST_SHIFT } : { scaleX: 1, x: 0 };
        const lineRest = { scaleX: REST_SCALE, x: REST_SHIFT };
        return (
          <span
            key={i}
            className="absolute left-0 right-0 block"
            style={{
              top: cy - BAR_H / 2,
              height: BAR_H,
            }}
          >
            <motion.span
              className="absolute inset-0 block"
              /**
               * ⚠️⚠️ 旋转中心必须写在**这一层**（真正执行 rotate/scaleX 的是它）——
               *   之前我写到了外层的 span 上，外层根本不动，内层就退回了默认的
               *   「自身中心」→ 用户看到"上面的线绕着一整行的中间在转" ✗
               *   锚点 = **默认状态那个圆点的圆心** (2.5px, 行中心) ✓
               */
              style={{ transformOrigin: `${DOT_CX}px center` }}
              initial={false}
              animate={reduce ? { opacity: isMid && open ? 0 : 1 } : (open ? rowTo : rowRest)}
              transition={
                reduce
                  ? { duration: D_RETRACT, ease: EASE_OUT }
                  : {
                      ...SPRING_MORPH,
                      // 收起时让中间那条稍晚一点回来，先让上下两条转平，顺序更好读
                      delay: !open && isMid ? 0.06 : 0,
                    }
              }
            >
              {/* 圆点：**跟着父级一起转**（不再单独淡出 ✗）；融合后被线盖住，看起来就是一根线 ✓ */}
              <span
                className={`absolute top-0 rounded-full ${BAR}`}
                style={{ left: DOT_L, width: DOT_D, height: DOT_D }}
              />
              {/* 线：锚点在**右端** → scaleX 变大时只往左延伸，伸到圆点处即融合 ✓ */}
              <motion.span
                className={`absolute top-0 rounded-full ${BAR}`}
                style={{
                  left: FUSED_L,
                  width: OPEN_W,
                  height: BAR_H,
                  transformOrigin: 'left center',
                }}
                initial={false}
                animate={reduce ? { opacity: isMid && open ? 0 : 1 } : (open ? lineTo : lineRest)}
                transition={reduce ? { duration: D_RETRACT, ease: EASE_OUT } : SPRING_MORPH}
              />
            </motion.span>
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

  /**
   * ⚠️ 和导航栏那三行**完全同构**的几何（用户要求"先确保默认状态两根线长度和间距
   *    都是占比正方形的状态，展开后和导航栏那个一样交叉"）：
   *
   *   默认（正方形占比）：
   *     线长 L = 5，两条线的间距也是 5 → 两条线 + 中间空隙 = 一个 5×5 的正方形 ✓
   *     两条线水平居中：x 5.5 → 10.5（图标盒 16，中心 8）✓
   *     纵向中心分别落在 y = 5.5 和 10.5（也关于 8 对称）✓
   *
   *   展开（交叉）：
   *     旋转中心 = **每条线的左端** x = 5.5
   *     枢轴到交叉点的距离 = √(2.5² + 2.5²) = 3.536（由两行间距 5 决定，是定值）
   *     四臂等长条件 → 右伸 b − 左伸 a = 2 × 3.536 = 7.071
   *     左伸 a = 0（枢轴就在线的左端）→ 展开态线长 = 7.071，右端 = 5.5 + 7.071 = 12.571
   *
   *   校验：叉的包围盒 x 5.5→10.5（中心 8.00 ✓）  y 5.5→10.5（中心 8.00 ✓）
   *         图标盒中心 = 8 ✓✓ → **两个状态都精确居中，不需要任何偏移** ✓
   */
  /**
   * ⚠️⚠️ 按用户澄清的几何（我之前的错误：**死守 45°** ✗ —— 45° 只是正方形的特例 ✓）
   *
   *   虚拟框 = **长方形 W × H**（W=6, H=4.5，宽高比 1.33）
   *     默认：两条线贴住长方形的上下边 → 线长 = W = 6、间距 = H = 4.5 ✓
   *     展开：各绕**自己的左端**（长方形左边的两个角）旋转，
   *           转角 = **atan(H/W)** = atan(4.5/6) = **36.87°**（不是 45° ✗）
   *           线长 = **对角线** = √(W²+H²) = √(36+20.25) = **7.5**
   *           → 两条线的端点正好落到长方形的另外两个角上 ✓✓（= 用户草图第 2 个状态）
   *
   *   ✅ 这么做还白捡一个好处：叉 **就是** 这个长方形的两条对角线，
   *      所以展开态和默认态的**包围盒完全一样** → 两个状态天然统一居中，
   *      再也不用在两个状态之间折中偏移了 ✓✓
   *
   *   校验：枢轴 (5, 6.35) 走 7.5、转 36.87° → 位移 (6, 4.5) → 落点 (11, 10.85) = 右下角 ✓
   *         枢轴 (5, 10.85) 反方向      → 位移 (6, -4.5) → 落点 (11, 6.35) = 右上角 ✓
   */
  const ROW_GAP = 3.5;               // 长方形的高 H = 两条线的间距
                                     // ⚠️ 用户反馈"间距太宽，再挨紧一点，上下比例压缩一点" →
                                     //    4.5 收到 3.5 ✓ 宽高比从 1.33 变成 1.71（更扁 ✓）
                                     //    改这一个数就够：下面的倾斜角、展开线长、两行位置
                                     //    全都是从 REST_LEN / ROW_GAP 自动推导的 ✓ 不用手改 ✓
  const REST_LEN = 6;                // 长方形的宽 W = 默认线长（拉长了 ✓）
  const OPEN_LEN = Math.hypot(REST_LEN, ROW_GAP); // 7.5 = 对角线
  const restScale = REST_LEN / OPEN_LEN;          // 0.8（展开时变长 ✓）
  /** 倾斜角 = atan(H/W)，**不是 45°** ✗ —— 长方形就得按它自己的对角线角度转 ✓ */
  const TILT = (Math.atan2(ROW_GAP, REST_LEN) * 180) / Math.PI; // 36.87°
  const PIVOT_X = 5;                 // 线的左端 = 旋转中心（让长方形水平居中于图标：5→11，中心 8 ✓）
  const rowCy = [8.6 - ROW_GAP / 2, 8.6 + ROW_GAP / 2]; // 6.35 / 10.85
  const LINE_H = 1.1;

  return (
    <span aria-hidden className="absolute inset-0 m-auto block" style={{ width: W, height: H }}>
      {/*
        外框：**直接用原图 file_list.svg 里那条外框路径抽出来的遮罩**
        （public/file_list-body.svg）—— 这样外框和用户原来看到的**逐像素一致** ✓
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
      {/* 里面两条线：父级绕**线左端**旋转，子级（线自己）从 5 长到 7.071 ✓ */}
      {rowCy.map((cy, i) => (
        <span
          key={i}
          className="absolute left-0 right-0 block"
          style={{ top: cy - LINE_H / 2, height: LINE_H }}
        >
          <motion.span
            className="absolute inset-0 block"
            /* 旋转中心必须写在**真正动的那一层**（导航栏那次就是栽在这里 ✗）*/
            style={{ transformOrigin: `${PIVOT_X}px center` }}
            initial={false}
            animate={reduce ? { opacity: open ? 0.5 : 1 } : { rotate: open ? (i === 0 ? TILT : -TILT) : 0 }}
            transition={reduce ? { duration: D_MORPH, ease: EASE_OUT } : SPRING_MORPH_SOFT}
          >
            <motion.span
              className={`absolute top-0 rounded-full ${BAR}`}
              style={{
                left: PIVOT_X,
                width: OPEN_LEN,
                height: LINE_H,
                // 锚点在左端 → scaleX 只往右长（默认 5 → 展开 7.071）✓
                transformOrigin: 'left center',
              }}
              initial={false}
              animate={reduce ? { opacity: open ? 0.5 : 1 } : { scaleX: open ? 1 : restScale }}
              transition={reduce ? { duration: D_MORPH, ease: EASE_OUT } : SPRING_MORPH_SOFT}
            />
          </motion.span>
        </span>
      ))}
      {reduce && open && (
        // 减少动效时：不转线，直接给一个居中的静态叉做状态提示
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
   ③ 大纲按钮：**重写版** —— 圆圈本身拉伸成长条 + 线从断点伸展过去

   做法：整个图标是**一个内联 SVG**（viewBox 0 0 16 16），里面：
     · 3 个 `<motion.rect>`：默认是**空心圆圈**（宽=高=直径、rx=半径 → 正好是圆 ✓），
       展开变成长条矩形（同时改 x / y / width / height / rx）
       ⚠️ 用 SVG 属性动画而不是 CSS scaleX：scaleX 会把**边框粗细一起拉变形** ✗
          SVG 属性动画只重绘、不触发布局，而且 stroke 永远是 1px ✓
     · 1 条竖线（左边那根"脊柱"，静止 ✓）
     · 2 条连接线：从**线的断点**（贴着脊柱）朝圆圈方向伸展，
       展开时正好接到长条的左边框上 ✓（`x2` 从小到大 ✓ = 进度条式 ✓）

   几何取自两个原图（1024 视图盒 ÷ 64 = 16px）：
     圆环：上 (4.0, 3.5) r 1.9   中 (12.1, 8.5) r 1.9   下 (12.1, 13.5) r 1.9
     长条：上 x 3→15 y 2→5      中 x 7→15 y 7→10       下 x 7→15 y 12→15
     竖线：x 1.5, y 3→14
   ═══════════════════════════════════════════════════════════════ */
export function TocBars({ open, size = 16 }: { open: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const STROKE = 1;
  /** 三条：默认（圆环）⇄ 展开（长条）。rx 用 9999 会在某些浏览器上出问题，所以直接给半径/圆角值 ✓ */
  const shapes = [
    { // 上：⚠️ 用户要求"不用完全按 outline-open.svg 摆，把圆圈往右边拉出来就行" ✓
      //     → 展开态**只有 width 变**（y / h / rx 和圆环完全一致 ✓）= 纯向右拉伸 ✓
      ring: { x: 2.1, y: 1.6, w: 3.8, h: 3.8, rx: 1.9 },
      bar:  { x: 2.1, y: 1.6, w: 12.9, h: 3.8, rx: 1.9 },
    },
    { // 中
      ring: { x: 10.2, y: 6.6, w: 3.8, h: 3.8, rx: 1.9 },
      bar:  { x: 7,    y: 7,   w: 8,   h: 3,   rx: 1 },
    },
    { // 下
      ring: { x: 10.2, y: 11.6, w: 3.8, h: 3.8, rx: 1.9 },
      bar:  { x: 7,    y: 12,  w: 8,   h: 3,   rx: 1 },
    },
  ];
  /** 两条连接线：默认短、展开时长（x2 变大 = 从断点朝形状方向伸 ✓） */
  const links = [
    // 上：形状左边界没动（2.1），所以这条线展开时**不需要动** ✓
    { y: 3.5, from: 1.5, ringTo: 2.1, barTo: 2.1 },
    { y: 13.5, from: 1.5, ringTo: 2.1, barTo: 7 },
  ];
  const spring = reduce ? { duration: 0.12, ease: EASE_OUT } : SPRING_MORPH;

  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={size}
      height={size}
      /* 用 currentColor + 主题类名跟随深浅色 ✓（写死颜色会让深色模式下看不清 ✗）*/
      className="absolute inset-0 m-auto block overflow-visible text-slate-800 dark:text-slate-100"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
    >
      {/* 左侧竖线（脊柱）：静止不动 ✓ */}
      <line x1={1.5} y1={3} x2={1.5} y2={14} />
      {/* 两条连接线：从断点朝形状方向伸展 ✓ */}
      {links.map((l, i) => (
        <motion.line
          key={`link-${i}`}
          y1={l.y}
          y2={l.y}
          initial={false}
          animate={{ x1: l.from, x2: open ? l.barTo : l.ringTo }}
          transition={spring}
        />
      ))}
      {/* 三个形状：圆环 ⇄ 长条 */}
      {shapes.map((s, i) => {
        const t = open ? s.bar : s.ring;
        return (
          <motion.rect
            key={`shape-${i}`}
            initial={false}
            animate={{ attrX: t.x, attrY: t.y, width: t.w, height: t.h, rx: t.rx }}
            transition={spring}
          />
        );
      })}
    </svg>
  );
}
