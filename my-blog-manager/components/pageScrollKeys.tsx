"use client";

import { useEffect } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';


const KEYS = ['Home', 'End', 'PageUp', 'PageDown'];

function scrollPageFor(key: string) {
  if (key === 'Home') {
    window.scrollTo(0, 0);
  } else if (key === 'End') {
    window.scrollTo(0, document.documentElement.scrollHeight);
  } else {
    const step = Math.round(window.innerHeight * 0.9);
    window.scrollBy(0, key === 'PageDown' ? step : -step);
  }
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

function nearestScrollable(start: HTMLElement | null) {
  let cur: HTMLElement | null = start;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll)/.test(style.overflowY) && cur.scrollHeight > cur.clientHeight + 1) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function pageScrollKeys(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented) return;
  const key = event.key;
  if (!KEYS.includes(key)) return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

  event.preventDefault();
  event.stopPropagation();
  scrollPageFor(key);
}

export default function PageKeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!KEYS.includes(event.key)) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;

      const scroller = nearestScrollable(event.target as HTMLElement | null);
      if (scroller && !scroller.classList.contains('page-scroll-keys')) return;

      event.preventDefault();
      scrollPageFor(event.key);
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return null;
}