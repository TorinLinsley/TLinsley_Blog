"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { D_ENTER, EASE_OUT, SPRING_MORPH } from '../lib/motion';
import GitalkBox from './GitalkBox';
import GuestComments from './GuestComments';
import { getApiBase } from '../lib/apiBase';

/**
 * 💬 评论区外壳（控制台版，和博客前台**同一套观感、同一批评论**）。
 *
 * ⚠️ 关键约定：**列表只有一份，和"用哪种方式发"无关** ✓
 *    · 列表 = 本站存的游客评论 + GitHub Issue 里的评论，混在一起、同一套卡片样式 ✓
 *    · 右上角下拉**只决定下面那个发布框**是 GitHub 登录发的，还是游客昵称发的 ✓
 *    · 所以两种方式下，看到的评论列表**长得一模一样**，切来切去不会有"两边不一样" ✗
 *
 * 数据走控制台后端 `/api/comments/list`（后端直接读写博客项目的
 * `data/comments/*.json`，所以控制台和前台看到的是同一批评论 ✓）
 */

type Mode = 'github' | 'guest';

type CommentItem = {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  /** GitHub 头像地址；空的就是游客（画彩色首字母块 ✓） */
  avatar?: string;
  source?: 'github' | 'guest';
};

/** 昵称 → 稳定的头像颜色（同一昵称永远同色） */
const AVATAR_COLORS = [
  'from-indigo-400 to-indigo-600',
  'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600',
  'from-rose-400 to-rose-600',
  'from-sky-400 to-sky-600',
  'from-violet-400 to-violet-600',
  'from-teal-400 to-teal-600',
  'from-orange-400 to-orange-600',
];

function colorOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * 时间显示：**精确到秒的完整时间**在前，相对时间（刚刚 / N 分钟前）在后。
 * 两种来源（GitHub / 游客）都用它 —— 显示必须一致 ✓
 */
function timeText(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const exact = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  const diff = Math.max(0, Date.now() - ts);
  let rel: string;
  if (diff < 60 * 1000) rel = '刚刚';
  else if (diff < 60 * 60 * 1000) rel = `${Math.floor(diff / 60000)} 分钟前`;
  else if (diff < 24 * 60 * 60 * 1000) rel = `${Math.floor(diff / 3600000)} 小时前`;
  else rel = `${Math.floor(diff / 86400000)} 天前`;

  return `${exact} · ${rel}`;
}

export default function Comments({ page }: { page?: string } = {}) {
  const pathname = usePathname();
  const currentPage = page || pathname;

  const [mode, setMode] = useState<Mode>('github');
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newestFirst, setNewestFirst] = useState(true);
  const [tip, setTip] = useState('');
  /** 减少动效：入场只留很短的淡入，重排直接瞬移（更轻，而不是完全不动） */
  const reduceMotion = useReducedMotion();

  // 记住上次选的发布方式（只影响发布框 ✓）
  useEffect(() => {
    try {
      const saved = localStorage.getItem('commentMode');
      if (saved === 'guest' || saved === 'github') setMode(saved);
    } catch {
      /* 隐私模式忽略 */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const base = await getApiBase();
      const res = await fetch(`${base}/api/comments/list?page=${encodeURIComponent(currentPage)}`, { cache: 'no-store' });
      const data = await res.json();
      setComments(data?.ok && Array.isArray(data.comments) ? data.comments : []);
    } catch {
      /* 后端没起来就当没有评论，不打扰 */
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeMode = (next: Mode) => {
    setMode(next);
    try {
      localStorage.setItem('commentMode', next);
    } catch {
      /* ignore */
    }
  };

  /** 游客评论发出去之后立刻插进列表（不用等下次刷新 ✓） */
  const onPosted = useCallback((c: CommentItem) => {
    setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
  }, []);

  const shown = useMemo(
    () => (newestFirst ? [...comments].reverse() : comments),
    [comments, newestFirst]
  );

  /** 删除：只有本站存的那份能删（GitHub 那边的要去仓库里删 ✓） */
  const remove = async (c: CommentItem) => {
    if (c.id.startsWith('gh-')) return;
    try {
      const base = await getApiBase();
      const res = await fetch(
        `${base}/api/comments/delete?page=${encodeURIComponent(currentPage)}&id=${encodeURIComponent(c.id)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data?.ok) setComments((prev) => prev.filter((x) => x.id !== c.id));
      else setTip(data?.message || '删除失败');
    } catch {
      setTip('删除失败');
    }
  };

  return (
    <section className="w-full mt-16 relative" id="comments" data-comments>
      {/* 氛围光晕 */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-indigo-500/10 dark:bg-indigo-500/20 blur-3xl rounded-full pointer-events-none z-0" />

      <div className="relative z-10 pt-6 border-t border-slate-200/50 dark:border-slate-700/50">
        {/* 标题 + 右侧「发布方式」下拉（只切发布框，列表不变 ✓） */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">💬 评论</h3>

          <div className="relative">
            <select
              value={mode}
              onChange={(e) => changeMode(e.target.value as Mode)}
              title="选择用什么方式发表评论"
              className="appearance-none cursor-pointer pl-3 pr-8 py-2 rounded-xl text-xs font-black bg-white/60 dark:bg-slate-800/70 text-slate-600 dark:text-slate-200 border border-white/40 dark:border-white/10 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/50 transition-colors"
            >
              <option value="github">🅖 GitHub 登录发表</option>
              <option value="guest">🧳 游客昵称发表（无需登录）</option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">▼</span>
          </div>
        </div>

        {/*
          ── 唯一的评论列表（两种发布方式共用这一份，样式完全一致 ✓）──
        */}
        {(comments.length > 1 || tip) && (
          <div className="flex items-center justify-end gap-3 mb-3">
            {tip && <span className="text-[11px] font-bold text-rose-500">{tip}</span>}
            {comments.length > 1 && (
            <button
              onClick={() => setNewestFirst((v) => !v)}
              className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-300 hover:text-indigo-500 border border-white/40 dark:border-white/10 transition-colors"
            >
              {newestFirst ? '↓ 最新在前' : '↑ 最早在前'}
            </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">正在读取评论…</div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            还没有人留言 —— 来做第一个吧 ✓
          </div>
        ) : (
          <LayoutGroup>
          <ul className="flex flex-col gap-3 mb-6">
            {shown.map((c) => (
              <motion.li
                key={c.id}
                /*
                 * layout="position"：切换「最新在前 / 最早在前」时，让条目**滑到新位置**
                 * （只做 position 而不是完整 layout —— 更省，也不会让长评论换行时抖）
                 * 新发的评论则用 initial/animate 淡入 + 轻微上浮
                 */
                layout="position"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0.12, ease: EASE_OUT, layout: { duration: 0 } }
                    : { duration: D_ENTER, ease: EASE_OUT, layout: SPRING_MORPH }
                }
                className="group relative flex gap-3 p-4 rounded-2xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/40 dark:border-white/10"
              >
                {c.avatar ? (
                  /* GitHub 用户：他本人的 GitHub 头像 ✓ */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={c.avatar}
                    alt=""
                    loading="lazy"
                    className="shrink-0 w-9 h-9 rounded-xl object-cover shadow-sm ring-1 ring-black/5"
                  />
                ) : (
                  <div className={`shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${colorOf(c.name)} text-white text-sm font-black flex items-center justify-center shadow-sm`}>
                    {(c.name || '匿').slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{c.name || '匿名游客'}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{timeText(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">{c.content}</p>
                </div>
                {!c.id.startsWith('gh-') && (
                  <button
                    onClick={() => void remove(c)}
                    title="删除这条评论"
                    className="absolute top-2 right-2 w-6 h-6 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 max-lg:opacity-100 transition-all text-xs"
                  >
                    ✕
                  </button>
                )}
              </motion.li>
            ))}
          </ul>
          </LayoutGroup>
        )}

        {/*
          ── 发布框（下拉只切这里 ✓ 切完列表还是上面那一份 ✓）──
        */}
        {mode === 'github' ? (
          <GitalkBox page={currentPage} onPosted={() => void load()} />
        ) : (
          <GuestComments page={currentPage} onPosted={onPosted} />
        )}
      </div>
    </section>
  );
}
