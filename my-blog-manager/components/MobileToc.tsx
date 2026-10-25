"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ResourceToc from './resources/ResourceToc';
import { TocBars } from './MorphIcons';
import { registerLayer } from './layerStack';


const NAV_H = '3.25rem';
const TOOL_ROW_H = '2.75rem';

function TocIcon({ open }: { open: boolean }) {
  return <TocBars open={open} />;
}

export default function MobileToc({ contentKey }: { contentKey: string }) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return registerLayer({
      panel: () => drawerRef.current,
      close: () => setOpen(false),
    });
  }, [open]);

  return (
    <>
      <div
        data-toc-toolbar
        className="lg:hidden fixed left-0 right-0 z-40 flex items-center justify-end px-3"
        style={{ top: NAV_H, height: TOOL_ROW_H }}
      >
        <button
          type="button"
          data-toc-toggle
          ref={buttonRef}
          aria-label={open ? '收起大纲' : '展开大纲'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg"
        >
          <TocIcon open={open} />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {open && (
          <>
            {
}
            <motion.div
              key="m-toc-mask"
              data-toc-mask
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, pointerEvents: 'none' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="lg:hidden fixed left-0 right-0 bottom-0 z-[45] bg-slate-900/50 dark:bg-black/65 backdrop-blur-[2px]"
              style={{ top: NAV_H }}
            />

            <motion.aside
              key="m-toc-drawer"
              data-toc-drawer
              ref={drawerRef}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%', pointerEvents: 'none' }}
              transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.6 }}
              className="lg:hidden fixed right-0 bottom-0 z-50 w-[77.9%] max-w-[323px] flex flex-col bg-white/90 dark:bg-slate-900/95 backdrop-blur-2xl shadow-2xl border-l border-white/40 dark:border-white/10"
              style={{ top: NAV_H }}
            >
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <ResourceToc contentId="article-content" contentKey={contentKey} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}