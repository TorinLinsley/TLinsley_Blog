"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { Image as ImageIcon, X } from 'lucide-react';

/**
 * 🖼️ 「图片插入 / 编辑」按钮 + 编辑窗口（用户 2026-10-16 要求 ✓）
 *
 * 交互：
 *   · 点一下图片 = 选中它（ProseMirror 的 NodeSelection ✓）→ 再点这个按钮，窗口里
 *     **自动填上这张图的描述和链接** ✓ 改完点「确认」→ 原地更新 ✓
 *   · 没选中图片时点它 → 窗口空的 → 填链接点「确认」→ 插入新图 ✓
 *     （链接支持**站内路径** `/…` ✓ 也支持任何 http(s) 图床链接 ✓）
 *   · 描述留空 → **不写 alt** ✓（鼠标悬停没有提示 ✓）
 *
 * 窗口（2026-10-16 修过两处 ✗→✓）：
 *   · ⚠️ **必须用 createPortal 挂到 body** ✓
 *     原来直接渲染在工具栏 div 里 ✗ —— 工具栏有毛玻璃/transform，
 *     会让 `position:fixed` 变成"相对那个祖先定位" ✗ → 拖动坐标全错、窗口乱飞 ✗
 *   · 拖动：按住窗口里**任意非交互区域**都能拖 ✓（不只是标题文字 ✓）
 *     输入框/按钮上按下时**不拖**（那是正常点击 ✓），而且窗口里**不能框选文本** ✗
 *   · 手机（<768px）：固定在屏幕中央 ✓ 不拖 ✗ 按屏宽自适应 ✓
 *   · 右上角 **×** 关闭 ✓（取消不改任何东西 ✓）
 */
export default function ImageEditButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false);
  const [alt, setAlt] = useState("");
  const [src, setSrc] = useState("");
  /** 窗口左上角坐标（null = 还没拖过 → 居中） */
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const dragRef = useRef<{ offX: number; offY: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 拖动：鼠标在窗口里按下（非输入框）→ 跟着走 ✓
  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const box = boxRef.current;
      const w = box?.offsetWidth || 400;
      const h = box?.offsetHeight || 200;
      setPos({
        left: Math.min(Math.max(8, e.clientX - d.offX), window.innerWidth - w - 8),
        top: Math.min(Math.max(8, e.clientY - d.offY), window.innerHeight - h - 8),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [open]);

  const openDialog = () => {
    const active = !!editor?.isActive("image");
    const attrs = active ? (editor!.getAttributes("image") as { src?: string; alt?: string }) : {};
    setSrc(attrs.src || "");
    setAlt(attrs.alt || "");
    setPos(null);                       // 每次打开都回到居中 ✓
    setOpen(true);
  };

  const confirm = () => {
    const url = src.trim();
    if (!url || !editor) return;        // 链接空 → 什么都不做 ✓
    const attrs: { src: string; alt?: string } = { src: url };
    const a = alt.trim();
    if (a) attrs.alt = a;               // 描述为空 → 不写 alt ✓（悬停无提示 ✓）

    if (editor.isActive("image")) {
      editor.chain().focus().updateAttributes("image", attrs).run();   // 改这一张 ✓
    } else {
      editor.chain().focus().setImage(attrs).run();                    // 插一张新的 ✓
    }
    setOpen(false);
  };

  /** 在窗口里按下 → 开始拖动（输入框/按钮上按下不算 ✓） */
  const startDrag = (e: React.MouseEvent) => {
    if (isMobile) return;
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, button, a, select, label")) return;   // 交互元素上不拖 ✓
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top };
    setPos({ left: rect.left, top: rect.top });
    e.preventDefault();                 // 顺手阻止框选 ✓
  };

  const dialog = (
    <div
      ref={boxRef}
      onMouseDown={startDrag}
      className={`fixed z-[9999] w-[min(92vw,26rem)] rounded-3xl border border-white/40 dark:border-white/10 bg-white/85 dark:bg-slate-800/95 backdrop-blur-xl shadow-2xl p-5 text-sm select-none overscroll-contain ${isMobile ? "" : "cursor-move"}`}
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
      }
    >
      {/* 标题栏（不再单独承担拖动 ✗ 整个窗口都能拖 ✓，这里只是视觉上的把手） */}
      <div className="flex items-center justify-between mb-4">
        <span className="font-bold text-slate-700 dark:text-slate-200">图片插入 / 编辑</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="关闭"
          className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">图片描述（悬停提示，可留空）</label>
      <input
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        placeholder="留空则鼠标悬停不显示提示"
        className="w-full select-text cursor-text bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
      />

      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">图片链接（支持站内路径 /…）</label>
      <input
        value={src}
        onChange={(e) => setSrc(e.target.value)}
        placeholder="https://… 或 /resources/某篇"
        className="w-full select-text cursor-text bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div className="flex items-center justify-end gap-2 mt-5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
        >
          取消
        </button>
        <button
          type="button"
          onClick={confirm}
          className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 hover:brightness-110 transition-all cursor-pointer"
        >
          确认
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title="图片插入 / 编辑"
        className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/60 transition-colors duration-300"
      >
        <ImageIcon size={16} className="text-indigo-500" />
      </button>

      {/* ⚠️ 必须 portal 到 body ✗ 别渲染在工具栏里（毛玻璃祖先会毁掉 fixed 定位 ✓） */}
      {open && typeof document !== "undefined" ? createPortal(dialog, document.body) : null}
    </>
  );
}
