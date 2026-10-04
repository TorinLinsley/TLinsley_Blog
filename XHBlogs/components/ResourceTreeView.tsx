"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';
import HoverTip, { HoverTipState } from './HoverTip';

export type ResourceNode = {
  type: 'folder' | 'article';
  name: string;
  path: string;
  fileName?: string;
  children?: ResourceNode[];
};

/**
 * 收集文件夹路径，分两份：
 *   · all      —— 所有文件夹（用来记"见过哪些"，决定"新出现的"要不要自动展开）
 *   · autoOpen —— **默认展开**的那些：自己**和每一层祖辈**的名字开头都**不是** "-" 的 ✓
 *
 * 📁 约定：文件夹名字以 "-" 开头 → **默认收起**（内容先藏着）；
 *    其它一律默认展开。名字本身不改、路径也不动，只影响初始的展开状态 ✓
 *
 * 🎯 但"默认展开"只对**祖辈里一个 "-" 都没有**的目录生效：
 *    · 顶层 `1资源分享` / `2疑难解答` / `3笔记分享（多篇型）`（没有带 "-" 的祖辈）→ 仍然默认展开 ✓
 *    · `-Java程序设计语言`（自己带 "-"）→ 默认收起 ✓
 *    · `-Java程序设计语言/01-基础`、`.../02-流程控制`（祖辈带 "-"）→ **不再默认展开** ✓
 *    这样"按文章路径展开祖先链"时，同一章里的兄弟目录（02-流程控制…）不会顺着一起露出来 ——
 *    跳转只展开该文章那一路 ✓
 */
function collectFolders(nodes: ResourceNode[]) {
  const all = new Set<string>();
  const autoOpen = new Set<string>();
  const walk = (list: ResourceNode[], blocked: boolean) => {
    for (const n of list) {
      if (n.type !== 'folder') continue;
      all.add(n.path);
      const dashed = blocked || n.name.startsWith('-');
      if (!dashed) autoOpen.add(n.path);
      if (n.children) walk(n.children, dashed);
    }
  };
  walk(nodes, false);
  return { all, autoOpen };
}

/**
 * 🔑 路径规范化：选中路径可能带 URI 编码、反斜杠、结尾 .md、首尾斜杠，而树里的 path 是原样的，
 * 直接比较容易差一点点对不上。统一成这样再比（不硬 split）✓
 */
function normPath(p: string) {
  let t = p || '';
  try { t = decodeURIComponent(t); } catch { /* 解不开就按原样 */ }
  return t.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.md$/i, '');
}

/**
 * 📌 找出「当前打开的那篇文章」在树里经过的所有**祖先文件夹**（外层 → 内层，正好是"依次展开"的顺序）。
 * 只沿这一条链走，别的分支一个都不碰 —— 它不在的子文件夹不会被顺手展开 ✓
 * 找不到（树还没加载 / 路径对不上）就返回空数组，调用方什么都不做。
 */
function ancestorsOf(nodes: ResourceNode[], selectedPath: string): string[] {
  const target = normPath(selectedPath);
  if (!target) return [];
  const walk = (list: ResourceNode[], trail: string[]): string[] | null => {
    for (const n of list) {
      if (n.type === 'folder') {
        const hit = n.children ? walk(n.children, [...trail, n.path]) : null;
        if (hit) return hit;
      } else if (normPath(n.path) === target) {
        return trail;
      }
    }
    return null;
  };
  return walk(nodes, []) ?? [];
}

/**
 * 这两个状态放在组件外面。
 *
 * 资源页是 [[...path]] 动态路由：在它下面点文章时，Next 会把整棵子树卸载重建，
 * 组件内的 state 活不过去 —— 表现就是「点一下文章，我刚折叠的文件夹又全展开了、
 * 列表还滚回了顶部」。存到模块作用域里，重挂载时读回来即可；
 * 刷新页面时模块重新初始化，回到默认（名字不带 "-" 的展开、带 "-" 的收起、滚到顶部）。
 */
let expandedMemory: Set<string> | null = null;
let listScrollMemory = 0;
// 「已经见过哪些文件夹」也要一起记：否则重挂载后 seenFolders 是空的，
// 下面那段「自动展开新出现的文件夹」会把用户刚折叠的文件夹又当成新的、全部展开回去。
let seenFoldersMemory: Set<string> | null = null;

/** 只读版资源树：前台访客看不到任何编辑按钮，只有链接 */
export default function ResourceTreeView({
  tree,
  selectedPath,
}: {
  tree: ResourceNode[];
  selectedPath: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => expandedMemory ?? collectFolders(tree).autoOpen);
  const seenFolders = useRef<Set<string>>(seenFoldersMemory ?? new Set<string>());
  const listRef = useRef<HTMLDivElement>(null);

  // 重挂载后把列表的滚动位置放回去（否则会跳回顶部）
  useEffect(() => {
    const el = listRef.current;
    if (el && listScrollMemory > 0) el.scrollTop = listScrollMemory;
  }, []);

  useEffect(() => {
    expandedMemory = expanded;
  }, [expanded]);
  // 💬 悬停提示：列表不够宽、名称被截断时，悬停显示完整名称
  const [tip, setTip] = useState<HoverTipState>(null);

  useEffect(() => {
    const { all, autoOpen } = collectFolders(tree);
    setExpanded(prev => {
      const next = new Set(prev);
      // 只自动展开"该展开的"新文件夹；名字以 "-" 开头的新的也保持收起 ✓
      autoOpen.forEach(p => { if (!seenFolders.current.has(p)) next.add(p); });
      return next;
    });
    seenFolders.current = all;
    seenFoldersMemory = all;
  }, [tree]);

  // 📌 从别处（首页卡片 / 搜索结果 / 正文超链接 / 收藏的链接 / 刷新）跳进某一篇文章时，
  //    把它经过的每一层文件夹**依次展开**，让它在左边列表里看得见并保持高亮。
  //    ⚠️ 只加不删（合并）：只是把这条链**并进**展开集合，绝不收起任何东西 ——
  //       默认展开规则（名字不以 - 开头 → 默认展开，见 collectFolders）照旧生效，
  //       用户手动展开过的目录、以及它不在的子文件夹也一律保持原样 ✓
  //       所以"直接点开资源分享界面"（URL 里没有具体文章名）时，看到的还是原来那套
  //       （资源分享 / 疑难解答 / 笔记分享 默认就是展开的）。
  //    本 effect 只在 selectedPath / tree 真变化时才跑一次，不是每帧重置 ✓
  useEffect(() => {
    if (!selectedPath) return;
    const chain = ancestorsOf(tree, selectedPath);
    if (!chain.length) return;   // 树还没加载 / 路径对不上：什么都不做
    setExpanded(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const p of chain) {
        if (!next.has(p)) {
          next.add(p);
          changed = true;
        }
      }
      return changed ? next : prev;   // 没有变化就原样返回，少渲染一次
    });
  }, [selectedPath, tree]);

  // 🔎 上面展开之后，把选中那一行滚进可视范围。
  //    block:'nearest' —— 已经看得见就一动不动（不会抖）；同一篇文章只滚这一次，
  //    之后用户自己收起/展开别的文件夹时不会被强行拉回去。
  const scrolledForRef = useRef('');
  useEffect(() => {
    if (!selectedPath || scrolledForRef.current === selectedPath) return;
    const id = requestAnimationFrame(() => {
      const el = listRef.current?.querySelector('[data-res-selected="1"]');
      if (!el) return;                       // 行还没渲染出来（等下一次展开后的重渲染再试）
      el.scrollIntoView({ block: 'nearest' });
      scrolledForRef.current = selectedPath;
    });
    return () => cancelAnimationFrame(id);
  }, [selectedPath, expanded]);

  const toggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNodes = (nodes: ResourceNode[], depth: number) =>
    nodes.map(node => {
      const isFolder = node.type === 'folder';
      const isOpen = isFolder && expanded.has(node.path);
      const isSelected = !isFolder && node.path === selectedPath;

      const rowClass = `flex items-center gap-1.5 rounded-xl px-2 py-1.5 transition-colors duration-200 ${
        isSelected
          ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-bold'
          : 'text-slate-700 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/40'
      }`;

      const inner = (
        <>
          {isFolder ? (
            isOpen ? <ChevronDown size={14} className="shrink-0 opacity-70" /> : <ChevronRight size={14} className="shrink-0 opacity-70" />
          ) : (
            <span className="w-[14px] shrink-0" />
          )}
          {isFolder
            ? <Folder size={14} className="shrink-0 opacity-70" />
            : <FileText size={14} className="shrink-0 opacity-70" />}
          <span
            className="flex-1 min-w-0 truncate text-base font-bold"
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              // 只有真的被截断了才提示（名称太长 + 列表宽度不够）
              if (el.scrollWidth > el.clientWidth + 1) {
                const r = el.getBoundingClientRect();
                setTip({ text: node.name, x: r.left, y: r.bottom + 6 });
              }
            }}
            onMouseLeave={() => setTip(null)}
          >
            {node.name}
          </span>
        </>
      );

      return (
        <div key={node.path}>
          {isFolder ? (
            <div onClick={() => toggle(node.path)} className={`${rowClass} cursor-pointer`} style={{ paddingLeft: 8 + depth * 12 }}>
              {inner}
            </div>
          ) : (
            <Link href={`/resources/${encodeURI(node.path)}`} data-res-selected={isSelected ? '1' : undefined} className={`${rowClass} cursor-pointer`} style={{ paddingLeft: 8 + depth * 12 }}>
              {inner}
            </Link>
          )}

          {isFolder && isOpen && node.children && node.children.length > 0 && (
            <div>{renderNodes(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });

  return (
    <div className="flex flex-col h-full min-h-0">
      <h3 className="shrink-0 font-black text-slate-900 dark:text-white text-base uppercase tracking-widest border-l-4 border-indigo-500 ml-5 pl-2 mt-5 mb-3">
        Article List <span className="opacity-40 mx-0.5">|</span> <span className="tracking-normal">文章列表</span>
      </h3>
      <div
        ref={listRef}
        onScroll={(e) => { listScrollMemory = e.currentTarget.scrollTop; }}
        className="flex-1 overflow-y-auto px-2 pb-3 custom-scrollbar"
      >
        {tree.length === 0 ? (
          <div className="px-3 py-6 text-center text-[15px] text-slate-400">暂无资源</div>
        ) : (
          renderNodes(tree, 0)
        )}
      </div>

      {/* 💬 名称被截断时的悬停提示 */}
      <HoverTip tip={tip} />
    </div>
  );
}
