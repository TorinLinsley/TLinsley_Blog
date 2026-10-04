"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * 🖱️ 自定义悬停提示（替代浏览器自带的 title 提示框）。
 *
 * 为什么不用 title：延迟一两秒才出来、样式完全跟着系统走（浅黄方块），和网页整体风格不搭，
 * 而且 hover 到文字上还会抖一下。这里用页面自己的深色胶囊气泡，出现快（0.12s 淡入）、
 * 鼠标一划走立刻退场（AnimatePresence 接管，快速划过也不会残留）。
 *
 * 三个细节：
 *   ① 用 portal 挂到 body 上 —— 父级有 overflow-hidden / backdrop-blur 时，
 *      气泡放在里面会被裁掉或糊掉（首页那张资料卡两样都占）。
 *   ② 动画交给外层 motion 元素（opacity/scale/y 位移），居中的 -50%/-100% 平移放在内层，
 *      两者互不覆盖 —— framer-motion 会直接写 transform，和 Tailwind 的 translate 类抢同一个属性。
 *   ③ 上方空间不够（按钮贴着屏幕顶）会自动翻到下方，反之亦然。
 */
export default function Tooltip({
  label,
  children,
  side = 'top',
  className = 'inline-flex',
}: {
  label: string;
  children: React.ReactNode;
  /** 优先出现在元素上方（默认）还是下方；空间不够会自动翻面 */
  side?: 'top' | 'bottom';
  /**
   * 给外层「锚点」元素加的类名。
   * 放进 flex / grid 里时，把原来那个元素身上的布局类（flex-1、aspect-square、absolute…）
   * 传进来，否则多出来一层 span 会把布局挤坏。
   */
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; place: 'top' | 'bottom' } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setMounted(true), []);

  const show = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;

    // 气泡高约 28px + 8px 间距 ≈ 36px，两侧都按 44px 留点余量
    const ROOM = 44;
    const roomAbove = rect.top >= ROOM;
    const roomBelow = window.innerHeight - rect.bottom >= ROOM;
    let place: 'top' | 'bottom' = side;
    if (place === 'top' && !roomAbove && roomBelow) place = 'bottom';
    else if (place === 'bottom' && !roomBelow && roomAbove) place = 'top';

    // 锚点取「元素上/下边缘的中点」，居中与抬升交给内层 transform
    setTip({ x: rect.left + rect.width / 2, y: place === 'top' ? rect.top : rect.bottom, place });
  }, [side]);

  const hide = useCallback(() => setTip(null), []);

  return (
    <span
      ref={anchorRef}
      /* 标记一下：这个子树已经有自己的气泡了，全站的 HoverTip 不要再来插一脚（免得两个气泡叠一起） */
      data-tooltip-anchor
      onMouseEnter={show}
      onMouseLeave={hide}
      /* React 的 onFocus/onBlur 走 focusin/focusout，子元素获得焦点也会冒泡到这里 —— 键盘 Tab 也能看到提示 */
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
