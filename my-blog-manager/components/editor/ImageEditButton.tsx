"use client";

import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Image as ImageIcon, X } from 'lucide-react';

/**
 * 🖼️ 「图片插入 / 编辑」按钮 + 编辑窗口（用户 2026-10-16 要求 ✓）
 *
 * 交互：
 *   · 点一下图片 = 选中它（ProseMirror 的 NodeSelection ✓）→ 再点这个按钮，窗口里
 *     **自动填上这张图的描述和链接** ✓ 改完点「确认」→ 原地更新 ✓
 *   · 没有选中图片时点它 → 窗口是空的 → 填上链接点「确认」→ 插入一张新图 ✓
 *     （链接支持**站内路径** `/…` ✓ 例如 `/resources/某篇`、`/uploads/xxx.png` ✓
 *      也支持任何 http(s) 图床链接 ✓）
 *   · 描述留空 → **不写 alt** ✓（于是鼠标悬停没有提示 ✓ 用户要求 ✓）
 *
 * 窗口：
 *   · 电脑：**可以按住标题栏拖动** ✓（和图床工作台一个手感 ✓）
 *   · 手机（<768px）：**固定在屏幕中央** ✓ 不拖 ✗ 并按屏宽自适应 ✓
 *   · 右上角 **×** 关闭 ✓（取消不改任何东西 ✓）
 *   · 样式跟站内主题一致 ✓ 字号和编辑器工具栏一致（text-sm）✓
 */
export default function ImageEditButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false);
  const [alt, setAlt] = useState("");
  const [src, setSrc] = useState("");
  /** 窗口位置（null = 初始居中）；拖动后记录换算到 left/top 的坐标 */
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const dragRef = useRef<{ offX: number; offY: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 手机判定（<768px）→ 居中原生、不拖 ✓
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 拖动：按住标题栏移动（只在电脑上 ✓）
  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setPos({
        left: Math.min(Math.max(8, e.clientX - d.offX), window.innerWidth - 120),
        top: Math.min(Math.max(8, e.clientY - d.offY), window.innerHeight - 60),
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
    setPos(null);                       // 每次打开都回到居中（和工具窗口一致 ✓）
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

      {open && typeof document !== "undefined" && (
        <div
          ref={boxRef}
          className="fixed z-[9999] w-[min(92vw,26rem)] rounded-3xl border border-white/40 dark:border-white/10 bg-white/80 dark:bg-slate-800/90 backdrop-blur-xl shadow-2xl p-5 text-sm"
          style={
            isMobile || !pos
              ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
              : { left: pos.left, top: pos.top }
          }
        >
          {/* 标题栏 = 可拖动区域（电脑 ✓） */}
          <div
            className={`flex items-center justify-between mb-4 ${isMobile ? "" : "cursor-move select-none"}`}
            onMouseDown={(e) => {
              if (isMobile) return;
              const rect = boxRef.current?.getBoundingClientRect();
              if (!rect) return;
              dragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top };
              setPos({ left: rect.left, top: rect.top });
            }}
          >
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
            className="w-full bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          />

          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">图片链接（支持站内路径 /…）</label>
          <input
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            placeholder="https://… 或 /resources/某篇"
            className="w-full bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirm}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 hover:brightness-110 transition-all"
            >
              确认
            </button>
          </div>
        </div>
      )}
    </>
  );
}
