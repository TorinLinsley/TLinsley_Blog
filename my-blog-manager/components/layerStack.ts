"use client";

/**
 * 移动端「一层一层往回退」的东西都登记到这里：导航栏菜单、资源页左右抽屉、
 * 设置页抽屉、文章页大纲抽屉。
 *
 * 为什么要这个：这些层都有自己的遮罩，靠 `onClick` 收起是**靠不住**的 ——
 *   ① 退场动画播放期间那层还挂在 DOM 上，会把下一次点击吃掉（必须等动画放完才点得动）；
 *   ② 层与层的层级（z-index）谁压谁，取决于谁后挂载，很容易让点击落到"看起来已经关掉"的那层；
 *   ③ 最要命的是**穿透**：手指按在遮罩上，遮罩在 pointerdown 那一刻就被收掉了，
 *      等手指抬起来时 click 已经落在"下面正文的链接"上 → 直接跳走 ✗
 *      （按得越慢越容易中招；只靠"关掉后 400ms 内挡一下"是挡不住慢按的）
 *
 * 这里的做法不看 z-index、也不等任何动画：在 window 的**捕获阶段**盯 pointerdown，
 * 直接问"现在最上面那一层是谁"，然后：
 *   · 手指落在**任何一层**的面板内部 / 按钮行上 → 什么都不做（面板里正常操作、按钮随便连点）
 *   · 手指落在任何**按钮 / 链接 / 输入框**上 → 什么都不做
 *     （⚠️ 导航栏的**空白处**不算：它跟页面空白一视同仁，照样收层）
 *   · 其它位置（遮罩 / 空白 / 导航栏的空白）→ **只收最上面这一层**
 *
 * 并且这一次手势的 click 会**按落点判断**：click 的位置和刚才按下去的位置对不上
 * （说明中间那层被收掉、DOM 换了），就把这次 click 掐掉，绝不让它穿到正文的链接上 ✓
 *
 * 另外：正在退场的那几层（遮罩 + 面板）请务必在 exit 里写 `pointerEvents: 'none'`，
 * 否则它们会在动画期间继续挡住手指。
 *
 * 还有一条**只针对大纲标题**的规矩（资源和归档两处都一样）：
 * 关掉最上面那层之后，等它完全收完（约 450ms）才允许点大纲标题 ——
 * 不然"两层同时开着、第一下点在标题位置"会直接跳转。空白处不受这条限制，
 * 所以"快速点两下空白依次收起两层"照旧即时生效。
 */

type Layer = {
  /** 面板本体：手指在这里面时不要收 */
  panel: () => HTMLElement | null;
  /** 这一层自己的按钮/工具栏等：手指在这里时不要收（留给按钮处理） */
  controls?: () => HTMLElement | null;
  close: () => void;
};

const layers: Layer[] = [];
let installed = false;

/** 刚关掉一层的时间点：之后的 CLICK_GUARD_MS 内，挡掉"穿到正文"的点击 */
let lastCloseAt = 0;
const CLICK_GUARD_MS = 400;

/**
 * 大纲标题的专属冷却：关掉最上面那层之后，**等它完全收完**（约 450ms）才允许点大纲标题。
 *
 * 只针对大纲标题（`[data-toc-level]`），空白处不受影响 ——
 * 所以"快速点两下空白依次收起两层"照旧即时生效，只是那两下之间如果夹着点标题，
 * 标题要等上层收完才响应。
 */
let blockTocUntil = 0;
const TOC_BLOCK_MS = 450;

/** 天然的交互元素：一律不拦，交给它们自己的点击逻辑 */
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]';

/** 这一次手势：按在哪儿、是不是按在"遮罩 / 空白"上、什么时候按的 */
let downTarget: HTMLElement | null = null;
let downOnBlank = false;
let downAt = 0;
/**
 * 空白手势的 click 兜底时间窗。
 * 正常人手按一下不会超过这么久；超时就当"这次 click 不是那一下了"（比如程序里
 * `el.click()` 这种没有 pointerdown 的合成点击），放它过去 ✓
 */
const BLANK_CLICK_MS = 5000;

/** 手指是不是落在某一层的面板 / 按钮行里 */
function insideLayerChrome(target: HTMLElement) {
  return layers.some((l) => {
    const panel = l.panel();
    if (panel && panel.contains(target)) return true;
    const controls = l.controls?.();
    return !!(controls && controls.contains(target));
  });
}

/**
 * click 的落点，是不是"就是刚才按下去的那个东西"（同一个 / 互为父子）。
 *
 * 正常点击一定成立：手指按在按钮上、抬起来时 click 还是那个按钮（或它里面的图标）。
 * 一旦那层被收掉（元素被卸载，或 exit 里设了 pointer-events: none），
 * click 就会落到**另一个完全无关的元素**上 —— 那就是穿透，该掐 ✓
 */
function sameSpot(down: HTMLElement, click: HTMLElement) {
  if (!down.isConnected) return false;
  return down === click || down.contains(click) || click.contains(down);
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  downTarget = target;
  downOnBlank = false;
  downAt = performance.now();

  const top = layers[layers.length - 1];
  if (!top || !target) return; // 现在没有任何层开着，别管

  // ⓪ 大纲标题：上层刚关掉的这 450ms 内一律不响应（等它完全收完）
  if (performance.now() < blockTocUntil && target.closest('[data-toc-level]')) {
    event.stopPropagation();
    return;
  }

  // ① 面板内部 / 按钮行：不拦（抽屉开着照样能开导航栏菜单，两层可以同时开着）
  if (insideLayerChrome(target)) return;

  // ② 按钮 / 链接 / 输入框：不拦（否则点主题开关、点导航项都会被吞掉）
  //
  // ⚠️ 这里以前写的是 `target.closest('header') || …` —— 只要落在导航栏里就一律放行，
  //    于是导航栏上那些**没绑任何点击的空白处**（logo 和右侧图标之间那一大片）也被
  //    当成了交互区：菜单 / 抽屉开着的时候点那儿毫无反应，用户会觉得
  //    "这块明明是空的，怎么不算空白处"。现在导航栏的空白跟页面空白一视同仁，
  //    点了照样收最上面那层 ✓
  //    导航项是 <Link>、主题开关和菜单键是 <button>，都在 INTERACTIVE 里，不受影响 ✓
  //    （导航栏 z-[60] 盖在遮罩之上、永远不会被遮罩挡住，所以也不存在"穿透到正文"的问题）
  if (target.closest(INTERACTIVE)) return;

  // ③ 剩下的就是"遮罩 / 空白处"：只收最上面那一层，并掐掉这次事件
  event.stopPropagation();
  downOnBlank = true; // 这一下之后的 click 要按落点判断，别让它穿到正文
  const now = performance.now();
  lastCloseAt = now;
  blockTocUntil = now + TOC_BLOCK_MS;
  top.close();
}

/**
 * 手指抬起来时补一道：把"穿到正文"的那一下 click 吞掉。
 *   · 空白手势按落点判断（不看时间，慢按也挡得住）
 *   · 再加一层"刚关完 400ms 内"的时间兜底
 */
function onClickCapture(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  // 大纲标题的冷却期：pointerdown 已经挡过一次，这里再挡 click，
  // 双保险（不然 click 还是会走到标题按钮的 onClick 上，照样跳转）
  if (performance.now() < blockTocUntil && target.closest('[data-toc-level]')) {
    event.stopPropagation();
    event.preventDefault();
    return;
  }

  // ⭐ 穿透拦截：手按在遮罩/空白上 → click 却落在别的地方（那层已经被收掉了）
  if (downOnBlank) {
    downOnBlank = false;
    if (performance.now() - downAt > BLANK_CLICK_MS) {
      // 太久远了，当作没关系
    } else if (!downTarget || !sameSpot(downTarget, target)) {
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    // 落点还是刚才按下去的那个（遮罩本身还挂在那儿）：不掐，交给它自己的 onClick
  }

  if (!lastCloseAt || performance.now() - lastCloseAt > CLICK_GUARD_MS) return;
  if (insideLayerChrome(target)) return;                 // 面板里的正常点击要放行
  if (target.closest(INTERACTIVE)) return;               // 按钮/链接放行（导航栏的空白不算）
  event.stopPropagation();
  event.preventDefault();
}

/**
 * 键盘敲出来的 click（Enter / 空格）没有 pointerdown 那一步，
 * 所以一有按键就把这次手势的状态清掉，免得把键盘的 click 也吞了 ✓
 */
function onKeyDown() {
  downOnBlank = false;
  downTarget = null;
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('click', onClickCapture, true);
  window.addEventListener('keydown', onKeyDown, true);
}

/** 登记一层（返回注销函数）；只有真正打开时才登记，关掉后就被移出栈 */
export function registerLayer(layer: Layer) {
  install();
  layers.push(layer);
  return () => {
    const i = layers.indexOf(layer);
    if (i >= 0) layers.splice(i, 1);
  };
}
