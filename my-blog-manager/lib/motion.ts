/**
 * 🎞️ 全站动效的共享常量 —— 只此一份，不要在组件里另写一套。
 *
 * 为什么单独放一个文件而不是写进 globals.css：
 *   · framer-motion 的 `transition={{ ease }}` 要的是**数组/贝塞尔数字**，
 *     不是 CSS 变量字符串，写在 CSS 里这边还得再抄一遍 ✗
 *   · 放这里，CSS 用 var(--ease-out)、JS 用 EASE_OUT，两边的值肉眼可核对 ✓
 *
 * ⚠️ 时长一律 ≤ 300ms（UI 动效铁律）。超过 300ms 必须有明确理由。
 */

/** 强 ease-out —— 进场、出场、按下反馈都用它（CSS 里的 --ease-out 同值） */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** 强 ease-in-out —— 元素在屏幕上"移动/形变"时用（CSS 里的 --ease-in-out 同值） */
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

/** iOS 那种抽屉曲线（CSS 里的 --ease-drawer 同值） */
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/* 📌 这里曾经有一条 EASE_WIPE（色块揭开专用的「慢→快→慢」S 形）——已删除 ✓
   用户拿 8 条曲线现场对比之后选了 **EASE_OUT + 0.32s**（对比页里的 D）✓
   为什么 S 形不行（记在这里，免得以后又加回来）：
     时长压到 0.2~0.3s 时，两头那两段"慢"各只有约 **2 帧**，
     人眼分辨不出"快慢变化" ✗ —— 用户实测原话："感觉不出快与慢的变化…像线性的"
     真要做三段节奏，时长至少要 0.4s 以上（那就整体显拖了 ✗）✓
   细节见 Navbar.tsx 里 HOVER_REVEAL 的注释 ✓ */

/** 按下反馈（100–160ms 档） */
export const D_PRESS = 0.14;
/** 小浮层：tooltip、小 popover（125–200ms 档） */
export const D_POPOVER = 0.18;
/** 形变、图标切换（150–250ms 档） */
export const D_MORPH = 0.24;
/** 线条缩回：比展开略快一点，按下去要"立刻有反应"（非对称） */
export const D_RETRACT = 0.18;
/** 列表/内容出现（200–300ms 档） */
export const D_ENTER = 0.28;
/** 列表错峰间隔 —— 铁律是 30–80ms */
export const STAGGER = 0.045;

/* ── 弹簧 ──────────────────────────────────────────────────────
   什么时候用弹簧，而不是贝塞尔：
     · 位置 / 旋转 / 尺寸 这类"会移动"的动效，且用户可能连点打断它
       —— 贝塞尔被中途打断会"重新起步"，弹簧会**带着当前速度接着走**，这就是"丝滑"的来源 ✓
     · 纯透明度、纯颜色 → 用上面的贝塞尔就够，弹簧反而多余 ✗
   bounce 一律 0：UI 里除拖拽/关闭之外**不要回弹**，那会显得廉价 ✗
   ────────────────────────────────────────────────────────────── */

/** 通用形变弹簧：不溢出、但收尾有阻尼感（图标形变、指示器滑动、列表重排都用它） */
export const SPRING_MORPH = { type: 'spring', duration: 0.32, bounce: 0 } as const;

/**
 * 走得远的形变用这条：同样不溢出，但收尾更长、更"软"。
 *
 * 为什么要和上面那条分开：**同样是"形变"，行程不一样就不该用同一条曲线** ——
 * 一个只挪 4px 的指示器和一条要在整个图标里斜穿过去的线，用同一条弹簧的结果是
 * 前者显得拖、后者显得急 ✗。按行程配曲线，看起来才像"想过才定的" ✓
 */
export const SPRING_MORPH_SOFT = { type: 'spring', duration: 0.42, bounce: 0 } as const;

/** 带一点物理感：只给拖拽 / 抽屉关闭 / 手势这类真的"有重量"的地方 */
export const SPRING_PLAYFUL = { type: 'spring', duration: 0.45, bounce: 0.18 } as const;
