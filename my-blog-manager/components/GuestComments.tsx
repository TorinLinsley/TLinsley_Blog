"use client";

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getApiBase } from '../lib/apiBase';

/**
 * 🧳 「游客昵称」发布框（**不用 GitHub、不用数据库、不用登录**）。
 *
 * ⚠️ 这里**只有发布框，没有列表** ✓ —— 列表由外层 `Comments.tsx` 统一渲染，
 *    两种发布方式看到的是同一份列表（GitHub 那些评论也在一起）✓
 *
 * 评论数据存在博客项目里（`<blogPath>/data/comments/*.json`），控制台和博客在同一台
 * 机器上，所以后端直接读写同一批文件 —— 控制台看到的和前台**是同一批评论** ✓
 *
 * 管理删除：列表里本站的评论右上角 ✕（需要设 COMMENTS_ADMIN_KEY；后端没设就隐藏）
 */

type CommentItem = {
  id: string;
  page?: string;
  name: string;
  content: string;
  createdAt: number;
  avatar?: string;
  source?: 'github' | 'guest';
};

export default function GuestComments({
  page,
  onPosted,
}: {
  page?: string;
  /** 发成功之后把这条评论交给外层，立刻补进列表 ✓ */
  onPosted?: (c: CommentItem) => void;
} = {}) {
  const pathname = usePathname();
  /**
   * 评论按"页面标识"归档：默认用当前路由 pathname ✓
   * 说说、灵境那种不是路由一页一个的，就把自己的 id 传进来 ✓
   * —— 全站共用这一套组件，**哪个界面都能游客评论** ✓
   */
  const currentPage = page || pathname;
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [tip, setTip] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const trapRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setName(localStorage.getItem('commentNickname') || '');
    } catch {
      /* 隐私模式下 localStorage 可能不可用，忽略 */
    }
  }, []);

  const submit = async () => {
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    setTip(null);
    try {
      const res = await fetch((await getApiBase()) + '/api/comments/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: currentPage,
          name: name.trim(),
          content: text,
          trap: trapRef.current?.value || '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setTip({ kind: 'err', text: data?.message || '发送失败，稍后再试' });
      } else {
        onPosted?.(data.comment);
        setContent('');
        setTip({ kind: 'ok', text: '发表成功 ✓' });
        try {
          localStorage.setItem('commentNickname', name.trim());
        } catch {
          /* ignore */
        }
      }
    } catch {
      setTip({ kind: 'err', text: '网络异常，发送失败' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full relative" data-guest-comment-form>
      <div className="rounded-2xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/40 dark:border-white/10 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 24))}
            placeholder="昵称（留空就是匿名游客）"
            className="sm:w-40 shrink-0 px-4 py-3 text-sm rounded-xl bg-white/60 dark:bg-slate-900/40 border border-white/50 dark:border-white/10 outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder-slate-400"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit();
            }}
            rows={3}
            placeholder="说点什么…（Ctrl + Enter 快速发送）"
            className="flex-1 px-4 py-3 text-sm rounded-xl bg-white/60 dark:bg-slate-900/40 border border-white/50 dark:border-white/10 outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder-slate-400 resize-y leading-relaxed"
          />
        </div>

        {/* 🍯 蜜罐：正常用户看不见也不会填，填了就是机器人 */}
        <input ref={trapRef} type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

        <div className="flex items-center justify-between gap-3 mt-3">
          <span className={`text-[11px] font-bold ${tip?.kind === 'err' ? 'text-rose-500' : 'text-emerald-500'}`}>
            {tip?.text || ''}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-400">{content.length}/2000</span>
            <button
              onClick={() => void submit()}
              disabled={sending || !content.trim()}
              className="px-6 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-black shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? '发送中…' : '发表评论'}
            </button>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500 text-center">
        无需注册、无需登录 —— 评论和博客前台是同一批
      </p>
    </div>
  );
}
