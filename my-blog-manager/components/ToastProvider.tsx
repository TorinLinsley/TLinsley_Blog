"use client";

import { createContext, useContext, useRef, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// 撤回按钮（比如删除后弹一个「撤销」）
export interface ToastAction {
  label: string;
  onClick: () => void;
}

// 定义全局可以调用的方法
interface ToastContextType {
  showToast: (text: string, type?: 'success' | 'warning' | 'error' | 'info', action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToastMsg] = useState<{
    text: string;
    type: 'success' | 'warning' | 'error' | 'info';
    action?: ToastAction;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (
    text: string,
    type: 'success' | 'warning' | 'error' | 'info' = 'success',
    action?: ToastAction
  ) => {
    setToastMsg({ text, type, action });
    if (timerRef.current) clearTimeout(timerRef.current);
    // 带「撤销」的提示多留一会儿，好让人来得及点
    timerRef.current = setTimeout(() => setToastMsg(null), action ? 6000 : 3000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            data-toast
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className={`fixed top-20 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-xl border
              ${toastMsg.type === 'success' ? 'bg-green-500/90 border-green-400 text-white' : ''}
              ${toastMsg.type === 'warning' ? 'bg-amber-500/90 border-amber-400 text-white' : ''}
              ${toastMsg.type === 'error' ? 'bg-red-500/90 border-red-400 text-white' : ''}
              ${toastMsg.type === 'info' ? 'bg-indigo-500/90 border-indigo-400 text-white' : ''}
            `}
          >
            <span className="font-bold text-sm">{toastMsg.text}</span>
            {toastMsg.action && (
              <button
                type="button"
                onClick={() => {
                  const act = toastMsg.action;
                  setToastMsg(null);
                  if (timerRef.current) clearTimeout(timerRef.current);
                  act?.onClick();
                }}
                className="shrink-0 px-3 py-1 rounded-xl bg-white/25 text-white text-xs font-black transition-colors duration-200 hover:bg-white/40"
              >
                {toastMsg.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </ToastContext.Provider>
  );
}

// 导出一个万能钩子，任何组件引用它就能召唤弹窗
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast 必须在 ToastProvider 内部使用");
  return context;
};
