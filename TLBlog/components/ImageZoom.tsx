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
 *   · 切换：**只有默认态（没放大）**才能翻上/下一张 —— 鼠标左右拖 / 手指左右滑；底部按钮也能翻 ✓
 *   · 底部那排：**‹ [1/2] ›** 三件套居中并排在底部，箭头用原来那套 chevron 图标 ✓
 *     （不再压在画面左右两侧 ✗ 手机上会挡住画面）
 *   · 关闭：点图片/按钮以外的**空白处** ✓、Esc ✓、**手机系统返回键** ✓（见下面 pushState 那段）
 *   · 键盘：← → 翻页 ✓
 *
 * 📱 系统返回键：打开预览时往 history 里压一条记录，按返回=退掉这一条 → 关预览、文章页还留着 ✓
 *    以前没这条：返回键把文章页退掉，预览层是自己 append 的 DOM，会孤零零留在最上层 ✗
 *
 * ⚠️ 编辑器正文（.editor-content-area / .ProseMirror）里的图**不接管** —— 那里点图是编辑 ✗
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
/** 底部按钮带高度（图片可用高度要减掉它） */
const BOTTOM_BAR = 72;
/** 图片链接（点开还是图片）才接管点击 */
const IMAGE_HREF = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;

/** 原来那套 chevron 图标（lucide 的 ChevronLeft / ChevronRight 同一条路径） */
const CHEVRON_LEFT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
const CHEVRON_RIGHT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

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
    let bar: HTMLDivElement | null = null;
    let imgEl: HTMLImageElement | null = null;
    let counterEl: HTMLSpanElement | null = null;
    let prevBtn: HTMLButtonElement | null = null;
    let nextBtn: HTMLButtonElement | null = null;
    let prevBodyOverflow = "";
    let prevHtmlOverscroll = "";

    /** 触摸关闭后浏览器补发的 click 要吃掉（否则会立刻又打开底下那张图） */
    let swallowClickUntil = 0;
    /** 是不是"系统返回键"触发的关闭（那种情况不能再 history.back 一次） */
    let closingByHistory = false;

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

    const updateCursor = () => {
      if (!overlay) return;
      overlay.style.cursor = zoom > 1.02 ? 'grab' : 'zoom-out';
    };

    /** 缩放：anchor 是屏幕坐标，缩放时把锚点钉住 */
    const zoomTo = (next: number, anchorX?: number, anchorY?: number) => {
      const target = Math.min(maxZoom, Math.max(1, next));
      if (Math.abs(target - zoom) < 0.0005) return;

      if (anchorX !== undefined && anchorY !== undefined) {
        const k = target / zoom;
        const cx = anchorX - viewW() / 2;
        const cy = anchorY - viewH() / 2;
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
      bar.style.visibility = many ? 'visible' : 'hidden';
      counterEl.textContent = `${index + 1} / ${items.length}`;
    };

    /** 📱 系统返回键 / 浏览器后退 → 只关预览，不动文章页 */
    const onPopState = () => {
      if (!overlay) return;
      closingByHistory = true;
      try { close(); } finally { closingByHistory = false; }
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
      window.removeEventListener('popstate', onPopState);

      // 手动关闭（点空白/Esc/按钮）→ 把刚才压进去的那条历史退掉，不留空记录
      if (!closingByHistory && (history.state as { __tlImageViewer?: boolean } | null)?.__tlImageViewer) {
        history.back();
      }
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

    /** 箭头按钮：沿用原来那套 chevron 图标（不再用文字符号，那个本身就歪 ✗） */
    const makeBtn = (dir: -1 | 1): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', dir < 0 ? '上一张' : '下一张');
      btn.innerHTML = dir < 0 ? CHEVRON_LEFT : CHEVRON_RIGHT;
      btn.style.cssText = [
        'pointer-events:auto',
        'width:42px', 'height:42px', 'flex:0 0 auto',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border-radius:9999px',
        'border:1px solid rgba(255,255,255,0.14)',
        'background:rgba(255,255,255,0.12)',
        'color:#fff',
        'cursor:pointer',
        'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
        'user-select:none', '-webkit-user-select:none',
        '-webkit-tap-highlight-color:transparent',
        'transition:background .16s ease, transform .16s ease',
      ].join(';');
      const light = () => { btn.style.background = 'rgba(255,255,255,0.24)'; };
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
        // 底部留出按钮带：图片按"屏幕高度 - 72"等比铺满并居中，不会被箭头/页码压住 ✓
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

      /* ── 底部：‹ [1/2] › 三件套居中并排 ✓（箭头和页码挨在一起，都在图片外面）── */
      bar = document.createElement('div');
      bar.style.cssText = [
        'position:fixed', 'left:0', 'right:0',
        'bottom:calc(14px + env(safe-area-inset-bottom, 0px))',
        'display:flex', 'align-items:center', 'justify-content:center',
        'gap:10px',
        'pointer-events:none', `z-index:${OVERLAY_Z + 1}`,
      ].join(';');

      prevBtn = makeBtn(-1);
      nextBtn = makeBtn(1);

      counterEl = document.createElement('span');
      counterEl.style.cssText = [
        'pointer-events:none',
        'display:inline-flex', 'align-items:center', 'justify-content:center',
        'min-width:62px', 'height:34px', 'padding:0 14px',
        'border-radius:9999px',
        'background:rgba(255,255,255,0.12)', 'border:1px solid rgba(255,255,255,0.14)',
        'color:rgba(255,255,255,0.92)', 'font-size:12px', 'font-weight:800',
        'letter-spacing:.12em',
        'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
      ].join(';');

      bar.appendChild(prevBtn);
      bar.appendChild(counterEl);
      bar.appendChild(nextBtn);

      overlay.appendChild(imgEl);
      document.body.appendChild(overlay);
      document.body.appendChild(bar);

      // 📱 压一条历史：系统返回键 = 退掉这条 = 关预览（文章页不动）✓
      try {
        if (!(history.state as { __tlImageViewer?: boolean } | null)?.__tlImageViewer) {
          history.pushState({ __tlImageViewer: true }, '');
        }
      } catch {
        /* 某些内置浏览器限制 pushState，退化成没有返回键支持，不影响其它交互 */
      }
      window.addEventListener('popstate', onPopState);

      /* ── 手势 ── */
      type Press = { x: number; y: number; moved: number; startTx: number; startTy: number };
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

        // 放大后 = 拖动画布；默认态 = 松手时判翻页
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

        // ① 默认态左右拖/滑 = 翻页
        if (me && zoom <= 1.02 && items.length > 1) {
          const dx = e.clientX - lastStartX;
          const dy = Math.abs(e.clientY - me.y);
          if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > dy * 1.2) {
            go(dx < 0 ? 1 : -1);
            return;
          }
        }

        // ② 点空白处关闭（点图片、点按钮都不关）
        if (lastMoved < CLICK_SLOP && !lastOnImage) {
          if (e.pointerType !== 'mouse') swallowClickUntil = performance.now() + 500;
          close();
          return;
        }
        updateCursor();
      };

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

      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!overlay) return;
        if (performance.now() - lastPinchAt < 300) return;
        if (e.target === imgEl) return;                       // 点图片本身：不关
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

    // ── 正文图片：事件委托，点哪张就把同容器里所有图收成一组 ──
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
      if (!gallery.length) return;
      openWith(gallery, Math.max(0, all.indexOf(img)));
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
