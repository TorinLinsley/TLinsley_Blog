"use client";

import { useEffect } from 'react';

const CLASS = 'force-unhover';
const STORAGE_KEY = 'xh-force-unhover';

export default function ClickUnhover() {
  useEffect(() => {
    const root = document.documentElement;

    const apply = (on: boolean) => {
      root.classList.toggle(CLASS, on);
      try {
        if (on) localStorage.setItem(STORAGE_KEY, '1');
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
      }
    };

    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') apply(true);
    } catch {
    }

    let lastTouchAt = 0;

    const markTouch = () => {
      lastTouchAt = Date.now();
      apply(true);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') markTouch();
    };

    const onTouchStart = () => markTouch();

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLElement | null;
      if (!anchor) return;

      const pointerType = (event as MouseEvent & { pointerType?: string }).pointerType;
      const byTouch =
        pointerType === 'touch' ||
        pointerType === 'pen' ||
        Date.now() - lastTouchAt < 1000;
      if (!byTouch) return;

      anchor.blur();
      apply(true);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') apply(false);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('click', onClick, true);
    window.addEventListener('pointermove', onPointerMove, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('pointermove', onPointerMove, true);
    };
  }, []);

  return null;
}