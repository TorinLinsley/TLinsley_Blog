"use client";

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * 🎛️ 主题化下拉框（替代原生 `<select>`）。
 *
 * 为什么不用原生 select：它的**弹出列表**是浏览器/系统自己画的，
 * 深色模式下经常是「白底 + 我们设的浅色字」→ 根本看不清是什么 ✗
 * （只改 `option` 的样式，各家浏览器支持程度还不一样。）
 *
 * 这里自己画一个，底色/文字完全跟着站点主题走：
 *   · 浅色：白底 + 深色字（hover 淡紫）
 *   · 深色：深底 + 浅色字
 * 选中项统一用主题色（indigo）高亮 ✓
 *
 * 收起方式：再点一下按钮 / 点外面 / 按 Esc ✓
 */
export type ThemedOption = { value: string; label: string };

export default function ThemedSelect({
  value,
  options,
  onChange,
  title,
  label,
  className = '',
  panelClassName = '',
}: {
  value: string;
  options: ThemedOption[];
  onChange: (value: string) => void;
  title?: string;
  /** 直接指定按钮上显示的文字（不传就按 value 去选项里找） */
  label?: string;
  /** 按钮本身的额外样式（字号/内边距之类） */
  className?: string;
  /** 弹出列表的额外样式 */
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 点外面 / 按 Esc 收起
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-lg cursor-pointer transition-colors text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 ${className}`}
      >
        <span className="truncate">{label ?? current?.label ?? value}</span>
        <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute left-0 top-full mt-1 z-[130] min-w-full w-max max-h-72 overflow-y-auto custom-scrollbar rounded-xl border p-1 shadow-2xl
            bg-white border-slate-200/80
            dark:bg-slate-800 dark:border-white/10
            ${panelClassName}`}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`block w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                o.value === value
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-800 dark:text-slate-100 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-300'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
