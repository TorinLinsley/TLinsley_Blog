"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FileText,
  CheckSquare,
  Pencil,
  Trash2,
  Flame,
  FilePlus2,
  FolderPlus,
  X as XIcon,
  RotateCcw,
} from 'lucide-react';
import IconButton from './IconButton';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
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

export function topLevelPaths(paths: string[]): string[] {
  return paths.filter((p) => !paths.some((other) => other !== p && p.startsWith(other + '/')));
}

function nodeByPath(nodes: ResourceNode[], path: string): ResourceNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const hit = nodeByPath(n.children, path);
      if (hit) return hit;
    }
  }
  return null;
}

function escapeAttr(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

let expandedMemory: Set<string> | null = null;
let listScrollMemory = 0;
let seenFoldersMemory: Set<string> | null = null;

export default function ResourceTree({
  tree,
  selectedPath,
  selection,
  onSelectionChange,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onMove,
  getDefaultName,
  onOpenTrash,
  onUndo,
  trashCount,
}: {
  tree: ResourceNode[];
  selectedPath: string;
  selection: string[];
  onSelectionChange: (paths: string[]) => void;
  onSelect: (path: string) => void;
  onCreate: (parent: string, type: 'article' | 'folder', name: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (paths: string[], permanent?: boolean) => void;
  onMove: (paths: string[], target: string) => void;
  getDefaultName: (parent: string, type: 'article' | 'folder') => string;
  onOpenTrash: () => void;
  onUndo: () => void;
  trashCount: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => expandedMemory ?? collectFolders(tree).autoOpen);
  const [renaming, setRenaming] = useState<{ path: string; session: number } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el && listScrollMemory > 0) el.scrollTop = listScrollMemory;
  }, []);

  useEffect(() => { expandedMemory = expanded; }, [expanded]);

  const sessionRef = useRef(0);
  const renamingRef = useRef<{ path: string; session: number } | null>(null);

  const beginRename = (path: string, value: string) => {
    const next = { path, session: (sessionRef.current += 1) };
    renamingRef.current = next;
    setRenaming(next);
    setRenameValue(value);
  };

  const endRename = (session: number) => {
    if (renamingRef.current?.session !== session) return;
    renamingRef.current = null;
    setRenaming(null);
  };

  const rootRef = useRef<HTMLDivElement>(null);

  const [tip, setTip] = useState<HoverTipState>(null);

  const rows = useMemo(() => {
    const out: { node: ResourceNode; depth: number; parent: string }[] = [];
    const walk = (nodes: ResourceNode[], depth: number, parent: string) => {
      for (const n of nodes) {
        out.push({ node: n, depth, parent });
        if (n.type === 'folder' && expanded.has(n.path) && n.children && n.children.length) {
          walk(n.children, depth + 1, n.path);
        }
      }
    };
    walk(tree, 0, '');
    return out;
  }, [tree, expanded]);

  const rowOf = (path: string) => rows.find((r) => r.node.path === path);

  const anchorRef = useRef<string>('');
  const activeParentRef = useRef<string>('');

  const selectAll = () => {
    const parent = activeParentRef.current;
    const level = rows.filter((r) => r.parent === parent).map((r) => r.node.path);
    if (level.length) {
      onSelectionChange(level);
      return;
    }
    const children = parent ? nodeByPath(tree, parent)?.children ?? [] : tree;
    if (parent) setExpanded((prev) => new Set(prev).add(parent));
    onSelectionChange(children.map((c) => c.path));
  };

  const toggleExpanded = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleRowClick = (node: ResourceNode, e: React.MouseEvent) => {
    rootRef.current?.focus();
    activeParentRef.current = rowOf(node.path)?.parent ?? '';

    if (e.ctrlKey || e.metaKey) {
      const base = selection.length ? [...selection] : selectedPath ? [selectedPath] : [];
      const next = base.includes(node.path) ? base.filter((p) => p !== node.path) : [...base, node.path];
      anchorRef.current = node.path;
      onSelectionChange(next);
      return;
    }

    if (e.shiftKey) {
      const anchor = anchorRef.current ? rowOf(anchorRef.current) : undefined;
      const here = rowOf(node.path);
      if (anchor && here && anchor.parent === here.parent) {
        const siblings = rows.filter((r) => r.parent === anchor.parent);
        const i = siblings.findIndex((r) => r.node.path === anchor.node.path);
        const j = siblings.findIndex((r) => r.node.path === here.node.path);
        const [lo, hi] = i <= j ? [i, j] : [j, i];
        onSelectionChange(siblings.slice(lo, hi + 1).map((r) => r.node.path));
        return;
      }
      anchorRef.current = node.path;
      onSelectionChange([node.path]);
      return;
    }

    anchorRef.current = node.path;
    onSelectionChange([node.path]);
    if (node.type === 'folder') toggleExpanded(node.path);
    else onSelect(node.path);
  };

  const handleBlankClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-resource-row]')) return;
    activeParentRef.current = '';
    onSelectionChange([]);
    rootRef.current?.focus();
  };

  const dragPathsRef = useRef<string[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const canDropInto = (paths: string[], target: string) => {
    const list = topLevelPaths(paths);
    if (!list.length) return false;
    return list.every((p) => {
      const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
      if (parent === target) return false;
      if (target === p || target.startsWith(p + '/')) return false;
      return true;
    });
  };

  const beginDrag = (node: ResourceNode, e: React.DragEvent) => {
    const inSelection = selection.includes(node.path);
    const paths = inSelection ? selection : [node.path];
    const list = topLevelPaths(paths);
    if (!inSelection) {
      anchorRef.current = node.path;
      onSelectionChange([node.path]);
    }
    dragPathsRef.current = list;
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', list.join('\n'));
    } catch {
    }
  };

  const endDrag = () => {
    dragPathsRef.current = [];
    setDropTarget(null);
  };

  const dropInto = (target: string) => {
    const list = dragPathsRef.current;
    dragPathsRef.current = [];
    setDropTarget(null);
    if (canDropInto(list, target)) onMove(list, target);
  };

  const [menu, setMenu] = useState<{ x: number; y: number; paths: string[]; node: ResourceNode | null } | null>(null);

  const openMenu = (e: React.MouseEvent, node: ResourceNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    rootRef.current?.focus();
    let paths: string[] = [];
    if (node) {
      activeParentRef.current = rowOf(node.path)?.parent ?? '';
      paths = selection.includes(node.path) ? selection : [node.path];
      if (!selection.includes(node.path)) {
        anchorRef.current = node.path;
        onSelectionChange(paths);
      }
    } else {
      activeParentRef.current = '';
    }
    setMenu({ x: e.clientX, y: e.clientY, paths, node });
  };

  const [confirming, setConfirming] = useState<{
    paths: string[];
    label: string;
    isFolder: boolean;
    permanent: boolean;
    above: boolean;
    top?: number;
    bottom?: number;
    anchor: string;
  } | null>(null);

  const askDelete = (paths: string[], anchorPath: string, permanent = false) => {
    const list = topLevelPaths(paths).filter(Boolean);
    if (!list.length) return;
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const rowEl = rootEl.querySelector(
      `[data-resource-row][data-path="${escapeAttr(anchorPath)}"]`
    ) as HTMLElement | null;
    if (!rowEl) return;

    const rootRect = rootEl.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    const rowTop = rowRect.top - rootRect.top;
    const rowBottom = rowRect.bottom - rootRect.top;

    const POP_H = 54;
    const above = rowTop - POP_H - 6 >= 2;

    const anchorNode = nodeByPath(tree, anchorPath);
    const isFolder = list.length === 1 && anchorNode?.type === 'folder';
    const label = list.length > 1 ? `${list.length} 个项目` : `「${anchorNode?.name ?? ''}」`;

    setConfirming({
      paths: list,
      label,
      isFolder,
      permanent,
      above,
      bottom: above ? rootRect.height - rowTop + 6 : undefined,
      top: above ? undefined : rowBottom + 6,
      anchor: anchorPath,
    });
  };

  const doDelete = () => {
    if (!confirming) return;
    const list = confirming.paths;
    const permanent = confirming.permanent;
    setConfirming(null);
    onDelete(list, permanent);
  };

  useEffect(() => {
    if (!confirming) return;
    const close = () => setConfirming(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [confirming]);

  const seenFolders = useRef<Set<string>>(new Set(seenFoldersMemory ?? []));
  useEffect(() => {
    const { all, autoOpen } = collectFolders(tree);
    setExpanded((prev) => {
      const next = new Set(prev);
      autoOpen.forEach((p) => {
        if (!seenFolders.current.has(p)) next.add(p);
      });
      return next;
    });
    seenFolders.current = all;
    seenFoldersMemory = all;
  }, [tree]);

  useEffect(() => {
    if (!selectedPath) return;
    const chain = ancestorsOf(tree, selectedPath);
    if (!chain.length) return;
    setExpanded((prev) => {
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

  const [pending, setPending] = useState<{
    id: number;
    parent: string;
    type: 'article' | 'folder';
    value: string;
  } | null>(null);
  const pendingRef = useRef<typeof pending>(null);
  const pendingSeq = useRef(0);

  const beginCreate = (parent: string, type: 'article' | 'folder') => {
    if (parent) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(parent);
        return next;
      });
    }
    const next = {
      id: (pendingSeq.current += 1),
      parent,
      type,
      value: getDefaultName(parent, type),
    };
    pendingRef.current = next;
    setPending(next);
  };

  const commitPending = (id: number) => {
    const cur = pendingRef.current;
    if (!cur || cur.id !== id) return;
    const value = cur.value.trim();
    pendingRef.current = null;
    setPending(null);
    if (value) onCreate(cur.parent, cur.type, value);
  };

  const cancelPending = (id: number) => {
    if (pendingRef.current?.id !== id) return;
    pendingRef.current = null;
    setPending(null);
  };

  const renderPendingRow = (depth: number) => {
    if (!pending) return null;
    const isFolderPending = pending.type === 'folder';
    return (
      <div
        className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 bg-white/60 dark:bg-slate-700/40 border border-indigo-400/50"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span className="w-[14px] shrink-0" />
        {isFolderPending ? (
          <Folder size={14} className="shrink-0 opacity-70" />
        ) : (
          <FileText size={14} className="shrink-0 opacity-70" />
        )}
        <input
          autoFocus
          value={pending.value}
          onChange={(e) => {
            const updated = { ...pending, value: e.target.value };
            pendingRef.current = updated;
            setPending(updated);
          }}
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitPending(pending.id);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelPending(pending.id);
            }
          }}
          onBlur={() => commitPending(pending.id)}
          className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-indigo-400 rounded-lg px-2 py-0.5 text-base outline-none text-slate-800 dark:text-slate-100"
        />
      </div>
    );
  };

  const startRename = (node: ResourceNode) => {
    beginRename(node.path, node.name);
  };

  const commitRename = (session: number) => {
    const current = renamingRef.current;
    if (!current || current.session !== session) return;
    const target = current.path;
    const value = renameValue.trim();
    renamingRef.current = null;
    setRenaming(null);
    if (value) onRename(target, value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    if (confirming) {
      if (e.key === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        doDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setConfirming(null);
      }
      return;
    }

    if (e.key === 'Delete') {
      const list = topLevelPaths(selection);
      if (list.length) {
        e.preventDefault();
        askDelete(list, list[0], e.shiftKey);
      }
      return;
    }
    if (e.key === 'F2' && selection.length === 1) {
      const node = nodeByPath(tree, selection[0]);
      if (node) {
        e.preventDefault();
        startRename(node);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      onUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      selectAll();
      return;
    }
    if (e.key === 'Escape') {
      onSelectionChange([]);
    }
  };

  const TopButton = ({
    icon,
    Icon,
    label,
    onClick,
    badge,
  }: {
    icon?: string;
    Icon?: React.ComponentType<{ size?: number | string; className?: string }>;
    label: string;
    onClick: () => void;
    badge?: number;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-white/40 dark:border-white/10 text-slate-700 dark:text-slate-200 text-base font-bold shadow-sm transition-colors duration-200 hover:bg-white/80 dark:hover:bg-slate-700/60"
    >
      {Icon ? (
        <Icon size={14} className="shrink-0" />
      ) : (
        <span
          className="shrink-0 bg-black dark:bg-white"
          style={{
            width: 14,
            height: 14,
            WebkitMaskImage: `url(${icon})`,
            maskImage: `url(${icon})`,
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
          }}
        />
      )}
      {label}
      {typeof badge === 'number' && badge > 0 && (
        <span className="shrink-0 min-w-[16px] px-1 rounded-full bg-indigo-500 text-white text-sm font-black leading-[16px] text-center">
          {badge}
        </span>
      )}
    </button>
  );

  const menuItems: ContextMenuItem[] = useMemo(() => {
    if (!menu) return [];
    const items: ContextMenuItem[] = [];
    const node = menu.node;
    const multi = menu.paths.length > 1;

    if (node) {
      const isFolder = node.type === 'folder';
      const isOpen = expanded.has(node.path);

      if (!multi && !isFolder) {
        items.push({
          key: 'open',
          label: '打开',
          icon: FileText,
          shortcut: 'Enter',
          onClick: () => onSelect(node.path),
        });
      }
      if (!multi && isFolder) {
        items.push({
          key: 'toggle',
          label: isOpen ? '折叠' : '展开',
          icon: isOpen ? ChevronDown : ChevronRight,
          onClick: () => toggleExpanded(node.path),
        });
      }
      if (!multi || isFolder) {
        items.push({
          key: 'new-article',
          label: '新建文章',
          icon: FilePlus2,
          onClick: () => beginCreate(isFolder ? node.path : node.path.split('/').slice(0, -1).join('/'), 'article'),
        });
        items.push({
          key: 'new-folder',
          label: '新建文件夹',
          icon: FolderPlus,
          onClick: () => beginCreate(isFolder ? node.path : node.path.split('/').slice(0, -1).join('/'), 'folder'),
        });
      }
      if (multi) {
        items.push({
          key: 'select-all',
          label: '全选本层',
          icon: CheckSquare,
          shortcut: 'Ctrl+A',
          onClick: selectAll,
        });
        items.push({
          key: 'clear-selection',
          label: '取消选择',
          icon: XIcon,
          shortcut: 'Esc',
          onClick: () => onSelectionChange([]),
        });
      }
      items.push({ kind: 'separator' });
      items.push({
        key: 'rename',
        label: '重命名',
        icon: Pencil,
        shortcut: 'F2',
        disabled: multi,
        onClick: () => startRename(node),
      });
      items.push({
        key: 'delete',
        label: multi ? `删除 ${menu.paths.length} 项` : '删除',
        icon: Trash2,
        shortcut: 'Delete',
        danger: true,
        onClick: () => askDelete(menu.paths, node.path, false),
      });
      items.push({
        key: 'delete-permanent',
        label: multi ? `永久删除 ${menu.paths.length} 项` : '永久删除',
        icon: Flame,
        shortcut: 'Shift+Delete',
        danger: true,
        onClick: () => askDelete(menu.paths, node.path, true),
      });
    } else {
      items.push({ key: 'new-article', label: '新建文章', icon: FilePlus2, onClick: () => beginCreate('', 'article') });
      items.push({ key: 'new-folder', label: '新建文件夹', icon: FolderPlus, onClick: () => beginCreate('', 'folder') });
      items.push({ kind: 'separator' });
      items.push({ key: 'select-all', label: '全选本层', icon: CheckSquare, shortcut: 'Ctrl+A', onClick: selectAll });
      if (selection.length) {
        items.push({
          key: 'clear-selection',
          label: '取消选择',
          icon: XIcon,
          shortcut: 'Esc',
          onClick: () => onSelectionChange([]),
        });
      }
      items.push({ kind: 'separator' });
      items.push({ key: 'trash', label: '打开回收站', icon: RotateCcw, onClick: onOpenTrash });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, expanded, selection, tree]);

  const renderNodes = (nodes: ResourceNode[], depth: number) =>
    nodes.map((node) => {
      const isFolder = node.type === 'folder';
      const isOpen = isFolder && expanded.has(node.path);
      const inSelection = selection.includes(node.path);
      const isOpened = node.path === selectedPath;
      const isRenaming = renaming?.path === node.path;
      const isDropTarget = dropTarget === node.path;

      return (
        <div key={node.path}>
          <div
            data-resource-row
            data-path={node.path}
            data-res-selected={isOpened ? '1' : undefined}
            draggable={!isRenaming}
            onDragStart={(e) => beginDrag(node, e)}
            onDragEnd={endDrag}
            onDragOver={(e) => {
              if (!isFolder || !canDropInto(dragPathsRef.current, node.path)) return;
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              if (dropTarget !== node.path) setDropTarget(node.path);
            }}
            onDragLeave={(e) => {
              e.stopPropagation();
              if (dropTarget === node.path) setDropTarget(null);
            }}
            onDrop={(e) => {
              if (!isFolder) return;
              e.preventDefault();
              e.stopPropagation();
              dropInto(node.path);
            }}
            onClick={(e) => handleRowClick(node, e)}
            onContextMenu={(e) => openMenu(e, node)}
            className={`relative group flex items-center gap-1.5 rounded-xl px-2 py-1.5 cursor-pointer transition-colors duration-200 ${
              inSelection
                ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-200 font-bold'
                : isOpened
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/40'
            } ${isDropTarget ? 'ring-2 ring-indigo-400/80 ring-inset bg-indigo-500/15' : ''}`}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            {isFolder ? (
              isOpen ? (
                <ChevronDown size={14} className="shrink-0 opacity-70" />
              ) : (
                <ChevronRight size={14} className="shrink-0 opacity-70" />
              )
            ) : (
              <span className="w-[14px] shrink-0" />
            )}

            {isFolder ? <Folder size={14} className="shrink-0 opacity-70" /> : <FileText size={14} className="shrink-0 opacity-70" />}

            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename(renaming!.session);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    endRename(renaming!.session);
                  }
                }}
                onBlur={() => commitRename(renaming!.session)}
                className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-indigo-400 rounded-lg px-2 py-0.5 text-base outline-none text-slate-800 dark:text-slate-100"
              />
            ) : (
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
            )}

            {isOpened && !isRenaming && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500" />}

            {
}
            {!isRenaming && (
              <span className="flex items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                {isFolder && (
                  <>
                    <IconButton
                      icon="/plus.svg"
                      title="添加文章"
                      size={14}
                      onClick={(e) => {
                        e.stopPropagation();
                        beginCreate(node.path, 'article');
                      }}
                    />
                    <IconButton
                      icon="/new_folder.svg"
                      title="新建文件夹"
                      size={14}
                      onClick={(e) => {
                        e.stopPropagation();
                        beginCreate(node.path, 'folder');
                      }}
                    />
                  </>
                )}
                <IconButton
                  icon="/rename.svg"
                  title="重命名"
                  size={14}
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(node);
                  }}
                />
                <IconButton
                  icon="/delete.svg"
                  title="删除（可在回收站还原）"
                  size={14}
                  onClick={(e) => {
                    e.stopPropagation();
                    askDelete(inSelection ? topLevelPaths(selection) : [node.path], node.path);
                  }}
                />
              </span>
            )}
          </div>

          {isFolder && isOpen && (
            <div>
              {node.children && node.children.length > 0 && renderNodes(node.children, depth + 1)}
              {pending?.parent === node.path && renderPendingRow(depth + 1)}
            </div>
          )}
        </div>
      );
    });

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => openMenu(e, null)}
      className="relative flex flex-col gap-3 h-full min-h-0 outline-none"
    >
      <div className="flex flex-col gap-2 px-3 pt-3">
        <h3 className="shrink-0 font-black text-slate-900 dark:text-white text-base uppercase tracking-widest border-l-4 border-indigo-500 ml-2 pl-2 mb-1">
          Article List <span className="opacity-40 mx-0.5">|</span> <span className="tracking-normal">文章列表</span>
        </h3>
        <TopButton icon="/plus.svg" label="添加文章" onClick={() => beginCreate('', 'article')} />
        <TopButton icon="/new_folder.svg" label="新建文件夹" onClick={() => beginCreate('', 'folder')} />
        <TopButton Icon={Trash2} label="回收站" onClick={onOpenTrash} badge={trashCount} />
      </div>

      <div
        data-tree-scroll
        ref={listRef}
        onScroll={(e) => { listScrollMemory = e.currentTarget.scrollTop; }}
        onClick={handleBlankClick}
        onDragOver={(e) => {
          if (!canDropInto(dragPathsRef.current, '')) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          if (dropTarget !== '') setDropTarget('');
        }}
        onDragLeave={(e) => {
          if (dropTarget === '') setDropTarget(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dropInto('');
        }}
        className={`flex-1 overflow-y-auto px-2 pb-3 custom-scrollbar rounded-2xl transition-colors duration-200 ${
          dropTarget === '' ? 'ring-2 ring-indigo-400/70 ring-inset bg-indigo-500/5' : ''
        }`}
      >
        {tree.length === 0 && pending?.parent !== '' ? (
          <div className="px-3 py-6 text-center text-[15px] text-slate-400">还没有内容，用上面的按钮新建吧</div>
        ) : (
          <>
            {renderNodes(tree, 0)}
            {pending?.parent === '' && renderPendingRow(0)}
          </>
        )}
      </div>

      {confirming && (
        <motion.div
          key={confirming.anchor + confirming.paths.length + (confirming.permanent ? '-p' : '-t')}
          initial={{ opacity: 0, y: confirming.above ? 6 : -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.08, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          style={{ left: 10, right: 10, top: confirming.top, bottom: confirming.bottom }}
          className={`absolute z-50 flex items-center gap-1.5 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl border shadow-2xl px-2.5 py-2 ${
            confirming.permanent ? 'border-red-400/70 dark:border-red-500/50' : 'border-white/50 dark:border-white/10'
          }`}
        >
          <p className="flex-1 min-w-0 truncate text-[15px] font-bold text-slate-700 dark:text-slate-200">
            {confirming.permanent ? '永久删除 ' : '删除 '}
            {confirming.label}？
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(null);
            }}
            className="shrink-0 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[15px] font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            取消
          </button>
          <button
            title={
              confirming.permanent
                ? '永久删除：不进项目回收站，也不进系统回收站，删掉就找不回来了'
                : confirming.isFolder
                  ? '文件夹里的内容会一起进回收站，之后可以还原'
                  : '会在回收站里，之后可以还原'
            }
            onClick={(e) => {
              e.stopPropagation();
              doDelete();
            }}
            className={`shrink-0 px-2.5 py-1 rounded-xl text-white text-[15px] font-black transition-colors ${
              confirming.permanent
                ? 'bg-red-600 shadow-lg shadow-red-600/40 hover:bg-red-700'
                : 'bg-red-500 shadow-lg shadow-red-500/30 hover:bg-red-600'
            }`}
          >
            {confirming.permanent ? '永久删除' : '删除'}
          </button>
        </motion.div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

      <HoverTip tip={tip} />
    </div>
  );
}