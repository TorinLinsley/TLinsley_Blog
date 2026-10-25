"use client";

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

export type HoverTipState = { text: string; x: number; y: number } | null;

export default function HoverTip({ tip }: { tip: HoverTipState }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const maxLeft = typeof window !== 'undefined' ? window.innerWidth - 340 : 1200;

  return createPortal(
    <AnimatePresence>
      {tip && (
        <motion.div
          key="resource-hover-tip"
          data-hover-tip
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.1, ease: 'easeOut' }}
          style={{ left: Math.max(8, Math.min(tip.x, maxLeft)), top: tip.y }}
          className="fixed z-[500] max-w-[420px] px-3 py-1.5 rounded-xl bg-slate-900/92 dark:bg-slate-100/95 text-white dark:text-slate-900 text-sm font-bold shadow-2xl backdrop-blur-xl pointer-events-none break-words"
        >
          {tip.text}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}