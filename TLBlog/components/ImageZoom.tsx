"use client";

import { useEffect } from "react";

/**
 * 🔍 统一的图片浏览器（用户 2026-10-23 要求）
 *
 * 全站所有"点开看大图"的地方都走这一个组件，交互完全一致：
 *   · 打开：点正文图片（文章 / 杂谈 / 关于我 / 资源分享）+ 说说里的图片（由 MomentList 调 open）
 *   · 默认态 = 按比例铺满屏幕（上下或左右贴边），这就是**最小态**，不能再缩小 ✓
 *   · 缩放：电脑滚轮 / 触控板捏合；手机双指捏合 ✓ 只作用于图片，**不会缩放整个网页** ✓
 *   · 放大后：电脑按住拖动、手机单指拖动 = 移动画面看细节 ✓
 *   · 切换：**只有默认态（没放大）**才能翻上/下一张 ——
 *       电脑鼠标按住左右拖、手机手指左右滑 ✓（翻页阈值 60px，斜着划不算 ✓）
 *       底部那排按钮也能翻：左箭头在最左、右箭头在最右、页码居中 ✓
 *       放大状态下拖动是"移画面"而不是"翻页" ✓
 *   · 关闭：点图片/按钮以外的**空白处** ✓、按 Esc ✓（手机上点空白同样有效）
 *   · 键盘：← → 也能翻页（有上一张/下一张时）✓
 *
 * 箭头为什么放底部：以前压在图片左右两侧，手机上正好挡住画面 ✗
 *
 * 兼容性：Pointer Events（鼠标/触摸一套逻辑）+ 滚轮 deltaMode 归一化（Firefox/Linux 按行给）
 *        + iOS 的 gesturestart/touch-action/overscroll-behavior（不让整页跟着缩放/回落）
 *
 * ⚠️ 编辑器正文（.editor-content-area / .ProseMirror）里的图**不接管** —— 那里点图是编辑，不能抢 ✗
 */

/** 哪些容器里的图片可以点开放大 */
const ZOOM_SELECTOR = '.prose, .resource-preview';
/** 这些里面的图片不参与 */
const SKIP_INSIDE = '.editor-content-area, .ProseMirror, [data-no-zoom]';
/** 太小的图（图标、徽章）不参与，免得误触 */
const MIN_RENDERED = 80;
/** 拖动/捏合超过这个像素就算"拖动"而不是"单击" */
const CLICK_SLOP = 6;
/** 横向滑动超过这个距离就翻页 */
const SWIPE_THRESHOLD = 60;
/** 普通滚轮灵敏度 */
const WHEEL_SENSITIVITY = 0.0015;
/** 触控板捏合（wheel + ctrlKey）的灵敏度 */
const PINCH_SENSITIVITY = 0.02;
/** 图层最高 */
const OVERLAY_Z = 2147483000;
/** 底部那排按钮占的高度（图片可用高度要减掉它，免得被挡住） */
const BOTTOM_BAR = 64;
/** 图片链接（点开还是图片）才接管点击 */
const IMAGE_HREF = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;

export type GalleryItem = { src: string; alt?: string };

type ViewerApi = {
  open: (items: GalleryItem[], index?: number) => void;
  close: () => void;
};

declare global {
  interface Window {
    __tlImageViewer?: ViewerApi;
  }
}

export default function ImageZoom() {
  useEffect(() => {
    let overlay: HTMLDivElement | null = null;
    let imgEl: HTMLImageElement | null = null;
    let bar: HTMLDivElement | null = null;
    let counterEl: HTMLSpanElement | null = null;
    let prevBtn: HTMLButtonElement | null = null;
    let nextBtn: HTMLButtonElement | null = null;
    let prevBodyOverflow = "";
    let prevHtmlOverscroll = "";

    /** 触摸关闭后浏览器补发的 click 要吃掉（否则会立刻又打开底下那张图） */
    let swallowClickUntil = 0;

    let items: GalleryItem[] = [];
    let index = 0;

    let natW = 0;
    let natH = 0;
    let fit = 1;
    let zoom = 1;
    let maxZoom = 8;
    let tx = 0;
    let ty = 0;

    const viewW = () => window.innerWidth;
    /** 可用高度：减掉底部按钮带，图片不会被按钮压住 */
    const viewH = () => Math.max(120, window.innerHeight - BOTTOM_BAR);

    const clampPan = () => {
      const w = natW * fit * zoom;
      const h = natH * fit * zoom;
      const maxX = Math.max(0, (w - viewW()) / 2);
      const maxY = Math.max(0, (h - viewH()) / 2);
      tx = Math.min(maxX, Math.max(-maxX, tx));
      ty = Math.min(maxY, Math.max(-maxY, ty));
    };

    const paint = () => {
      if (!imgEl) return;
      clampPan();
      imgEl.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${fit * zoom})`;
    };

    /** 缩放：anchor 是屏幕坐标，缩放时把锚点钉住（滚轮/捏合手感一致） */
    const zoomTo = (next: number, anchorX?: number, anchorY?: number) => {
      const target = Math.min(maxZoom, Math.max(1, next));
      if (Math.abs(target - zoom) < 0.0005) return;

      if (anchorX !== undefined && anchorY !== undefined) {
        const k = target / zoom;
        const cx = anchorX - viewW() / 2;
        const cy = anchorY - (viewH() / 2);
        tx = cx - k * (cx - tx);
        ty = cy - k * (cy - ty);
      } else {
        tx *= target / zoom;
        ty *= target / zoom;
      }

      zoom = target;
      if (zoom <= 1.0001) { tx = 0; ty = 0; }
      paint();
      updateCursor();
    };

    const relayout = () => {
      if (!overlay || !natW || !natH) return;
      fit = Math.min(viewW() / natW, viewH() / natH);
      paint();
    };

    const updateChrome = () => {
      if (!counterEl || !bar) return;
      const many = items.length > 1;
      bar.style.display = many ? 'flex' : 'none';
      counterEl.textContent = `${index + 1} / ${items.length}`;
      if (prevBtn) prevBtn.style.visibility = many ? 'visible' : 'hidden';
      if (nextBtn) nextBtn.style.visibility = many ? 'visible' : 'hidden';
    };

    const updateCursor = () => {
      if (!overlay) return;
      overlay.style.cursor = zoom > 1.02 ? 'grab' : 'zoom-out';
    };

    const close = () => {
      if (!overlay && !bar) return;
      overlay?.remove();
      bar?.remove();
      overlay = null;
      bar = null;
      imgEl = null;
      counterEl = null;
      prevBtn = null;
      nextBtn = null;
      items = [];
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      window.removeEventListener('resize', relayout);
      window.removeEventListener('keydown', onKeyDown, true);
    };

    /** 切到第 i 张（循环） */
    const show = (i: number) => {
      if (!items.length) return;
      index = ((i % items.length) + items.length) % items.length;
      const item = items[index] || items[0];

      zoom = 1;
      tx = 0;
      ty = 0;

      const apply = (w: number, h: number) => {
        natW = Math.max(1, w || 1);
        natH = Math.max(1, h || 1);
        fit = Math.min(viewW() / natW, viewH() / natH);
        maxZoom = Math.min(12, Math.max(3, (1 / Math.max(fit, 0.0001)) * 2));
        if (imgEl) {
          imgEl.style.width = `${natW}px`;
          imgEl.style.height = `${natH}px`;
          imgEl.src = item.src;
          imgEl.alt = item.alt || '';
        }
        paint();
        updateChrome();
        updateCursor();
      };

      const probe = new Image();
      probe.onload = () => apply(probe.naturalWidth, probe.naturalHeight);
      probe.onerror = () => apply(1, 1);
      probe.src = item.src;
      updateChrome();
    };

    const go = (delta: number) => {
      if (items.length < 2) return;
      show(index + delta);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!overlay) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); go(-1); return; }
      if (e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); go(1); }
    };

    const makeBtn = (dir: -1 | 1): HTMLButtonElement => {
      const btn = document.createElement('button');
      const chevron = dir < 0 ? '‹' : '›';
      btn.type = 'button';
      btn.setAttribute('aria-label', dir < 0 ? '上一张' : '下一张');
      btn.textContent = chevron;
      btn.style.cssText = [
        'pointer-events:auto',
        'width:44px', 'height:44px',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border-radius:9999px',
        'border:1px solid rgba(255,255,255,0.18)',
        'background:rgba(255,255,255,0.12)',
        'color:#fff', 'font-size:26px', 'line-height:1',
        'cursor:pointer', 'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
        'user-select:none', '-webkit-user-select:none',
        '-webkit-tap-highlight-color:transparent',
        'transition:background .16s ease',
      ].join(';');
      const light = () => { btn.style.background = 'rgba(255,255,255,0.22)'; };
      const dark = () => { btn.style.background = 'rgba(255,255,255,0.12)'; };
      btn.addEventListener('pointerenter', light);
      btn.addEventListener('pointerleave', dark);
      const stop = (ev: Event) => { ev.stopPropagation(); };
      btn.addEventListener('pointerdown', stop);
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        go(dir);
      });
      return btn;
    };

    const build = () => {
      prevBodyOverflow = document.body.style.overflow;
      prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';

      overlay = document.createElement('div');
      overlay.setAttribute('data-image-zoom', '');
      overlay.style.cssText = [
        'position:fixed', 'inset:0', `z-index:${OVERLAY_Z}`,
        'background:rgba(0,0,0,0.92)',
        'display:flex', 'align-items:center', 'justify-content:center',
        'overflow:hidden',
        // 👇 底部留出按钮带的高度：图片按"屏幕高度 - 64"等比铺满并居中，不会被箭头/页码压住 ✓
        `padding-bottom:${BOTTOM_BAR}px`,
        'box-sizing:border-box',
        'touch-action:none',
        'overscroll-behavior:contain',
        'cursor:zoom-out',
        'user-select:none', '-webkit-user-select:none',
        '-webkit-touch-callout:none',
        '-webkit-tap-highlight-color:transparent',
        'animation:imageZoomFade .16s ease-out',
      ].join(';');

      imgEl = document.createElement('img');
      imgEl.draggable = false;
      imgEl.style.cssText = [
        'max-width:none', 'max-height:none', 'border-radius:0',
        'transform-origin:center center', 'will-change:transform',
        'pointer-events:auto',
        'user-select:none', '-webkit-user-select:none',
        '-webkit-user-drag:none', '-webkit-touch-callout:none',
        'box-shadow:0 20px 60px rgba(0,0,0,0.45)',
      ].join(';');

      /* ── 底部按钮带：左箭头 / 页码 / 右箭头（都在图片外面，不挡画面）── */
      bar = document.createElement('div');
      bar.style.cssText = [
        'position:fixed', 'left:0', 'right:0',
        // iPhone 底部有手势条：安全区一起算进去，按钮不会被顶出屏幕
        'bottom:calc(12px + env(safe-area-inset-bottom, 0px))',
        'display:flex', 'align-items:center', 'justify-content:space-between',
        'padding:0 16px', 'pointer-events:none', `z-index:${OVERLAY_Z + 1}`,
      ].join(';');

      prevBtn = makeBtn(-1);
      nextBtn = makeBtn(1);

      counterEl = document.createElement('span');
      counterEl.style.cssText = [
        'position:absolute', 'left:50%', 'transform:translateX(-50%)',
        'padding:4px 12px', 'border-radius:9999px',
        'background:rgba(255,255,255,0.12)', 'border:1px solid rgba(255,255,255,0.14)',
        'color:rgba(255,255,255,0.9)', 'font-size:12px', 'font-weight:800',
        'letter-spacing:.12em', 'pointer-events:none',
        'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
      ].join(';');

      bar.appendChild(prevBtn);
      bar.appendChild(counterEl);
      bar.appendChild(nextBtn);

      overlay.appendChild(imgEl);
      document.body.appendChild(overlay);
      document.body.appendChild(bar);

      /* ── 手势 ── */
      type Press = { x: number; y: number; moved: number; startTx: number; startTy: number; onImage: boolean };
      const presses = new Map<number, Press>();
      let pinchStartDist = 0;
      let pinchStartZoom = 1;
      let lastPinchAt = 0;
      let lastMoved = 0;
      let lastOnImage = false;
      let lastStartX = 0;

      const onPointerDown = (e: PointerEvent) => {
        if (!overlay) return;
        if (e.pointerType === 'mouse') { try { overlay.setPointerCapture(e.pointerId); } catch { /* 忽略 */ } }
        presses.set(e.pointerId, {
          x: e.clientX, y: e.clientY, moved: 0,
          startTx: tx, startTy: ty,
          onImage: e.target === imgEl,
        });
        lastOnImage = e.target === imgEl;
        lastStartX = e.clientX;

        if (presses.size === 2) {
          const [a, b] = [...presses.values()];
          pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          pinchStartZoom = zoom;
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        const me = presses.get(e.pointerId);
        if (!overlay || !me) return;
        me.moved = Math.max(me.moved, Math.hypot(e.clientX - me.x, e.clientY - me.y));

        const active = [...presses.values()];
        if (active.length >= 2) {
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

        // 单指/鼠标：放大后 = 拖动画布；默认态 = 什么也不做（松手才判翻页）
        if (zoom <= 1.02) return;
        tx = me.startTx + (e.clientX - me.x);
        ty = me.startTy + (e.clientY - me.y);
        paint();
      };

      const onPointerUp = (e: PointerEvent) => {
        if (!overlay) return;
        const me = presses.get(e.pointerId);
        presses.delete(e.pointerId);
        lastMoved = me ? me.moved : 0;

        const justPinched = performance.now() - lastPinchAt < 300;
        if (justPinched) { updateCursor(); return; }

        // ① 默认态下的左右滑动/拖动 = 翻页（阈值 + 以横向为主）
        if (me && zoom <= 1.02 && items.length > 1) {
          const dx = e.clientX - lastStartX;
          const dy = Math.abs(e.clientY - me.y);
          if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > dy * 1.2) {
            go(dx < 0 ? 1 : -1);
            return;
          }
        }

        // ② 点空白处关闭（点图片、点按钮都不关）
        if (lastMoved < CLICK_SLOP) {
          if (!lastOnImage) {
            if (e.pointerType !== 'mouse') swallowClickUntil = performance.now() + 500;
            close();
            return;
          }
        }
        updateCursor();
      };

      /** 浏览器活跃触摸列表为准清理残留条目 */
      const onTouchSync = (e: TouchEvent) => {
        const alive = e.touches.length;
        if (alive === 0) presses.clear();
        else if (alive === 1 && presses.size > 1) {
          const keep = (e.touches[0] as Touch & { identifier: number }).identifier;
          [...presses.keys()].forEach((id) => { if (id !== keep) presses.delete(id); });
        }
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        else if (e.deltaMode === 2) dy *= window.innerHeight;
        const k = e.ctrlKey ? PINCH_SENSITIVITY : WHEEL_SENSITIVITY;
        zoomTo(zoom * Math.exp(-dy * k), e.clientX, e.clientY);
      };

      /** 挡住点击穿透（关闭交给 pointerup 那条路，这里只做兜底的鼠标单击） */
      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!overlay) return;
        if (performance.now() - lastPinchAt < 300) return;
        if (e.target === imgEl) return;              // 点图片本身：不关
        if ((e.target as HTMLElement)?.closest('button')) return;
        if (lastMoved < CLICK_SLOP) close();
      };

      const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
      const onLostCapture = (e: PointerEvent) => { presses.delete(e.pointerId); };

      overlay.addEventListener('pointerdown', onPointerDown);
      overlay.addEventListener('pointermove', onPointerMove);
      overlay.addEventListener('pointerup', onPointerUp);
      overlay.addEventListener('pointercancel', onPointerUp);
      overlay.addEventListener('lostpointercapture', onLostCapture);
      overlay.addEventListener('touchstart', onTouchSync);
      overlay.addEventListener('touchend', onTouchSync);
      overlay.addEventListener('touchcancel', onTouchSync);
      overlay.addEventListener('wheel', onWheel, { passive: false });
      overlay.addEventListener('click', onClick);
      overlay.addEventListener('dblclick', swallow);
      overlay.addEventListener('contextmenu', swallow);
      // iOS Safari：双指捏合默认会缩放整个网页 —— 挡掉
      overlay.addEventListener('gesturestart', swallow as EventListener);
      overlay.addEventListener('gesturechange', swallow as EventListener);
      overlay.addEventListener('gestureend', swallow as EventListener);

      window.addEventListener('resize', relayout);
      window.addEventListener('keydown', onKeyDown, true);
    };

    /** 对外入口：打开一组图片中的第 index 张 */
    const openWith = (list: GalleryItem[], startIndex = 0) => {
      const filtered = (list || []).filter((it) => it && it.src);
      if (!filtered.length) return;
      if (overlay) close();
      items = filtered;
      index = Math.min(Math.max(0, startIndex), filtered.length - 1);
      build();
      show(index);
    };

    // ── 正文图片：事件委托，点哪张就把它所在的容器里所有图收成一组 ──
    const onDocClick = (e: MouseEvent) => {
      if (overlay) return;
      if (performance.now() < swallowClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.button !== 0) return;
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName !== 'IMG') return;

      const img = el as HTMLImageElement;
      if (img.closest(SKIP_INSIDE)) return;
      const container = img.closest(ZOOM_SELECTOR);
      if (!container) return;
      if (img.getBoundingClientRect().width < MIN_RENDERED) return;

      const href = img.closest('a')?.getAttribute('href') || '';
      if (href && !IMAGE_HREF.test(href)) return;

      e.preventDefault();
      e.stopPropagation();

      const all = Array.from(container.querySelectorAll('img')).filter((node) => {
        const im = node as HTMLImageElement;
        if (im.closest(SKIP_INSIDE)) return false;
        if (im.getBoundingClientRect().width < MIN_RENDERED) return false;
        const h = im.closest('a')?.getAttribute('href') || '';
        if (h && !IMAGE_HREF.test(h)) return false;
        return true;
      }) as HTMLImageElement[];

      const gallery: GalleryItem[] = all.map((im) => ({
        src: im.currentSrc || im.src,
        alt: im.alt || '',
      }));
      const startAt = Math.max(0, all.indexOf(img));
      if (!gallery.length) return;
      openWith(gallery, startAt);
    };

    document.addEventListener('click', onDocClick, true);

    window.__tlImageViewer = { open: openWith, close };

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
      delete window.__tlImageViewer;
      close();
    };
  }, []);

  return null;
}
