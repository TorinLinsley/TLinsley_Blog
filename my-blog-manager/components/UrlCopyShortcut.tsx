"use client";

import { useEffect, useState } from 'react';

/**
 * Ctrl + Alt + R：把当前地址（完整的 http://... 开头的 URL）复制到剪贴板。
 *
 * 控制台是 pywebview 窗口，没有浏览器的地址栏，看不见自己现在在哪个地址。
 * 这个快捷键就是补这个缺口的：按一下就把完整 URL 复制走，方便粘贴给别人或者在服务器上对照。
 */

/** pywebview 暴露出来的原生接口（浏览器里没有这个对象） */
type PywebviewApi = {
  copy_to_clipboard?: (text: string) => Promise<boolean> | boolean;
};

export default function UrlCopyShortcut() {
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    /**
     * 首选：让 Python 侧用 Win32 原生 API 写剪贴板。
     *
     * 直接用 navigator.clipboard 的话，Chromium 会给剪贴板内容附上
     * ExcludeClipboardContentFromMonitorProcessing / CanIncludeInClipboardHistory=0 两个标记，
     * 表现就是——**粘贴没问题，但 Win+V 的剪贴板历史里看不见这条**。
     * 走原生 API 写出来的内容不带标记，历史记录里就有。
     */
    const nativeCopy = async (text: string) => {
      try {
        const api = (window as unknown as { pywebview?: { api?: PywebviewApi } }).pywebview?.api;
        if (api && typeof api.copy_to_clipboard === 'function') {
          return (await api.copy_to_clipboard(text)) === true;
        }
      } catch {
        /* pywebview 没准备好就落到浏览器方案 */
      }
      return false;
    };

    const browserCopy = async (text: string) => {
      // 现代剪贴板 API（localhost / 127.0.0.1 算安全上下文，能用）
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {
        /* 落到下面的兜底方案 */
      }
      // 兜底：临时 textarea + execCommand（老 WebView 也能用）
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    };

    const writeClipboard = async (text: string) => {
      if (await nativeCopy(text)) return true;
      return browserCopy(text);
    };

    const onKeyDown = async (e: KeyboardEvent) => {
      // Ctrl + Alt + R（避开浏览器/系统的 Ctrl+R 刷新）
      if (!e.ctrlKey || !e.altKey) return;
      if (e.key !== 'r' && e.key !== 'R') return;
      e.preventDefault();
      e.stopPropagation();

      const url = window.location.href;
      const ok = await writeClipboard(url);

      setTip(ok ? `已复制地址：${url}` : `复制失败，请手动记下：${url}`);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTip(null), 2800);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!tip) return null;

  return (
    <div
      data-url-copied
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] max-w-[80vw] px-4 py-2.5 rounded-2xl bg-slate-900/90 dark:bg-slate-100/95 text-white dark:text-slate-900 text-xs font-bold shadow-2xl backdrop-blur-xl border border-white/20 truncate"
    >
      {tip}
    </div>
  );
}
