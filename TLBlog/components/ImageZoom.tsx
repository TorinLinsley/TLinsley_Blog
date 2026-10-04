"use client";

import { useEffect } from "react";

/**
 * 🔍 点击图片放大查看（像 Obsidian 那样）。
 *
 * 只做「增强」，不改任何渲染链路 —— 和 components/TableScroll.tsx 一个路子：
 * 页面里那些 dangerouslySetInnerHTML 出来的 `.prose img` / `.resource-preview img`
 * 在客户端加上交互，文章本身的 HTML 一个字都不动。
 *
 * 交互（按需求）：
 *   · 电脑：左键点一下图片 → 打开；  手机：单指点一下 → 打开
 *   · 打开后图片以外的区域变暗，图片盖在所有东西之上（压住文章列表 / 大纲 / 导航栏菜单）
 *   · 默认状态 = **最小状态**：按比例铺满屏幕，上下边贴边或左右边贴边（看图片比例），
 *     此时不能再缩小（滚轮/捏合往回收会停在最小态）
 *   · 电脑滚轮 / 触控板捏合 = 缩放；手机双指捏合 = 缩放
 *   · 放大之后：电脑按住左键拖动、手机单指拖动 = 上下左右看细节
 *   · 再单击一下（电脑左键 / 手机单指）= 返回；Esc 也能关
 *
 * 🌍 三大系统的自带浏览器都照顾到了：
 *   · Chromium（Windows/Edge、Linux/Chrome）、Firefox（Linux/Windows）、Safari（macOS/iOS）
 *   · 滚轮 deltaMode 归一化 —— Firefox/Linux 的滚轮给的是"行"不是"像素"，
 *     不换算的话滚半天不动 ✗
 *   · 触控板捏合在 macOS/Linux 上是 `wheel + ctrlKey`（deltaY 很小），单独给一套灵敏度
 *   · iOS：touch-action / -webkit-touch-callout / overscroll-behavior 都上了，
 *     捏合不会变成缩放整个网页，长按也不会弹系统菜单
 *
 * ⚠️ 只管「看」的地方：编辑器正文（.editor-content-area / .ProseMirror）一律不碰 ——
 *    那里点图片是选中图片准备编辑，不能被这个功能抢走 ✗
 */

/** 哪些容器里的图片可以点开放大（和 TableScroll 一个口径） */
const ZOOM_SELECTOR = '.prose, .resource-preview';
/** 这些里面的图片不参与（编辑器正文，以及显式标了 data-no-zoom 的） */
const SKIP_INSIDE = '.editor-content-area, .ProseMirror, [data-no-zoom]';
/** 太小的图（图标、徽章）不参与，免得误触 */
const MIN_RENDERED = 80;
/** 拖动/捏合超过这个像素就算「拖动」而不是「单击」，松手时不会误关闭 */
const CLICK_SLOP = 6;
/** 普通滚轮灵敏度：deltaY≈100（像素）一格 ≈ 放大 16% */
const WHEEL_SENSITIVITY = 0.0015;
/** 触控板捏合（wheel + ctrlKey）的灵敏度：它的 deltaY 很小，得放大一档 */
const PINCH_SENSITIVITY = 0.02;
/** z-index：比导航栏、播放器、所有弹层都高（图层：内容 < 列表/大纲 < 导航菜单 < 图片层） */
const OVERLAY_Z = 2147483000;
/** 图片链接（点开还是图片）才接管点击；指向页面的链接照旧跳转 */
const IMAGE_HREF = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;

export default function ImageZoom() {
  useEffect(() => {
    let overlay: HTMLDivElement | null = null;
    let zoomImg: HTMLImageElement | null = null;
    let prevBodyOverflow = "";
    let prevHtmlOverscroll = "";
    /**
     * 🐛 手机上"点一下关闭"会立刻又被打开：
     *    手指抬起 → 我们关掉浮层 → 浏览器随后补发一个 click，而这时浮层已经没了，
     *    这个 click 就落到底下那张正文图片上 → 又触发打开 ✗
     *    所以触摸关闭后的一小段时间里，把紧跟而来的那次 click 吃掉。
     *    （鼠标不会这样：click 的目标是 mousedown/mouseup 的公共祖先，浮层没了就落到 body，不会命中图片）
     */
    let swallowClickUntil = 0;

    // 视图状态：fit = 铺满屏幕的基准倍率；zoom = 在基准上的放大倍数（≥1，1 就是最小态）
    let natW = 0;
    let natH = 0;
    let fit = 1;
    let zoom = 1;
    let maxZoom = 8;
    let tx = 0;
    let ty = 0;

    const clampPan = () => {
      const w = natW * fit * zoom;
      const h = natH * fit * zoom;
      const maxX = Math.max(0, (w - window.innerWidth) / 2);
      const maxY = Math.max(0, (h - window.innerHeight) / 2);
      tx = Math.min(maxX, Math.max(-maxX, tx));
      ty = Math.min(maxY, Math.max(-maxY, ty));
    };

    const paint = () => {
      if (!zoomImg) return;
      clampPan();
      zoomImg.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${fit * zoom})`;
    };

    /** 缩放（滚轮/捏合都走这里，保证手感一致）：anchor 是屏幕坐标，缩放时把锚点钉住 */
    const zoomTo = (next: number, anchorX?: number, anchorY?: number) => {
      const target = Math.min(maxZoom, Math.max(1, next));
      if (Math.abs(target - zoom) < 0.0005) return;

      if (anchorX !== undefined && anchorY !== undefined) {
        const k = target / zoom;
        const cx = anchorX - window.innerWidth / 2;
        const cy = anchorY - window.innerHeight / 2;
        tx = cx - k * (cx - tx);
        ty = cy - k * (cy - ty);
      } else {
        tx *= target / zoom;
        ty *= target / zoom;
      }

      zoom = target;
      if (zoom <= 1.0001) { tx = 0; ty = 0; }   // 回到最小态 → 归位居中
      paint();
    };

    const onResize = () => {
      if (!overlay || !natW || !natH) return;
      fit = Math.min(window.innerWidth / natW, window.innerHeight / natH);
      paint();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };

    const close = () => {
      if (!overlay) return;
      overlay.remove();
      overlay = null;
      zoomImg = null;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown, true);
    };

    /** 真正把浮层搭起来（拿到图片真实尺寸之后调用） */
    const build = (src: string, alt: string, w: number, h: number) => {
      natW = w || 1;
      natH = h || 1;
      fit = Math.min(window.innerWidth / natW, window.innerHeight / natH);
      zoom = 1;
      tx = 0;
      ty = 0;
      // 最多放大到「原始像素的 2 倍」，最少也给 3 倍可玩，最多 12 倍
      maxZoom = Math.min(12, Math.max(3, (1 / Math.max(fit, 0.0001)) * 2));

      // 锁住背景滚动（iOS 上光 overflow:hidden 不够，再压一层 overscroll-behavior）
      prevBodyOverflow = document.body.style.overflow;
      prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';

      overlay = document.createElement('div');
      overlay.setAttribute('data-image-zoom', '');
      overlay.style.cssText = [
        'position:fixed', 'inset:0', `z-index:${OVERLAY_Z}`,
        'background:rgba(0,0,0,0.9)', 'display:flex', 'align-items:center', 'justify-content:center',
        'overflow:hidden',
        // 👇 iOS/Android 关键：手指在浮层上的任何滑动都不交给浏览器（不滚页面、不缩放网页）
        'touch-action:none',
        'overscroll-behavior:contain',
        'cursor:zoom-out',
        'user-select:none', '-webkit-user-select:none',
        '-webkit-touch-callout:none',           // iOS 长按不弹"存储图片/拷贝"系统菜单
        '-webkit-tap-highlight-color:transparent',
        'animation:imageZoomFade .16s ease-out',
      ].join(';');

      zoomImg = document.createElement('img');
      zoomImg.src = src;
      zoomImg.alt = alt;
      zoomImg.draggable = false;
      // 先按原始像素摆好，再整体 scale —— fit/zoom 完全由我们算，不受 max-width 之类影响
      zoomImg.style.cssText = [
        `width:${natW}px`, `height:${natH}px`,
        'max-width:none', 'max-height:none', 'border-radius:0',
        'transform-origin:center center', 'will-change:transform',
        'pointer-events:none', 'user-select:none', '-webkit-user-select:none',
        '-webkit-user-drag:none', '-webkit-touch-callout:none',
        'box-shadow:0 20px 60px rgba(0,0,0,0.45)',
      ].join(';');

      overlay.appendChild(zoomImg);
      document.body.appendChild(overlay);
      paint();

      // ── 手势：全部用 Pointer Events（鼠标 / 触摸一套逻辑，Chromium/Firefox/Safari 都支持） ──
      /**
       * 每根手指各自记账（按下点 + 自己走过的距离），**不看"表里还剩几个"**来判定单击。
       * 触摸这边还以浏览器的活跃触摸列表（e.touches）为准做清理：
       * 浏览器漏发 up/cancel 留下的残留条目，会被下一次 touchstart/touchend 直接扫掉 ✓
       */
      type Drag = { x: number; y: number; moved: number; startTx: number; startTy: number };
      const drag = new Map<number, Drag>();
      let pinchStartDist = 0;
      let pinchStartZoom = 1;
      let lastPinchAt = 0;     // 刚捏合过的时间戳：这之后的"松手"不算单击
      let lastMoved = 0;       // 最近一次抬起的那根手指走了多远

      const setCursor = () => {
        if (!overlay) return;
        overlay.style.cursor = drag.size > 0 && zoom > 1.02 ? 'grabbing' : 'zoom-out';
      };

      const onPointerDown = (e: PointerEvent) => {
        // 只对鼠标做指针捕获：iOS Safari 上给触摸指针做捕获偶发怪脾气，浮层本来铺满全屏，不需要
        if (e.pointerType === 'mouse') { try { overlay?.setPointerCapture(e.pointerId); } catch { /* 忽略 */ } }

        drag.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0, startTx: tx, startTy: ty });

        if (drag.size === 2) {
          const [a, b] = [...drag.values()];
          pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          pinchStartZoom = zoom;
        }
        setCursor();
      };

      const onPointerMove = (e: PointerEvent) => {
        const me = drag.get(e.pointerId);
        if (!overlay || !me) return;
        me.moved = Math.max(me.moved, Math.hypot(e.clientX - me.x, e.clientY - me.y));

        const active = [...drag.values()];
        if (active.length >= 2) {
          // 双指捏合：必须**两指距离真的变了**才算捏合（否则残留条目 + 静止点按会被误判成捏合）
          const [a, b] = active;
          const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          me.x = e.clientX;
          me.y = e.clientY;
          if (Math.abs(dist - pinchStartDist) > 2) {
            lastPinchAt = performance.now();
            zoomTo(pinchStartZoom * (dist / pinchStartDist), (a.x + b.x) / 2, (a.y + b.y) / 2);
          }
          return;
        }

        // 单指/鼠标：只有放大之后才能拖着看细节（最小态时拖动没有意义）
        if (zoom <= 1.02) return;
        tx = me.startTx + (e.clientX - me.x);
        ty = me.startTy + (e.clientY - me.y);
        paint();
      };

      /**
       * 松手：只看**这根手指自己走没走** + 刚刚有没有真捏合过。
       * ⚠️ 绝不判断"表里还剩几个"：浏览器（尤其 iOS）偶尔漏发 up/cancel，
       *    残留条目会让下一次单击被当成"还有手指没抬"，点一下关不掉 ✗
       */
      const onPointerUp = (e: PointerEvent) => {
        if (!overlay) return;
        const me = drag.get(e.pointerId);
        drag.delete(e.pointerId);
        lastMoved = me ? me.moved : 0;

        const justPinched = performance.now() - lastPinchAt < 300;
        if (!justPinched && lastMoved < CLICK_SLOP) {
          // 触摸关掉之后，浏览器还会补一个 click（目标是底下的正文图片）→ 短暂屏蔽掉
          if (e.pointerType !== 'mouse') swallowClickUntil = performance.now() + 500;
          close();
          return;
        }
        if (drag.size === 0) setCursor();
      };

      /** 以浏览器的活跃触摸列表为准做清理：它说只剩一根/没有手指了，我们的表就跟着清干净 */
      const onTouchSync = (e: TouchEvent) => {
        const alive = e.touches.length;
        if (alive === 0) drag.clear();
        else if (alive === 1 && drag.size > 1) {
          // 只剩一根手指：把不是它的条目全清掉（他们就是那些残留）
          const keep = (e.touches[0] as Touch & { identifier: number }).identifier;
          [...drag.keys()].forEach((id) => { if (id !== keep) drag.delete(id); });
        }
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // 🌍 跨浏览器：Firefox/Linux 的滚轮 deltaMode=1（按"行"给），Safari 捏合是 ctrl+wheel（deltaY 很小）
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;                        // 行 → 像素
        else if (e.deltaMode === 2) dy *= window.innerHeight;   // 页 → 像素
        const k = e.ctrlKey ? PINCH_SENSITIVITY : WHEEL_SENSITIVITY;
        zoomTo(zoom * Math.exp(-dy * k), e.clientX, e.clientY);
      };

      /** 单击返回的兜底（鼠标一定有 click；触摸有的浏览器不补发，所以 pointerup 那条才是主力） */
      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (performance.now() - lastPinchAt >= 300 && lastMoved < CLICK_SLOP) close();
      };

      const onLostCapture = (e: PointerEvent) => { drag.delete(e.pointerId); };

      const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); };

      overlay.addEventListener('pointerdown', onPointerDown);
      overlay.addEventListener('pointermove', onPointerMove);
      overlay.addEventListener('pointerup', onPointerUp);
      overlay.addEventListener('pointercancel', onPointerUp);
      overlay.addEventListener('lostpointercapture', onLostCapture);
      overlay.addEventListener('touchstart', onTouchSync);
      overlay.addEventListener('touchend', onTouchSync);
      overlay.addEventListener('touchcancel', onTouchSync);
      overlay.addEventListener('wheel', onWheel, { passive: false });
      overlay.addEventListener('click', onClick);          // 单击返回（也顺带挡住点击穿透到下面的页面）
      overlay.addEventListener('dblclick', swallow);
      overlay.addEventListener('contextmenu', swallow);

      window.addEventListener('resize', onResize);
      window.addEventListener('keydown', onKeyDown, true);
    };

    /** 打开某个图片 */
    const open = (source: HTMLImageElement) => {
      const src = source.currentSrc || source.src;
      if (!src || overlay) return;

      if (source.naturalWidth && source.naturalHeight) {
        build(src, source.alt || '', source.naturalWidth, source.naturalHeight);
      } else {
        // 还没加载完就先探一下真实尺寸，避免按错误比例算 fit（会闪一下）
        const probe = new Image();
        probe.onload = () => build(src, source.alt || '', probe.naturalWidth, probe.naturalHeight);
        probe.onerror = () => build(src, source.alt || '', source.width || 1, source.height || 1);
        probe.src = src;
      }
    };

    // ── 打开入口：事件委托（内容是后渲染出来的，挂 document 最省事，用捕获阶段尽早拿到） ──
    const onDocClick = (e: MouseEvent) => {
      if (overlay) return;
      // 刚用触摸关掉浮层 —— 这一下 click 是浏览器补发的，别再打开一次
      if (performance.now() < swallowClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.button !== 0) return;
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName !== 'IMG') return;

      const img = el as HTMLImageElement;
      if (img.closest(SKIP_INSIDE)) return;                 // 编辑器里的图不参与
      if (!img.closest(ZOOM_SELECTOR)) return;              // 只看正文里的图
      if (img.getBoundingClientRect().width < MIN_RENDERED) return;

      // 包在链接里的图：链接指向图片才接管；指向别的页面就让链接照旧工作
      const href = img.closest('a')?.getAttribute('href') || '';
      if (href && !IMAGE_HREF.test(href)) return;

      e.preventDefault();
      e.stopPropagation();
      open(img);
    };

    document.addEventListener('click', onDocClick, true);

    // 光标提示 + 手机上点图更快（touch-action:manipulation 干掉双击缩放整页的行为）
    const style = document.createElement('style');
    style.setAttribute('data-image-zoom-style', '');
    style.textContent = `
      .prose img, .resource-preview img { cursor: zoom-in; touch-action: manipulation; }
      .editor-content-area img, .ProseMirror img { cursor: default; }
      @keyframes imageZoomFade { from { opacity: 0 } to { opacity: 1 } }
    `;
    document.head.appendChild(style);

    return () => {
      document.removeEventListener('click', onDocClick, true);
      style.remove();
      close();
    };
  }, []);

  return null;
}
