"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';

interface Post {
  slug: string;
  title?: string;
  description?: string;
  tags?: string[];
  date?: string;
  [key: string]: any;
}

/** 📁 资源分享：搜文件名 / 标题 / 路径 */
export interface ResourceHit {
  /** 展示用标题（frontmatter 的 title，取不到就用文件名） */
  title: string;
  /** 仓库里的相对路径，如 `1资源分享/工具.md` */
  path: string;
  /** 原始文件名，如 `工具.md` */
  fileName: string;
  /** 所在文件夹，如 `1资源分享`（根目录为空串） */
  folder?: string;
}

/** 🚀 项目：搜名称 / 描述 / 标签 */
export interface ProjectHit {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  tags?: string[];
}

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const Highlight = ({ text = '', query = '' }) => {
  if (!query.trim() || !text) return <>{text}</>;

  const safeQuery = escapeRegExp(query);
  const regex = new RegExp(`(${safeQuery})`, 'gi');
  const parts = String(text).split(regex);

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-300 dark:bg-yellow-500/80 text-slate-900 dark:text-white px-1 mx-[1px] rounded-[4px] shadow-sm font-bold transition-all">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

/** 每类最多列这么多条，剩下的只用一行提示带过，免得下拉框拉得老长 */
const GROUP_LIMIT = 6;

export default function SearchBar({
  posts = [],
  resources = [],
  projects = [],
}: {
  posts: Post[];
  /** 📁 资源分享（可搜索文件名） */
  resources?: ResourceHit[];
  /** 🚀 项目 */
  projects?: ProjectHit[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * 🔍 三个来源一起搜：
   *   ① 文章    —— 标题 / 描述 / 标签
   *   ② 资源分享 —— **文件名** / frontmatter 标题 / 所在路径
   *   ③ 项目    —— 名称 / 描述 / 标签
   */
  const results = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const empty = { posts: [] as Post[], resources: [] as ResourceHit[], projects: [] as ProjectHit[] };
    if (!query) return empty;

    const hit = (...fields: (string | undefined)[]) =>
      fields.some(f => (f || '').toLowerCase().includes(query));

    return {
      posts: posts.filter(post =>
        hit(post.title, post.description) || (post.tags || []).some(tag => tag.toLowerCase().includes(query))
      ),
      resources: resources.filter(item =>
        hit(item.fileName, item.title, item.path)
      ),
      projects: projects.filter(project =>
        hit(project.name, project.description) || (project.tags || []).some(tag => tag.toLowerCase().includes(query))
      ),
    };
  }, [searchQuery, posts, resources, projects]);

  const totalHits = results.posts.length + results.resources.length + results.projects.length;

  /** 资源分享的 url：每段单独编码（中文文件夹、空格都靠它） */
  const resourceHref = (path: string) => '/resources/' + path.split('/').map(encodeURIComponent).join('/');

  const groupTitle = 'px-6 pt-4 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2';

  return (
    <div className="relative w-full max-w-2xl mx-auto mb-10 z-[100]" ref={containerRef}>
      <form className="relative group" onSubmit={(e) => e.preventDefault()}>

        {/* 先渲染 Input */}
        <input
          type="text"
          className="w-full pl-14 pr-6 py-4 bg-white/50 dark:bg-slate-800/50 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-3xl shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-800 dark:text-slate-200 transition-all placeholder-slate-500 dark:placeholder-slate-400 font-medium text-lg relative z-0"
          placeholder="搜寻文章、资源分享、项目..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          autoComplete="off"
          spellCheck="false"
        />

        {/* 🌟 核心修复：把放大镜放在 input 之后，并且加上 z-10 强制置顶！ */}
        <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none select-none z-10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors drop-shadow-sm"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>

      </form>

      <AnimatePresence>
        {isOpen && searchQuery.trim() !== '' && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 right-0 mt-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl border border-white/50 dark:border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden max-h-[450px] overflow-y-auto z-20"
          >
            {totalHits > 0 ? (
              <div className="flex flex-col pb-3">

                {/* ── 📄 文章 ── */}
                {results.posts.length > 0 && (
                  <>
                    <div className={groupTitle}>
                      <span>文章</span>
                      <span className="text-slate-300 dark:text-slate-600">{results.posts.length}</span>
                    </div>
                    {results.posts.slice(0, GROUP_LIMIT).map((post) => (
                      <Link
                        href={`/posts/${post.slug}`}
                        key={post.slug}
                        onClick={() => setIsOpen(false)}
                        className="px-6 py-5 hover:bg-indigo-50/80 dark:hover:bg-indigo-500/10 transition-colors group border-b border-slate-100/50 dark:border-slate-800/50 last:border-0 flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="text-lg font-bold text-slate-800 dark:text-slate-200 transition-colors line-clamp-1">
                            <Highlight text={post.title} query={searchQuery} />
                          </h4>
                          {post.date && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded-md shrink-0 mt-1">
                              {post.date.split(' ')[0]}
                            </span>
                          )}
                        </div>

                        {post.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            <Highlight text={post.description} query={searchQuery} />
                          </p>
                        )}

                        {post.tags && post.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {post.tags.map(tag => (
                              <span key={tag} className="flex items-center text-[10px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-md">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-0.5 opacity-60">
                                  <line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line>
                                </svg>
                                <Highlight text={tag} query={searchQuery} />
                              </span>
                            ))}
                          </div>
                        )}
                      </Link>
                    ))}
                    {results.posts.length > GROUP_LIMIT && (
                      <div className="px-6 py-2 text-[11px] text-slate-400 dark:text-slate-500">
                        还有 {results.posts.length - GROUP_LIMIT} 篇匹配的文章…
                      </div>
                    )}
                  </>
                )}

                {/* ── 📁 资源分享 ── */}
                {results.resources.length > 0 && (
                  <>
                    <div className={groupTitle}>
                      <span>资源分享</span>
                      <span className="text-slate-300 dark:text-slate-600">{results.resources.length}</span>
                    </div>
                    {results.resources.slice(0, GROUP_LIMIT).map((item) => (
                      <Link
                        href={resourceHref(item.path)}
                        key={item.path}
                        onClick={() => setIsOpen(false)}
                        className="px-6 py-3 hover:bg-emerald-50/80 dark:hover:bg-emerald-500/10 transition-colors flex items-center gap-3"
                      >
                        <span className="w-8 h-8 shrink-0 rounded-lg bg-emerald-100/70 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm">
                          📁
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                            <Highlight text={item.fileName} query={searchQuery} />
                          </span>
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                            {item.title && item.title !== item.fileName.replace(/\.md$/i, '') ? (
                              <>
                                <Highlight text={item.title} query={searchQuery} />
                                {item.folder ? ' · ' : ''}
                              </>
                            ) : null}
                            {item.folder}
                          </span>
                        </span>
                      </Link>
                    ))}
                    {results.resources.length > GROUP_LIMIT && (
                      <div className="px-6 py-2 text-[11px] text-slate-400 dark:text-slate-500">
                        还有 {results.resources.length - GROUP_LIMIT} 个匹配的文件…
                      </div>
                    )}
                  </>
                )}

                {/* ── 🚀 项目 ── */}
                {results.projects.length > 0 && (
                  <>
                    <div className={groupTitle}>
                      <span>项目</span>
                      <span className="text-slate-300 dark:text-slate-600">{results.projects.length}</span>
                    </div>
                    {results.projects.slice(0, GROUP_LIMIT).map((project) => (
                      <Link
                        href="/projects"
                        key={project.id}
                        onClick={() => setIsOpen(false)}
                        className="px-6 py-3 hover:bg-indigo-50/80 dark:hover:bg-indigo-500/10 transition-colors flex items-center gap-3"
                      >
                        <span className="w-8 h-8 shrink-0 rounded-lg bg-indigo-100/70 dark:bg-indigo-500/15 flex items-center justify-center text-sm">
                          {project.icon || '🚀'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                            <Highlight text={project.name} query={searchQuery} />
                          </span>
                          {project.description && (
                            <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                              <Highlight text={project.description} query={searchQuery} />
                            </span>
                          )}
                        </span>
                      </Link>
                    ))}
                    {results.projects.length > GROUP_LIMIT && (
                      <div className="px-6 py-2 text-[11px] text-slate-400 dark:text-slate-500">
                        还有 {results.projects.length - GROUP_LIMIT} 个匹配的项目…
                      </div>
                    )}
                  </>
                )}

              </div>
            ) : (
              <div className="px-6 py-12 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-slate-400">
                    <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-medium">
                  数据海中未发现关于 "<span className="text-indigo-500 font-bold">{searchQuery}</span>" 的踪迹
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
