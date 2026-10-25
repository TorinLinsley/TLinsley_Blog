"use client";


type Layer = {
  panel: () => HTMLElement | null;
  controls?: () => HTMLElement | null;
  close: () => void;
};

const layers: Layer[] = [];
let installed = false;

let lastCloseAt = 0;
const CLICK_GUARD_MS = 400;

let blockTocUntil = 0;
const TOC_BLOCK_MS = 450;

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]';

let downTarget: HTMLElement | null = null;
let downOnBlank = false;
let downAt = 0;
const BLANK_CLICK_MS = 5000;

function insideLayerChrome(target: HTMLElement) {
  return layers.some((l) => {
    const panel = l.panel();
    if (panel && panel.contains(target)) return true;
    const controls = l.controls?.();
    return !!(controls && controls.contains(target));
  });
}

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
  if (!top || !target) return;

  if (performance.now() < blockTocUntil && target.closest('[data-toc-level]')) {
    event.stopPropagation();
    return;
  }

  if (insideLayerChrome(target)) return;

  if (target.closest(INTERACTIVE)) return;

  event.stopPropagation();
  downOnBlank = true;
  const now = performance.now();
  lastCloseAt = now;
  blockTocUntil = now + TOC_BLOCK_MS;
  top.close();
}

function onClickCapture(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  if (performance.now() < blockTocUntil && target.closest('[data-toc-level]')) {
    event.stopPropagation();
    event.preventDefault();
    return;
  }

  if (downOnBlank) {
    downOnBlank = false;
    if (performance.now() - downAt > BLANK_CLICK_MS) {
    } else if (!downTarget || !sameSpot(downTarget, target)) {
      event.stopPropagation();
      event.preventDefault();
      return;
    }
  }

  if (!lastCloseAt || performance.now() - lastCloseAt > CLICK_GUARD_MS) return;
  if (insideLayerChrome(target)) return;
  if (target.closest(INTERACTIVE)) return;
  event.stopPropagation();
  event.preventDefault();
}

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

export function registerLayer(layer: Layer) {
  install();
  layers.push(layer);
  return () => {
    const i = layers.indexOf(layer);
    if (i >= 0) layers.splice(i, 1);
  };
}