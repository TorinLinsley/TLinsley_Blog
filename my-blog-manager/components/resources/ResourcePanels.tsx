"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { registerLayer } from '../layerStack';
import { FolderLines, TocBars } from '../MorphIcons';

const NAV_H = '3.25rem';

const TOOL_ROW_H = '3rem';

let drawerMemory: null | 'left' | 'right' = null;

function PanelIcon({ which, open }: { which: 'left' | 'right'; open: boolean }) {
  return which === 'left' ? <FolderLines open={open} /> : <TocBars open={open} />;
}

export default function ResourcePanels({
  left,
  right,
  children,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [panel, setPanelState] = useState<null | 'left' | 'right'>(() =>
    pathname === '/resources' ? null : drawerMemory
  );

  const skipEntranceRef = useRef(pathname !== '/resources' && drawerMemory !== null);
  useEffect(() => {
    skipEntranceRef.current = false;
  }, []);

  const setPanel = (next: null | 'left' | 'right' | ((prev: null | 'left' | 'right') => null | 'left' | 'right')) => {
    const value = typeof next === 'function' ? next(drawerMemory) : next;
    drawerMemory = value;
    setPanelState(value);
  };

  useEffect(() => {
    if (pathname === '/resources') {
      drawerMemory = null;
      setPanelState(null);
    }
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = panel ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [panel]);

  const drawerRef = useRef<HTMLElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!panel) return;
    return registerLayer({
      panel: () => drawerRef.current,
      close: () => setPanel(null),
    });
  }, [panel]);

  return (
    <>
      <style>{`
        @media (max-width: 1023.98px) {
          
          html, body { overflow: hidden !important; }

          [data-res-page] {
            min-height: 100dvh !important;
            padding-bottom: 0 !important;
          }

          .res-main {
            margin-top: calc(${NAV_H} + ${TOOL_ROW_H} + 0.75rem) !important;
            height: calc(100vh - ${NAV_H} - ${TOOL_ROW_H} - 0.75rem - 1.5rem) !important;
            height: calc(100dvh - ${NAV_H} - ${TOOL_ROW_H} - 0.75rem - 1.5rem) !important;
            margin-bottom: 1.5rem !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          
          [data-res-drawer] { font-size: 0.92rem; }
          [data-res-drawer] .text-base { font-size: 0.92rem; }
          [data-res-drawer] .text-\\[15px\\] { font-size: 0.86rem; }
        }

        
        @media (min-width: 1536px) {
          .res-main {
            padding-left: 224px !important;
            padding-right: 224px !important;
          }
        }
        @media (min-width: 1280px) and (max-width: 1535.98px) {
          .res-main {
            padding-left: 96px !important;
            padding-right: 96px !important;
          }
        }
      `}</style>

      
      <div
        data-res-toolbar
        ref={toolbarRef}
        className="lg:hidden fixed left-0 right-0 z-[46] flex items-center justify-between px-3"
        style={{ top: NAV_H, height: TOOL_ROW_H }}
      >
        <button
          type="button"
          data-res-toggle="left"
          aria-label={panel === 'left' ? '收起资源列表' : '展开资源列表'}
          onClick={() => setPanel((p) => (p === 'left' ? null : 'left'))}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg"
        >
          <PanelIcon which="left" open={panel === 'left'} />
        </button>
        <button
          type="button"
          data-res-toggle="right"
          aria-label={panel === 'right' ? '收起大纲' : '展开大纲'}
          onClick={() => setPanel((p) => (p === 'right' ? null : 'right'))}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg"
        >
          <PanelIcon which="right" open={panel === 'right'} />
        </button>
      </div>

      <main
        className="res-main w-full flex flex-row z-10 relative overflow-x-auto"
        style={{
          marginTop: '112px',
          height: 'calc(100vh - 112px - 32px)',
          marginBottom: '32px',
          gap: '6px',
          paddingLeft: 14,
          paddingRight: 14,
        }}
      >
        
        <section
          className="hidden lg:flex shrink-0 bg-slate-200/50 dark:bg-slate-900/55 backdrop-blur-[60px] shadow-2xl border border-white/30 dark:border-white/10 overflow-hidden transition-all duration-700 flex-col"
          style={{ width: 'clamp(240px, calc((100vw - 28px) * 0.21), 420px)', borderRadius: '15px' }}
        >
          {left}
        </section>

        <section
          className="flex-1 bg-slate-200/50 dark:bg-slate-900/55 backdrop-blur-[60px] shadow-2xl border border-white/30 dark:border-white/10 overflow-hidden transition-all duration-700 flex flex-col relative"
          style={{ borderRadius: '15px', minWidth: 300 }}
        >
          {children}
        </section>

        <section
          className="hidden lg:flex shrink-0 bg-slate-200/50 dark:bg-slate-900/55 backdrop-blur-[60px] shadow-2xl border border-white/30 dark:border-white/10 overflow-hidden transition-all duration-700 flex-col"
          style={{ width: 'clamp(260px, calc((100vw - 28px) * 0.23), 460px)', borderRadius: '15px' }}
        >
          {right}
        </section>
      </main>

      <AnimatePresence>
        {panel && (
          <>
            
            <motion.div
              key="res-mask"
              data-res-mask
              onClick={() => setPanel(null)}
              initial={skipEntranceRef.current ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, pointerEvents: 'none' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="lg:hidden fixed left-0 right-0 bottom-0 z-[45] bg-slate-900/50 dark:bg-black/65 backdrop-blur-[2px]"
              style={{ top: NAV_H }}
            />

            <motion.aside
              key={`res-panel-${panel}`}
              data-res-drawer={panel}
              ref={drawerRef}
              initial={skipEntranceRef.current ? false : { x: panel === 'left' ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: panel === 'left' ? '-100%' : '100%', pointerEvents: 'none' }}
              transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.6 }}
              className={`lg:hidden fixed bottom-0 z-50 w-[77.9%] max-w-[323px] flex flex-col bg-white/90 dark:bg-slate-900/95 backdrop-blur-2xl shadow-2xl ${
                panel === 'left'
                  ? 'left-0 border-r border-white/40 dark:border-white/10 rounded-tr-3xl'
                  : 'right-0 border-l border-white/40 dark:border-white/10 rounded-tl-3xl'
              }`}
              style={{ top: `calc(${NAV_H} + ${TOOL_ROW_H})` }}
            >
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {panel === 'left' ? left : right}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}