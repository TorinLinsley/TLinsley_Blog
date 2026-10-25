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

function normPath(p: string) {
  let t = p || '';
  try { t = decodeURIComponent(t); } catch {  }
  return t.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.md$/i, '');
}

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

let expandedMemory: Set<string> | null = null;
let listScrollMemory = 0;
let seenFoldersMemory: Set<string> | null = null;

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

  useEffect(() => {
    const el = listRef.current;
    if (el && listScrollMemory > 0) el.scrollTop = listScrollMemory;
  }, []);

  useEffect(() => {
    expandedMemory = expanded;
  }, [expanded]);
  const [tip, setTip] = useState<HoverTipState>(null);

  useEffect(() => {
    const { all, autoOpen } = collectFolders(tree);
    setExpanded(prev => {
      const next = new Set(prev);
      autoOpen.forEach(p => { if (!seenFolders.current.has(p)) next.add(p); });
      return next;
    });
    seenFolders.current = all;
    seenFoldersMemory = all;
  }, [tree]);

  useEffect(() => {
    if (!selectedPath) return;
    const chain = ancestorsOf(tree, selectedPath);
    if (!chain.length) return;
    setExpanded(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const p of chain) {
        if (!next.has(p)) {
          next.add(p);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedPath, tree]);

  const scrolledForRef = useRef('');
  useEffect(() => {
    if (!selectedPath || scrolledForRef.current === selectedPath) return;
    const id = requestAnimationFrame(() => {
      const el = listRef.current?.querySelector('[data-res-selected="1"]');
      if (!el) return;
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

      <HoverTip tip={tip} />
    </div>
  );
}