"use client";

import { useEffect } from "react";

/**
 * 🔍 统一的图片浏览器（用户 2026-10-23 要求）
 *
 * 全站所有"点开看大图"的地方都走这一个组件，交互完全一致：
 *   · 默认态 = 等比铺满屏幕（这就是最小态，不能再缩小）
 *   · 缩放：电脑滚轮 / 触控板捏合；手机双指捏合 → **只作用于图片**，不缩放网页
 *   · 放大后：拖动 = 移动画面看细节
 *   · 翻页（**仅默认态**）：
 *       · 拖动/滑动 → **跟手轮播**：拖到哪就显示到哪，左右两张图前后衔接（中间留 18px 间距），
 *         松手按位移 + 甩动速度决定翻页或回弹，带非线性缓动（不是瞬间切换 ✓）
 *       · 底部 ‹ [1/2] › 按钮、键盘 ← → → **瞬间切换**（这是刻意保留的快速通道）
 *   · 关闭：点图片/按钮以外的空白处、Esc、**手机系统返回键**（hash 历史，页面不动）
 *
 * 📱 返回键：安卓上纯 pushState 会被各家 WebView/Edge 吃掉，所以这里压的是 **URL hash**：
 *    后退 = 去掉 hash → 触发 popstate / hashchange → 我们只关预览 ✓ 文章页不动 ✓
 *
 * ⚠️ 编辑器正文（.editor-content-area / .ProseMirror）里的图不接管 —— 那里点图是编辑 ✗
 */

const ZOOM_SELECTOR = '.prose, .resource-preview';
const SKIP_INSIDE = '.editor-content-area, .ProseMirror, [data-no-zoom]';
const MIN_RENDERED = 80;
const CLICK_SLOP = 6;
/** 松手时：位移超过屏幕宽度的这个比例就翻页 */
const SWIPE_RATIO = 0.18;
/** 或者甩动速度超过这个值（px/ms）也翻页 */
const SWIPE_VELOCITY = 0.45;
/** 两张图之间的间距 */
const GAP = 18;
/** 底部按钮带高度（图片可用高度要减掉它） */
const BOTTOM_BAR = 72;
/** 🏷️ 顶部描述带高度（用户要求：默认画面不能顶到顶部文字上，两行都是"虚空"区域） */
const TOP_BAR = 72;
const WHEEL_SENSITIVITY = 0.0015;
const PINCH_SENSITIVITY = 0.02;
const OVERLAY_Z = 2147483000;
const HASH = '#tl-image-viewer';
const IMAGE_HREF = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;

/** 原来那套 chevron 图标（lucide 的 ChevronLeft / ChevronRight 同一条路径） */
const CHEVRON_LEFT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
const CHEVRON_RIGHT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

/** 松手的缓动：先快后慢（非线性 ✓） */
const EASE_SNAP = 'cubic-bezier(.22,.61,.36,1)';

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
    let stage: HTMLDivElement | null = null;
    let track: HTMLDivElement | null = null;
    let bar: HTMLDivElement | null = null;
    let topEl: HTMLDivElement | null = null;
    let captionEl: HTMLSpanElement | null = null;
    let counterEl: HTMLSpanElement | null = null;

    let slotPrev: HTMLDivElement | null = null;
    let slotCur: HTMLDivElement | null = null;
    let slotNext: HTMLDivElement | null = null;
    let imgPrev: HTMLImageElement | null = null;
    let imgCur: HTMLImageElement | null = null;
    let imgNext: HTMLImageElement | null = null;

    let prevBodyOverflow = "";
    let prevHtmlOverscroll = "";
    let swallowClickUntil = 0;
    let closingByHistory = false;

    let items: GalleryItem[] = [];
    let index = 0;

    let zoom = 1;
    let tx = 0;
    let ty = 0;

    /** 拖动中的位移（track 的 translateX） */
    let dragX = 0;
    /** 是否正在动画（这时别再改 transform） */
    let animating = false;

    const baseSize = () => ({
      w: imgCur?.offsetWidth || 1,
      h: imgCur?.offsetHeight || 1,
    });

    const viewW = () => window.innerWidth;
    const slideSpan = () => viewW() + GAP;
    /**
     * 中间"纯图片"区域的上边界：**动态**取顶部那行文字实际占到的底边 + 10px
     * （描述可能换行、iPhone 还有刘海安全区，写死一个数会盖到文字上 ✗）
     */
    const bandTop = () => {
      const rect = captionEl?.getBoundingClientRect();
      const used = rect && rect.height > 0 ? rect.bottom + 10 : TOP_BAR;
      return Math.max(TOP_BAR, used);
    };
    /** 中间区域高度：上下两条带都扣掉 ✓ */
    const viewH = () => Math.max(120, window.innerHeight - bandTop() - BOTTOM_BAR);
    /** 中间区域的垂直中心（缩放锚点用） */
    const bandCenterY = () => bandTop() + viewH() / 2;

    const clampPan = () => {
      const { w, h } = baseSize();
      const maxX = Math.max(0, (w * zoom - viewW()) / 2);
      const maxY = Math.max(0, (h * zoom - viewH()) / 2);
      tx = Math.min(maxX, Math.max(-maxX, tx));
      ty = Math.min(maxY, Math.max(-maxY, ty));
    };

    const paintCurrent = () => {
      if (!imgCur) return;
      clampPan();
      imgCur.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${zoom})`;
      if (overlay) overlay.style.cursor = zoom > 1.02 ? 'grab' : 'zoom-out';
    };

    const paintTrack = () => {
      if (!track) return;
      track.style.transform = `translate3d(${dragX}px, 0, 0)`;
    };

    /** 缩放：anchor 是屏幕坐标，缩放时把锚点钉住 */
    const zoomTo = (next: number, anchorX?: number, anchorY?: number) => {
      const target = Math.min(6, Math.max(1, next));
      if (Math.abs(target - zoom) < 0.0005) return;

      if (anchorX !== undefined && anchorY !== undefined) {
        const k = target / zoom;
        const cx = anchorX - viewW() / 2;
        const cy = anchorY - bandCenterY();
        tx = cx - k * (cx - tx);
        ty = cy - k * (cy - ty);
      } else {
        tx *= target / zoom;
        ty *= target / zoom;
      }

      zoom = target;
      if (zoom <= 1.0001) { tx = 0; ty = 0; }
      paintCurrent();
    };

    const updateChrome = () => {
      if (!counterEl || !bar) return;
      const many = items.length > 1;
      bar.style.visibility = many ? 'visible' : 'hidden';
      counterEl.textContent = `${index + 1} / ${items.length}`;

      /* 📝 图片描述（alt / 标题）放在**屏幕顶部**（用户 2026-10-23 要求）：
         照片墙那边原来把描述放在底部，和按钮挤在一起；现在统一到顶部居中显示 ✓ 空就不显示 ✓ */
      if (topEl && captionEl) {
        const cap = (items[index]?.alt || '').trim();
        captionEl.textContent = cap;
        topEl.style.display = cap ? 'flex' : 'none';
      }

      // 让三张幻灯片都从"顶部文字的下边界"开始，图片就不会顶到文字上 ✓
      const topPx = bandTop();
      [slotPrev, slotCur, slotNext].forEach((slot) => {
        if (slot) slot.style.paddingTop = `${topPx}px`;
      });
    };

    /** 把 prev / cur / next 三张图摆好（默认态、无缩放） */
    const syncSlots = () => {
      if (!imgPrev || !imgCur || !imgNext) return;
      const at = (offset: number) => items[(index + offset + items.length) % items.length];
      const set = (img: HTMLImageElement, it?: GalleryItem) => {
        if (!it) { img.style.visibility = 'hidden'; return; }
        img.style.visibility = 'visible';
        if (img.getAttribute('src') !== it.src) img.src = it.src;
        img.alt = it.alt || '';
      };
      set(imgPrev, items.length > 1 ? at(-1) : undefined);
      set(imgCur, items[index]);
      set(imgNext, items.length > 1 ? at(1) : undefined);

      zoom = 1; tx = 0; ty = 0; dragX = 0;
      if (imgCur) imgCur.style.transform = 'translate3d(0,0,0) scale(1)';
      if (track) {
        track.style.transition = 'none';
        paintTrack();
      }
      updateChrome();
    };

    const close = () => {
      if (!overlay && !bar) return;
      overlay?.remove();
      bar?.remove();
      topEl?.remove();
      overlay = null;
      bar = null;
      topEl = null;
      captionEl = null;
      stage = null;
      track = null;
      imgPrev = imgCur = imgNext = null;
      slotPrev = slotCur = slotNext = null;
      counterEl = null;
      items = [];
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      window.removeEventListener('resize', paintCurrent);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('popstate', onHistoryBack);
      window.removeEventListener('hashchange', onHistoryBack);

      if (!closingByHistory && location.hash === HASH) {
        history.back();
      }
    };

    /** 系统返回键 / 浏览器后退 / 点 hash → 只关预览 */
    function onHistoryBack() {
      if (!overlay) return;
      closingByHistory = true;
      try { close(); } finally { closingByHistory = false; }
    }

    const goInstant = (delta: number) => {
      if (items.length < 2 || animating) return;
      index = (index + delta + items.length) % items.length;
      syncSlots();
    };

    /** 拖到头：动画滑过去 → 切换 → 复位 */
    const finishSwipe = (dir: -1 | 1, fromX: number) => {
      if (!track) return;
      animating = true;
      track.style.transition = `transform 280ms ${EASE_SNAP}`;
      track.style.transform = `translate3d(${dir > 0 ? -slideSpan() : slideSpan()}px, 0, 0)`;

      const done = () => {
        track?.removeEventListener('transitionend', done);
        animating = false;
        index = (index + dir + items.length) % items.length;
        syncSlots();
      };
      track.addEventListener('transitionend', done, { once: true });
      // 兜底：某些浏览器没有 transitionend
      window.setTimeout(() => { if (animating) done(); }, 340);
      void fromX;
    };

    /** 回弹到原位 */
    const springBack = () => {
      if (!track) return;
      animating = true;
      track.style.transition = `transform 240ms ${EASE_SNAP}`;
      track.style.transform = 'translate3d(0,0,0)';
      const done = () => {
        track?.removeEventListener('transitionend', done);
        animating = false;
        dragX = 0;
      };
      track.addEventListener('transitionend', done, { once: true });
      window.setTimeout(() => { if (animating) done(); }, 300);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!overlay) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); goInstant(-1); return; }
      if (e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); goInstant(1); }
    };

    /** 按钮：和页码同尺寸（高 34px 的胶囊），图标 18px */
    const makeBtn = (dir: -1 | 1): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', dir < 0 ? '上一张' : '下一张');
      btn.innerHTML = dir < 0 ? CHEVRON_LEFT : CHEVRON_RIGHT;
      btn.style.cssText = [
        'pointer-events:auto',
        // 圆形，直径和页码胶囊的**高度**一致（都是 34px）—— 只是等高，不拉长 ✓
        'width:34px', 'height:34px', 'padding:0',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border-radius:9999px',
        // 🎨 深底 + 白图标 + 亮描边 + 投影：铺满深色/浅色画面时都看得见（用户反馈：原来透明底在深色图上找不到）
        'border:1px solid rgba(255,255,255,0.32)',
        'background:rgba(0,0,0,0.55)',
        'color:#fff',
        'box-shadow:0 4px 18px rgba(0,0,0,0.45)',
        'cursor:pointer',
        'backdrop-filter:blur(10px)', '-webkit-backdrop-filter:blur(10px)',
        'user-select:none', '-webkit-user-select:none',
        '-webkit-tap-highlight-color:transparent',
        'transition:background .16s ease',
      ].join(';');
      btn.addEventListener('pointerenter', () => { btn.style.background = 'rgba(0,0,0,0.72)'; });
      btn.addEventListener('pointerleave', () => { btn.style.background = 'rgba(0,0,0,0.55)'; });
      btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        goInstant(dir);
      });
      return btn;
    };

    const makeSlot = () => {
      const slot = document.createElement('div');
      slot.style.cssText = [
        'position:absolute', 'inset:0',
        'display:flex', 'align-items:center', 'justify-content:center',
        // 上下两条带都留空：默认等比例显示时，图片只会落在中间那块区域 ✓
        `padding-top:${TOP_BAR}px`, `padding-bottom:${BOTTOM_BAR}px`,
        'box-sizing:border-box',
        'will-change:transform',
      ].join(';');
      const im = document.createElement('img');
      im.draggable = false;
      im.style.cssText = [
        'max-width:100%', 'max-height:100%', 'object-fit:contain',
        'pointer-events:auto',
        'user-select:none', '-webkit-user-select:none',
        '-webkit-user-drag:none', '-webkit-touch-callout:none',
        'box-shadow:0 20px 60px rgba(0,0,0,0.45)',
        'border-radius:2px',
        'transform-origin:center center',
      ].join(';');
      slot.appendChild(im);
      return { slot, im };
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
        'overflow:hidden',
        'touch-action:none',
        'overscroll-behavior:contain',
        'cursor:zoom-out',
        'user-select:none', '-webkit-user-select:none',
        '-webkit-touch-callout:none',
        '-webkit-tap-highlight-color:transparent',
        'animation:imageZoomFade .16s ease-out',
      ].join(';');

      stage = document.createElement('div');
      stage.style.cssText = 'position:absolute;inset:0;overflow:hidden;';

      track = document.createElement('div');
      track.style.cssText = 'position:absolute;inset:0;will-change:transform;';

      const a = makeSlot();
      const b = makeSlot();
      const c = makeSlot();
      slotPrev = a.slot; imgPrev = a.im;
      slotCur = b.slot; imgCur = b.im;
      slotNext = c.slot; imgNext = c.im;

      // 左右两张摆在两侧（间距 GAP）
      slotPrev.style.transform = `translate3d(${-(viewW() + GAP)}px, 0, 0)`;
      slotNext.style.transform = `translate3d(${viewW() + GAP}px, 0, 0)`;

      track.appendChild(slotPrev);
      track.appendChild(slotCur);
      track.appendChild(slotNext);
      stage.appendChild(track);
      overlay.appendChild(stage);

      /* 底部：‹ [1/2] › 居中并排，三个都是 34px 高的胶囊，视觉一致 ✓ */
      bar = document.createElement('div');
      bar.style.cssText = [
        'position:fixed', 'left:0', 'right:0',
        'bottom:calc(14px + env(safe-area-inset-bottom, 0px))',
        'display:flex', 'align-items:center', 'justify-content:center',
        'gap:10px', 'pointer-events:none', `z-index:${OVERLAY_Z + 1}`,
      ].join(';');

      counterEl = document.createElement('span');
      counterEl.style.cssText = [
        'pointer-events:none',
        'display:inline-flex', 'align-items:center', 'justify-content:center',
        'min-width:54px', 'height:34px', 'padding:0 14px',
        'border-radius:9999px',
        // 和箭头同一套深色胶囊：任何底色上都清楚 ✓
        'background:rgba(0,0,0,0.55)', 'border:1px solid rgba(255,255,255,0.32)',
        'color:#ffffff', 'font-size:12px', 'font-weight:800',
        'letter-spacing:.12em',
        'box-shadow:0 4px 18px rgba(0,0,0,0.45)',
        'backdrop-filter:blur(10px)', '-webkit-backdrop-filter:blur(10px)',
      ].join(';');

      bar.appendChild(makeBtn(-1));
      bar.appendChild(counterEl);
      bar.appendChild(makeBtn(1));

      /* 📝 顶部：图片描述（照片墙的标题就显示在这） */
      topEl = document.createElement('div');
      topEl.style.cssText = [
        'position:fixed', 'left:0', 'right:0',
        'top:calc(14px + env(safe-area-inset-top, 0px))',
        'display:none', 'align-items:center', 'justify-content:center',
        'padding:0 16px', 'pointer-events:none', `z-index:${OVERLAY_Z + 1}`,
      ].join(';');

      captionEl = document.createElement('span');
      captionEl.style.cssText = [
        'max-width:min(90vw, 760px)',
        'display:inline-block',
        'padding:7px 16px', 'border-radius:9999px',
        'background:rgba(0,0,0,0.55)', 'border:1px solid rgba(255,255,255,0.28)',
        'color:#ffffff', 'font-size:13px', 'font-weight:700', 'line-height:1.35',
        'text-align:center', 'word-break:break-word',
        'box-shadow:0 4px 18px rgba(0,0,0,0.45)',
        'backdrop-filter:blur(10px)', '-webkit-backdrop-filter:blur(10px)',
      ].join(';');
      topEl.appendChild(captionEl);

      document.body.appendChild(overlay);
      document.body.appendChild(topEl);
      document.body.appendChild(bar);

      /* 📱 压 hash 历史：安卓 Edge/各家 WebView 上纯 pushState 会被吃掉，hash 这条最稳 ✓ */
      try {
        if (location.hash !== HASH) {
          history.pushState({ __tlImageViewer: true }, '', `${location.pathname}${location.search}${HASH}`);
        }
      } catch { /* 忽略 */ }
      window.addEventListener('popstate', onHistoryBack);
      window.addEventListener('hashchange', onHistoryBack);

      /* ── 手势 ── */
      type Press = { x: number; y: number; moved: number; lastX: number; lastT: number; vx: number; startTx: number; startTy: number };
      const presses = new Map<number, Press>();
      let pinchStartDist = 0;
      let pinchStartZoom = 1;
      let lastPinchAt = 0;
      let lastOnImage = false;
      let startX = 0;

      const onPointerDown = (e: PointerEvent) => {
        if (!overlay) return;
        if (e.pointerType === 'mouse') { try { overlay.setPointerCapture(e.pointerId); } catch { /* 忽略 */ } }
        presses.set(e.pointerId, {
          x: e.clientX, y: e.clientY, moved: 0,
          lastX: e.clientX, lastT: performance.now(), vx: 0,
          startTx: tx, startTy: ty,
        });
        lastOnImage = e.target === imgCur;
        startX = e.clientX;

        if (presses.size === 2) {
          const [p, q] = [...presses.values()];
          pinchStartDist = Math.hypot(p.x - q.x, p.y - q.y) || 1;
          pinchStartZoom = zoom;
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        const me = presses.get(e.pointerId);
        if (!overlay || !me) return;
        me.moved = Math.max(me.moved, Math.hypot(e.clientX - me.x, e.clientY - me.y));

        const active = [...presses.values()];
        if (active.length >= 2) {
          const [p, q] = active;
          const dist = Math.hypot(p.x - q.x, p.y - q.y) || 1;
          me.x = e.clientX;
          me.y = e.clientY;
          if (Math.abs(dist - pinchStartDist) > 2) {
            lastPinchAt = performance.now();
            zoomTo(pinchStartZoom * (dist / pinchStartDist), (p.x + q.x) / 2, (p.y + q.y) / 2);
          }
          return;
        }

        // 放大后：拖动画布
        if (zoom > 1.02) {
          tx = me.startTx + (e.clientX - me.x);
          ty = me.startTy + (e.clientY - me.y);
          paintCurrent();
          return;
        }

        // 默认态：跟手轮播（两头加阻尼）
        if (items.length < 2 || animating) return;
        const now = performance.now();
        const dt = Math.max(1, now - me.lastT);
        me.vx = (e.clientX - me.lastX) / dt;
        me.lastX = e.clientX;
        me.lastT = now;

        let dx = e.clientX - startX;
        const atStart = index === 0;
        const atEnd = index === items.length - 1;
        if ((dx > 0 && atStart) || (dx < 0 && atEnd)) dx *= 0.32;   // 阻尼，拖不出去
        dragX = dx;
        paintTrack();
      };

      const onPointerUp = (e: PointerEvent) => {
        if (!overlay) return;
        const me = presses.get(e.pointerId);
        presses.delete(e.pointerId);
        const moved = me ? me.moved : 0;
        const velocity = me ? me.vx : 0;

        const justPinched = performance.now() - lastPinchAt < 300;
        if (justPinched) return;

        // ① 默认态拖动结束 → 翻页 or 回弹（不是瞬间切换 ✓）
        if (me && zoom <= 1.02 && items.length > 1 && Math.abs(dragX) > 0) {
          const dx = dragX;
          const far = Math.abs(dx) > viewW() * SWIPE_RATIO;
          const fast = Math.abs(velocity) > SWIPE_VELOCITY;
          const left = dx < 0;

          if (far || fast) {
            const dir: -1 | 1 = left ? 1 : -1;
            const canGo = left ? index < items.length - 1 : index > 0;
            if (!canGo) { springBack(); return; }
            finishSwipe(dir, dx);
            return;
          }
          springBack();
          return;
        }

        // ② 点空白处关闭 —— **放大状态下也关** ✓（只有点在图片上或按钮上才不关）
        if (moved < CLICK_SLOP && !lastOnImage) {
          if (e.pointerType !== 'mouse') swallowClickUntil = performance.now() + 500;
          close();
        }
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
        if (e.target === imgCur) return;
        if ((e.target as HTMLElement)?.closest('button')) return;
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
      overlay.addEventListener('gesturestart', swallow as EventListener);
      overlay.addEventListener('gesturechange', swallow as EventListener);
      overlay.addEventListener('gestureend', swallow as EventListener);

      window.addEventListener('resize', () => {
        if (!slotPrev || !slotNext) return;
        slotPrev.style.transform = `translate3d(${-(viewW() + GAP)}px, 0, 0)`;
        slotNext.style.transform = `translate3d(${viewW() + GAP}px, 0, 0)`;
        paintCurrent();
      });
      window.addEventListener('keydown', onKeyDown, true);
    };

    const openWith = (list: GalleryItem[], startIndex = 0) => {
      const filtered = (list || []).filter((it) => it && it.src);
      if (!filtered.length) return;
      if (overlay) close();
      items = filtered;
      index = Math.min(Math.max(0, startIndex), filtered.length - 1);
      build();
      syncSlots();
    };

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
