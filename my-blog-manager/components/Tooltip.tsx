"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

export default function Tooltip({
  label,
  children,
  side = 'top',
  className = 'inline-flex',
}: {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; place: 'top' | 'bottom' } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setMounted(true), []);

  const show = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;

    const ROOM = 44;
    const roomAbove = rect.top >= ROOM;
    const roomBelow = window.innerHeight - rect.bottom >= ROOM;
    let place: 'top' | 'bottom' = side;
    if (place === 'top' && !roomAbove && roomBelow) place = 'bottom';
    else if (place === 'bottom' && !roomBelow && roomAbove) place = 'top';

    setTip({ x: rect.left + rect.width / 2, y: place === 'top' ? rect.top : rect.bottom, place });
  }, [side]);

  const hide = useCallback(() => setTip(null), []);

  return (
    <span
      ref={anchorRef}
      data-tooltip-anchor
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={className}
    >
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {tip && (
              <motion.span
                data-tooltip
                initial={{ opacity: 0, y: tip.place === 'top' ? 4 : -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: tip.place === 'top' ? 2 : -2, scale: 0.96 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                style={{ left: tip.x, top: tip.y }}
                className="fixed z-[9999] pointer-events-none"
              >
                <span
                  className={`block whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-900/92 dark:bg-slate-100/95 text-white dark:text-slate-900 text-xs font-bold shadow-2xl backdrop-blur-xl ${
                    tip.place === 'top'
                      ? '-translate-x-1/2 -translate-y-[calc(100%+8px)]'
                      : '-translate-x-1/2 translate-y-2'
                  }`}
                >
                  {label}
                </span>
              </motion.span>
            )}
          </AnimatePresence>,
          document.body
        )}
    </span>
  );
}