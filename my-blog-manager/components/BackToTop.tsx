"use client";

import { useEffect, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';


const SHOW_AFTER = 240;

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const innerScrollerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const pageTop = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

    const onScroll = (event: Event) => {
      let innerTop = 0;
      const target = event.target;
      if (target instanceof HTMLElement) {
        innerTop = target.scrollTop;
        innerScrollerRef.current = target;
      }
      setVisible(Math.max(pageTop(), innerTop) > SHOW_AFTER);
    };

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    onScroll(new Event('scroll'));

    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="返回顶部"
      data-back-to-top
      onClick={() => {
        if (innerScrollerRef.current) innerScrollerRef.current.scrollTop = 0;
        window.scrollTo(0, 0);
        setVisible(false);
      }}
      className="lg:hidden fixed right-3 bottom-[10vh] z-40 w-9 h-9 flex items-center justify-center rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg text-black dark:text-white cursor-pointer"
    >
      <ChevronUp className="w-5 h-5" strokeWidth={2.5} aria-hidden />
    </button>
  );
}