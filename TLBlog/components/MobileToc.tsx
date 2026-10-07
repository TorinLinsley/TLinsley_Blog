"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ResourceToc from './ResourceToc';
import { TocBars } from './MorphIcons';
import { registerLayer } from './layerStack';

/**
 * 手机端（<1024px）的「大纲」入口 —— 和资源分享页那套完全一致：
 *
 *   · 按钮固定死在视口内部的右上角（导航栏正下方那一行），**不随页面滚动**；
 *   · 图标两份常驻、只切换显隐（outline.svg ⇄ outline-open.svg），所以永远是"瞬间"切换，
 *     不会出现"点了先闪一下空白再出图标"；这里刻意不加任何 transition。
 *   · 点按钮展开右侧抽屉（里面就是资源分享页同款 ResourceToc：序号 1 / 1.1 / 1.2…、
 *     滚动跟随高亮、点条目平滑跳转、刚跳完那一下不让滚动位置抢高亮）；
 *   · 打断逻辑也和资源页一致：按钮行永远露在遮罩外面（展开状态也点得到），
 *     所以随时可以再点一下按钮 / 点遮罩把它收回去；`AnimatePresence mode="wait"`
 *     保证快速连点不会两层面板同时挂着。
 *
 * 大屏走页面右侧常驻的那张 ClientTOC 卡片，这个组件只在 lg 以下出现。
 */

/** 小屏导航栏高度（和 Navbar / ResourcePanels 保持一致） */
const NAV_H = '3.25rem';
/** 按钮行高度：正好卡在导航栏和正文卡片之间那条空档里，不会压住正文 */
const TOOL_ROW_H = '2.75rem';

/** 展开按钮的图标：真实线条形变（三条矩形从左往右依次"伸"出来 → 淡入原图），详见 MorphIcons.tsx */
function TocIcon({ open }: { open: boolean }) {
  return <TocBars open={open} />;
}

export default function MobileToc({ contentKey }: { contentKey: string }) {
  const [open, setOpen] = useState(false);
  /** 抽屉本体 / 按钮：交给 layerStack 判断"这一下该不该收" */
  const drawerRef = useRef<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // 抽屉打开时锁住背景滚动（和资源页一样）
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // 开着的抽屉登记成一层：点空白只收最上面那层（不看动画有没有播完），
  // 所以"先收导航栏菜单、再立刻收大纲"点两下就成。
  useEffect(() => {
    if (!open) return;
    return registerLayer({
      panel: () => drawerRef.current,
      // ⚠️ 同上：按钮行是通栏的，按钮中间那块空档也算空白处（不然收不掉下面那层）；
      //    按钮本身由 layerStack 的 INTERACTIVE 放行。
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
            {/* 遮罩从**导航栏下沿**开始（不是按钮行下沿）—— 归档这边要的是"抽屉顶到导航栏底部贴着"，
                所以展开时抽屉会盖住那个按钮；要收起就点左边露出来的遮罩（或再往下滑）。
                这是和资源分享页唯一的差别：那边按钮行留一条、永远露在外面。 */}
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
