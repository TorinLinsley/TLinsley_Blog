"use client";

import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { SPRING_MORPH } from '../../lib/motion';

/**
 * 🧰 工具导航面板（前台展示用，和「杂谈」同一套视觉）：
 *   大标题 + 一行小字 + 搜索框 + 标签筛选 + 卡片列表。
 *
 * 卡片点击后**在当前标签页**跳转到工具本体（/tools/<目录>/<主网页文件>）——
 * 和普通站内链接一样，浏览器后退键就能回到这张导航表。
 */
export type ToolItem = {
  name: string;
  dir: string;
  entry: string;
  description?: string;
  icon?: string;
  tags?: string[];
};

/**
 * 🎭 工具图标画法（和控制台那边是同一套）。
 *
 * · 网络图标（`iconify:库:名字`）和 .svg 文件 → 用 **CSS mask** 画：
 *   只取形状，颜色交给 `currentColor`，所以**深色模式自动变白、浅色自动变深** ✓
 *   （用 <img> 的话颜色是 SVG 文件里写死的，深色模式下就是一团黑 ✗）
 * · png / jpg / ico 这类位图 → 仍用 <img>，保留它自己的颜色 ✓
 */
function ToolIcon({ icon, className = 'w-full h-full' }: { icon?: string; className?: string }) {
  const raw = String(icon || '').trim();
  if (!raw) return null;

  const isNet = raw.startsWith('iconify:');
  const url = isNet ? `/iconify/${raw.slice('iconify:'.length).replace(/:/g, '/')}.svg` : raw;

  if (!isNet && !/\.svg(\?|#|$)/i.test(raw)) {
    return <img src={raw} alt="" className={`${className} object-contain p-1.5`} />;
  }

  const style: React.CSSProperties = {
    WebkitMaskImage: `url(${url})`,
    maskImage: `url(${url})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    backgroundColor: 'currentColor',
  };
  return <span aria-hidden className={`${className} p-1.5`} style={style} />;
}

export default function ToolsBoard({
  tools,
  title,
  subtitle,
}: {
  tools: ToolItem[];
  title: string;
  subtitle: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState('全部');
  /** 选中态指示器：减少动效时不滑动、直接瞬移 */
  const reduceMotion = useReducedMotion();
  const pillTransition = reduceMotion ? { duration: 0 } : SPRING_MORPH;

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    tools.forEach((t) => t.tags?.forEach((x) => tags.add(x)));
    return ['全部', ...Array.from(tags)];
  }, [tools]);

  const filtered = useMemo(() => {
    if (searchQuery.length > 0 && searchQuery.trim() === '') return [];
    const q = searchQuery.trim().toLowerCase();
    return tools.filter((t) => {
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        t.dir.toLowerCase().includes(q) ||
        t.entry.toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q));
      const matchTag = activeTag === '全部' || (t.tags || []).includes(activeTag);
      return matchSearch && matchTag;
    });
  }, [tools, searchQuery, activeTag]);

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-10 py-6 md:py-10 pt-24 md:pt-28 relative z-10">

      <div className="mb-8 md:mb-14 text-center">
        <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white mb-2 md:mb-4 tracking-tighter">
          {title}
        </h1>
        <p className="text-xs md:text-base text-slate-500 dark:text-slate-400 font-medium italic opacity-80">
          “ {subtitle} ”
        </p>
      </div>

      <div className="mb-8 md:mb-12 flex flex-col items-center gap-5 md:gap-8">
        <div className="relative w-full max-w-lg group px-2 md:px-0">
          <input
            type="text"
            placeholder="搜寻想要的小工具..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl border border-white/40 dark:border-white/5 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 pl-10 md:pl-14 text-sm md:text-base text-slate-800 dark:text-white shadow-lg md:shadow-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder-slate-400 font-medium"
          />
          <svg className="w-4 h-4 md:w-6 md:h-6 absolute left-5 md:left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        {allTags.length > 1 && (
          <div className="flex flex-wrap justify-center gap-1.5 md:gap-2 px-2 md:px-0">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`relative px-3 py-1.5 md:px-5 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black transition-colors duration-300 border ${
                  activeTag === tag
                    ? 'text-white border-indigo-500 scale-105'
                    : 'bg-white/30 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400 border-white/20 dark:border-white/5 hover:bg-white/60 dark:hover:bg-slate-700/60'
                }`}
              >
                {activeTag === tag && (
                  <motion.span
                    aria-hidden
                    layoutId="tools-tag-pill"
                    className="absolute inset-0 rounded-lg md:rounded-xl bg-indigo-500 shadow-md md:shadow-lg md:shadow-indigo-500/30"
                    transition={pillTransition}
                  />
                )}
                <span className="relative z-10">{tag === '全部' ? tag : `# ${tag}`}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-xs md:text-sm text-slate-400 dark:text-slate-500 font-medium py-16">
          没有找到对应的工具
        </p>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
          <AnimatePresence mode="popLayout">
            {filtered.map((tool) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={tool.dir}
              >
                <a
                  href={`/tools/${encodeURIComponent(tool.dir)}/${tool.entry.split('/').map(encodeURIComponent).join('/')}`}
                  className="block h-full rounded-2xl md:rounded-[32px] bg-white/40 dark:bg-slate-800/40 backdrop-blur-2xl border border-white/50 dark:border-white/5 shadow-md md:shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 group overflow-hidden"
                >
                  <div className="p-4 md:p-7 flex gap-4 md:gap-5 items-start">
                    {/* 图标：没设置就是一个虚线占位方块 */}
                    <div className="w-12 h-12 md:w-16 md:h-16 shrink-0 rounded-xl md:rounded-2xl bg-indigo-500/10 dark:bg-indigo-400/10 border border-indigo-500/15 flex items-center justify-center overflow-hidden text-slate-800 dark:text-white">
                      {tool.icon ? (
                        <ToolIcon icon={tool.icon} />
                      ) : (
                        <svg className="w-5 h-5 md:w-7 md:h-7 text-indigo-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
                        </svg>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm md:text-xl font-bold text-slate-800 dark:text-white mb-1.5 md:mb-3 leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {tool.name}
                      </h3>
                      {tool.description && (
                        <p className="text-[11px] md:text-sm text-slate-600 dark:text-slate-300 leading-snug md:leading-relaxed opacity-90 line-clamp-3">
                          {tool.description}
                        </p>
                      )}

                      {tool.tags && tool.tags.length > 0 && (
                        <div className="mt-3 md:mt-5 flex flex-wrap gap-1 md:gap-2">
                          {tool.tags.map((t) => (
                            <span key={t} className="text-[8px] md:text-[9px] font-black text-slate-500 dark:text-slate-400 bg-slate-500/5 dark:bg-white/5 px-1.5 py-0.5 md:px-2.5 md:py-1 rounded-md border border-slate-500/10 dark:border-white/5">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-4 md:px-7 py-2 md:py-3 border-t border-white/30 dark:border-white/5 flex items-center justify-between">
                    <span className="text-[9px] md:text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">
                      /tools/{tool.dir}/{tool.entry}
                    </span>
                    <span className="text-[9px] md:text-[10px] font-black text-indigo-500 shrink-0 ml-2 group-hover:translate-x-0.5 transition-transform">
                      打开 →
                    </span>
                  </div>
                </a>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
