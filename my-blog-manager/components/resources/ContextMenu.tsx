"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

/**
 * Windows 11 风格的右键菜单
 *  - 图标 + 文字一一对应（图标就是这一项要干的事）
 *  - 危险操作（删除）用醒目的红色
 *  - 右侧带快捷键提示
 *  - 用 portal 挂到 body 上，所以不会被左栏的 overflow / backdrop-blur 裁掉
 */
export type ContextMenuItem =
  | { kind: 'separator'; key?: string }
  | {
      kind?: 'item';
      key: string;
      label: string;
      icon?: LucideIcon;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      onClick?: () => void;
    };

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // 贴着鼠标打开；贴近视口边缘时自动翻转，保证整块都看得见
  useLayoutEffect(() => {
    if (!mounted) return;
    const el = boxRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + width + pad > window.innerWidth) left = Math.max(pad, x - width);
    if (top + height + pad > window.innerHeight) top = Math.max(pad, y - height);
    setPos({ left, top });
  }, [mounted, x, y, items]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // 点在菜单自己身上不关（交给菜单项的 onClick 处理）
      if (boxRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();

    // mousedown 和 click 都监听：真实鼠标操作走 mousedown，
    // 程序化点击（合成 click）也能正常收起
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('click', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('click', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <motion.div
      ref={boxRef}
      data-context-menu
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.08, ease: 'easeOut' }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        left: pos?.left ?? x,
        top: pos?.top ?? y,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: 'top left',
      }}
      className="fixed z-[300] min-w-[200px] py-1.5 rounded-2xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl shadow-slate-900/20 select-none"
    >
      {items.map((item, i) => {
        if (item.kind === 'separator') {
          return <div key={item.key ?? `sep-${i}`} className="my-1 mx-3 h-px bg-slate-400/30 dark:bg-white/10" />;
        }
        const ItemIcon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onClick?.();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-[7px] text-left text-base font-bold transition-colors duration-150 ${
              item.disabled
                ? 'text-slate-400/60 dark:text-slate-500/60 cursor-default'
                : item.danger
                  ? 'text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-300'
            }`}
          >
            {ItemIcon ? <ItemIcon size={14} className="shrink-0" /> : <span className="w-[14px] shrink-0" />}
            <span className="flex-1 min-w-0 truncate">{item.label}</span>
            {item.shortcut && <span className="shrink-0 text-sm font-medium opacity-45">{item.shortcut}</span>}
          </button>
        );
      })}
    </motion.div>,
    document.body
  );
}
