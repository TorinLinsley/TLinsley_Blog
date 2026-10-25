"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';


const CONTENT_SELECTOR = '.ProseMirror, .resource-preview, .prose, .chatter-preview, [contenteditable="true"]';

const OWN_TIP_SELECTOR = '[data-tooltip-anchor]';

const SKIP_TAGS = new Set(['HTML', 'HEAD', 'BODY', 'LINK', 'META', 'STYLE', 'SCRIPT', 'TITLE', 'BASE', 'IFRAME', 'AUDIO', 'VIDEO', 'TRACK', 'SOURCE', 'OBJECT', 'EMBED']);

type Tip = { text: string; x: number; y: number; place: 'top' | 'bottom' };

const room = 48;

export default function HoverTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const anchorRef = useRef<Element | null>(null);

  const convertTitles = useCallback(() => {
    const nodes = document.querySelectorAll('[title]');
    nodes.forEach((el) => {
      if (SKIP_TAGS.has(el.tagName)) return;
      if (el.closest(CONTENT_SELECTOR)) return;
      if (el.closest(OWN_TIP_SELECTOR)) return;
      const text = el.getAttribute('title');
      if (!text || !text.trim()) return;
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
      if (!el.hasAttribute('data-tip')) el.setAttribute('data-tip', text);
      el.removeAttribute('title');
    });
  }, []);

  useEffect(() => {
    let raf = 0;
    const run = () => { raf = 0; convertTitles(); };
    const schedule = () => { if (!raf) raf = window.requestAnimationFrame(run); };

    convertTitles();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
    return () => { mo.disconnect(); if (raf) window.cancelAnimationFrame(raf); };
  }, [convertTitles]);

  useEffect(() => {
    const show = (el: Element) => {
      if (el.closest(CONTENT_SELECTOR) || el.closest(OWN_TIP_SELECTOR)) { setTip(null); return; }
      const text = el.getAttribute('data-tip');
      if (!text) { setTip(null); return; }
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) { setTip(null); return; }
      const above = r.top >= room;
      anchorRef.current = el;
      setTip({ text, x: r.left + r.width / 2, y: above ? r.top : r.bottom, place: above ? 'top' : 'bottom' });
    };
    const hide = () => { anchorRef.current = null; setTip(null); };

    const onOver = (e: Event) => {
      const t = e.target as Element | null;
      const el = t?.closest?.('[data-tip]');
      if (!el) { hide(); return; }
      if (el === anchorRef.current && tip) return;
      show(el);
    };
    const onOut = (e: Event) => {
      const related = (e as MouseEvent).relatedTarget as Element | null;
      if (anchorRef.current && related && anchorRef.current.contains(related)) return;
      hide();
    };
    const onFocusIn = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]');
      if (el) show(el); else hide();
    };

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('mousedown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide, true);
    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('mousedown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide, true);
    };
  }, [tip]);

  if (!tip || typeof document === 'undefined') return null;

  return createPortal(
    <span
      data-tooltip
      aria-hidden="true"
      className="fixed z-[9999] pointer-events-none"
      style={{ left: tip.x, top: tip.y }}
    >
      <span
        className={`block rounded-[0.6rem] px-2.5 py-1.5 text-white font-semibold shadow-2xl ${
          tip.place === 'top'
            ? '-translate-x-1/2 -translate-y-[calc(100%+8px)]'
            : '-translate-x-1/2 translate-y-2'
        }`}
        style={{
          background: 'rgba(15, 23, 42, 0.97)',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.35)',
          fontSize: '0.95rem',
          lineHeight: 1.35,
          maxWidth: 'min(78vw, 32rem)',
          textAlign: 'center',
        }}
      >
        {tip.text}
      </span>
    </span>,
    document.body
  );
}