"use client";

import { useEffect, useState } from 'react';


type PywebviewApi = {
  copy_to_clipboard?: (text: string) => Promise<boolean> | boolean;
};

export default function UrlCopyShortcut() {
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const nativeCopy = async (text: string) => {
      try {
        const api = (window as unknown as { pywebview?: { api?: PywebviewApi } }).pywebview?.api;
        if (api && typeof api.copy_to_clipboard === 'function') {
          return (await api.copy_to_clipboard(text)) === true;
        }
      } catch {
      }
      return false;
    };

    const browserCopy = async (text: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {
      }
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