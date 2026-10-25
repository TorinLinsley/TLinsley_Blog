"use client";

import { useEffect } from "react";


const ZOOM_SELECTOR = '.prose, .resource-preview';
const SKIP_INSIDE = '.editor-content-area, .ProseMirror, [data-no-zoom]';
const MIN_RENDERED = 80;
const CLICK_SLOP = 6;
const SWIPE_RATIO = 0.18;
const SWIPE_VELOCITY = 0.45;
const GAP = 18;
const BOTTOM_BAR = 72;
const TOP_BAR = 72;
const WHEEL_SENSITIVITY = 0.0015;
const PINCH_SENSITIVITY = 0.02;
const OVERLAY_Z = 2147483000;
const HASH = '#tl-image-viewer';
const IMAGE_HREF = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;

const CHEVRON_LEFT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
const CHEVRON_RIGHT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

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

    let dragX = 0;
    let animating = false;

    const natSize = (img: HTMLImageElement | null) => ({
      w: img?.naturalWidth || 1,
      h: img?.naturalHeight || 1,
    });

    const fitFor = (img: HTMLImageElement | null) => {
      const { w, h } = natSize(img);
      if (w <= 1 || h <= 1) return 1;
      return Math.min(1, viewW() / w, viewH() / h);
    };

    const baseSize = () => {
      const { w, h } = natSize(imgCur);
      const fit = fitFor(imgCur);
      return { w: w * fit, h: h * fit };
    };

    const viewW = () => window.innerWidth;
    const slideSpan = () => viewW() + GAP;
    const bandTop = () => {
      const rect = captionEl?.getBoundingClientRect();
      const used = rect && rect.height > 0 ? rect.bottom + 10 : TOP_BAR;
      return Math.max(TOP_BAR, used);
    };
    const viewH = () => Math.max(120, window.innerHeight - bandTop() - BOTTOM_BAR);
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
      imgCur.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${fitFor(imgCur) * zoom})`;
      if (overlay) overlay.style.cursor = zoom > 1.02 ? 'grab' : 'zoom-out';
    };

    const paintTrack = () => {
      if (!track) return;
      track.style.transform = `translate3d(${dragX}px, 0, 0)`;
    };

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

      if (topEl && captionEl) {
        const cap = (items[index]?.alt || '').trim();
        captionEl.textContent = cap;
        topEl.style.display = cap ? 'flex' : 'none';
      }

      const topPx = bandTop();
      [slotPrev, slotCur, slotNext].forEach((slot) => {
        if (slot) slot.style.paddingTop = `${topPx}px`;
      });
    };

    const syncSlots = () => {
      if (!imgPrev || !imgCur || !imgNext) return;
      const at = (offset: number) => items[(index + offset + items.length) % items.length];
      const set = (img: HTMLImageElement, it?: GalleryItem) => {
        if (!it) { img.style.visibility = 'hidden'; return; }
        img.style.visibility = 'visible';
        if (img.getAttribute('src') !== it.src) img.src = it.src;
        img.alt = it.alt || '';

        const applyNatural = () => {
          if (!img.naturalWidth || !img.naturalHeight) return;
          img.style.width = `${img.naturalWidth}px`;
          img.style.height = `${img.naturalHeight}px`;
          if (img === imgCur) paintCurrent();
          else img.style.transform = `scale(${fitFor(img)})`;
        };
        if (img.complete) applyNatural();
        else img.onload = applyNatural;
      };
      set(imgPrev, items.length > 1 ? at(-1) : undefined);
      set(imgCur, items[index]);
      set(imgNext, items.length > 1 ? at(1) : undefined);

      zoom = 1; tx = 0; ty = 0; dragX = 0;
      [imgPrev, imgCur, imgNext].forEach((img) => {
        if (!img) return;
        const s = fitFor(img);
        img.style.transform = img === imgCur ? `translate3d(0,0,0) scale(${s})` : `scale(${s})`;
      });
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
      window.setTimeout(() => { if (animating) done(); }, 340);
      void fromX;
    };

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

    const makeBtn = (dir: -1 | 1): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', dir < 0 ? '上一张' : '下一张');
      btn.innerHTML = dir < 0 ? CHEVRON_LEFT : CHEVRON_RIGHT;
      btn.style.cssText = [
        'pointer-events:auto',
        'width:34px', 'height:34px', 'padding:0',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border-radius:9999px',
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
        `padding-top:${TOP_BAR}px`, `padding-bottom:${BOTTOM_BAR}px`,
        'box-sizing:border-box',
        'will-change:transform',
      ].join(';');
      const im = document.createElement('img');
      im.draggable = false;
      im.style.cssText = [
        'max-width:none', 'max-height:none', 'display:block',
        'width:0', 'height:0',
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

      slotPrev.style.transform = `translate3d(${-(viewW() + GAP)}px, 0, 0)`;
      slotNext.style.transform = `translate3d(${viewW() + GAP}px, 0, 0)`;

      track.appendChild(slotPrev);
      track.appendChild(slotCur);
      track.appendChild(slotNext);
      stage.appendChild(track);
      overlay.appendChild(stage);

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
        'background:rgba(0,0,0,0.55)', 'border:1px solid rgba(255,255,255,0.32)',
        'color:#ffffff', 'font-size:12px', 'font-weight:800',
        'letter-spacing:.12em',
        'box-shadow:0 4px 18px rgba(0,0,0,0.45)',
        'backdrop-filter:blur(10px)', '-webkit-backdrop-filter:blur(10px)',
      ].join(';');

      bar.appendChild(makeBtn(-1));
      bar.appendChild(counterEl);
      bar.appendChild(makeBtn(1));

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

      try {
        if (location.hash !== HASH) {
          history.pushState({ __tlImageViewer: true }, '', `${location.pathname}${location.search}${HASH}`);
        }
      } catch {  }
      window.addEventListener('popstate', onHistoryBack);
      window.addEventListener('hashchange', onHistoryBack);

      type Press = { x: number; y: number; moved: number; lastX: number; lastT: number; vx: number; startTx: number; startTy: number };
      const presses = new Map<number, Press>();
      let pinchStartDist = 0;
      let pinchStartZoom = 1;
      let lastPinchAt = 0;
      let startX = 0;

      const onPointerDown = (e: PointerEvent) => {
        if (!overlay) return;
        if (e.pointerType === 'mouse') { try { overlay.setPointerCapture(e.pointerId); } catch {  } }
        presses.set(e.pointerId, {
          x: e.clientX, y: e.clientY, moved: 0,
          lastX: e.clientX, lastT: performance.now(), vx: 0,
          startTx: tx, startTy: ty,
        });
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

        if (zoom > 1.02) {
          tx = me.startTx + (e.clientX - me.x);
          ty = me.startTy + (e.clientY - me.y);
          paintCurrent();
          return;
        }

        if (items.length < 2 || animating) return;
        const now = performance.now();
        const dt = Math.max(1, now - me.lastT);
        me.vx = (e.clientX - me.lastX) / dt;
        me.lastX = e.clientX;
        me.lastT = now;

        let dx = e.clientX - startX;
        const atStart = index === 0;
        const atEnd = index === items.length - 1;
        if ((dx > 0 && atStart) || (dx < 0 && atEnd)) dx *= 0.32;
        dragX = dx;
        paintTrack();
      };

      const onPointerUp = (e: PointerEvent) => {
        if (!overlay) return;
        if (e.type === 'pointercancel') { presses.delete(e.pointerId); return; }
        const me = presses.get(e.pointerId);
        presses.delete(e.pointerId);
        const moved = me ? me.moved : 0;
        const velocity = me ? me.vx : 0;

        const justPinched = performance.now() - lastPinchAt < 300;
        if (justPinched) return;

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

        if (moved < CLICK_SLOP) {
          swallowClickUntil = performance.now() + 500;
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
        [imgPrev, imgNext].forEach((img) => {
          if (img && img.naturalWidth) img.style.transform = `scale(${fitFor(img)})`;
        });
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