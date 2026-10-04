"use client";

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, RotateCcw, Trash2, Folder, FileText, Clock, MapPin } from 'lucide-react';

export type TrashItem = {
  id: string;
  name: string;
  fileName?: string;
  type: 'folder' | 'article';
  /** 删除前在文章总目录里的完整相对路径 ← 还原就回到这里 */
  origin: string;
  parent: string;
  deletedAt: string;
  exists?: boolean;
};

/**
 * 🗑️ 回收站面板
 * 删除的东西都躺在这里，可以「还原」回原来的位置，也可以「彻底删除」。
 */
export default function TrashPanel({
  items,
  loading,
  onClose,
  onRestore,
  onPurge,
}: {
  items: TrashItem[];
  loading: boolean;
  onClose: () => void;
  onRestore: (ids: string[]) => void;
  /** ids 为 null 表示清空回收站 */
  onPurge: (ids: string[] | null) => void;
}) {
  const [mounted, setMounted] = useState(false);
  // 「清空回收站」是真删，所以要点两次确认（不弹浏览器原生对话框）
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!confirmEmpty) return;
    const t = setTimeout(() => setConfirmEmpty(false), 2500);
    return () => clearTimeout(t);
  }, [confirmEmpty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div data-trash-panel className="fixed inset-0 z-[400] flex items-center justify-center p-6" onMouseDown={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12 }}
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-[580px] max-h-[72vh] flex flex-col rounded-3xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden"
      >
        {/* 标题栏 */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-slate-300/40 dark:border-white/10">
          <Trash2 size={16} className="shrink-0 text-slate-500 dark:text-slate-300" />
          <h3 className="text-base font-black text-slate-700 dark:text-slate-100">回收站</h3>
          <span className="text-[15px] font-bold text-slate-400">{items.length} 项</span>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!items.length}
              onClick={() => onRestore(items.map((it) => it.id))}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[15px] font-bold transition-colors duration-200 hover:bg-indigo-500/20 disabled:opacity-40 disabled:hover:bg-indigo-500/10"
            >
              全部还原
            </button>
            <button
              type="button"
              disabled={!items.length}
              onClick={() => {
                if (!confirmEmpty) {
                  setConfirmEmpty(true);
                  return;
                }
                setConfirmEmpty(false);
                onPurge(null);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[15px] font-bold transition-colors duration-200 disabled:opacity-40 ${
                confirmEmpty
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
              }`}
            >
              {confirmEmpty ? '再点一次确认清空' : '清空回收站'}
            </button>
            <button
              type="button"
              title="关闭"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-500 dark:text-slate-300 transition-colors duration-200 hover:bg-slate-500/10"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3">
          {loading && !items.length ? (
            <div className="py-10 text-center text-[15px] text-slate-400">正在读取回收站…</div>
          ) : !items.length ? (
            <div className="py-10 text-center text-[15px] text-slate-400">回收站是空的，删掉的文章会先放这里</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="group flex items-center gap-2.5 rounded-2xl px-3 py-2 transition-colors duration-200 hover:bg-white/60 dark:hover:bg-slate-700/40"
                >
                  {it.type === 'folder' ? (
                    <Folder size={15} className="shrink-0 opacity-70" />
                  ) : (
                    <FileText size={15} className="shrink-0 opacity-70" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-slate-700 dark:text-slate-200 truncate">{it.name}</p>
                    <p className="flex items-center gap-1 text-sm text-slate-400 truncate">
                      <MapPin size={10} className="shrink-0" />
                      {it.parent ? it.parent : '文章总目录'}
                      <span className="mx-0.5">·</span>
                      <Clock size={10} className="shrink-0" />
                      {it.deletedAt}
                    </p>
                  </div>
                  {/* 📱 手机上常显（触屏没有 hover），桌面仍旧悬停才出现 */}
                  <div className="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 max-lg:opacity-100! transition-opacity duration-200">
                    <button
                      type="button"
                      onClick={() => onRestore([it.id])}
                      className="flex items-center gap-1 px-2 py-1 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[15px] font-bold transition-colors duration-200 hover:bg-indigo-500/20"
                    >
                      <RotateCcw size={11} />
                      还原
                    </button>
                    <button
                      type="button"
                      onClick={() => onPurge([it.id])}
                      className="flex items-center gap-1 px-2 py-1 rounded-xl bg-red-500/10 text-red-500 text-[15px] font-bold transition-colors duration-200 hover:bg-red-500/20"
                    >
                      <Trash2 size={11} />
                      彻底删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-slate-300/40 dark:border-white/10 text-sm text-slate-400">
          还原会把内容送回它被删除前的位置；如果那个文件夹已经不在了，会自动重新建出来。
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
