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

/** 去掉「被别的选中项包住」的路径。
 *  例：同时选了文件夹 A 和它里面的 A/b.md，实际操作只需要 A。 */
export function topLevelPaths(paths: string[]): string[] {
  return paths.filter((p) => !paths.some((other) => other !== p && p.startsWith(other + '/')));
}

/** 一个路径是不是文件夹（在树里查） */
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

/**
 * 📱 这几个状态放在组件**外面**（和前台 components/ResourceTreeView.tsx 一模一样的做法）。
 *
 * 手机端那两栏是抽屉：关掉就卸载、打开再挂载，组件内的 state 活不过去 ——
 * 表现就是「我明明展开过某个文件夹，收起抽屉再打开，它又缩回去了，每次都得重新点」✗
 * 存到模块作用域：抽屉开合之间保留 ✓，**刷新页面**时模块重新初始化 → 回到默认
 * （名字不带 "-" 的展开、带 "-" 的收起、列表回到顶部）—— 和前台行为完全一致。
 */
let expandedMemory: Set<string> | null = null;
let listScrollMemory = 0;
// 「已经见过哪些文件夹」也要一起记：否则重挂载后 seenFolders 是空的，
// 下面那段「自动展开新出现的文件夹」会把用户刚折叠的又当成新的、全部展开回去 ✗
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
  /** 当前正在打开的那篇文章 */
  selectedPath: string;
  /** 多选：被选中的所有路径（包含正在打开的那篇） */
  selection: string[];
  onSelectionChange: (paths: string[]) => void;
  onSelect: (path: string) => void;
  /** 用户在列表里敲定名字后才回调，真正创建文件 */
  onCreate: (parent: string, type: 'article' | 'folder', name: string) => void;
  onRename: (path: string, newName: string) => void;
  /** 删除：默认移进回收站（可 Ctrl+Z 撤回）；permanent=true 时是永久删除 */
  onDelete: (paths: string[], permanent?: boolean) => void;
  /** 拖拽移动：paths 移到 target 文件夹里（target 为 '' 表示总目录） */
  onMove: (paths: string[], target: string) => void;
  /** 由页面根据当前目录内容算出一个不冲突的默认名 */
  getDefaultName: (parent: string, type: 'article' | 'folder') => string;
  onOpenTrash: () => void;
  /** Ctrl+Z：撤回上一次删除（按一次撤一次） */
  onUndo: () => void;
  trashCount: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => expandedMemory ?? collectFolders(tree).autoOpen);
  const [renaming, setRenaming] = useState<{ path: string; session: number } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // 列表容器：重挂载后把滚动位置放回去（抽屉一开一合不该跳回顶部）
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el && listScrollMemory > 0) el.scrollTop = listScrollMemory;
  }, []);

  // 展开状态记到模块作用域，供下次挂载读回（刷新页面自然清空 → 回默认）
  useEffect(() => { expandedMemory = expanded; }, [expanded]);

  // 🔑 会话号：每一轮命名都有独立编号。
  // 上一次输入框失焦（blur）时只能结束「自己那一轮」，
  // 否则它会误清掉刚刚新建那一行的命名状态 —— 表现为「点一次正常、点一次直接确认」。
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

  // 💬 悬停提示：列表不够宽、名称被截断时，悬停显示完整名称
  const [tip, setTip] = useState<HoverTipState>(null);

  // ─────────────────── 可见行（顺序是屏幕上看到的顺序） ───────────────────
  // Shift 连选要用它：只有同一层（同一个父文件夹）之间才会连选，
  // 不会跨层级乱选一通。
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
  /** 当前「聚焦」的层级：点某一行 → 那一行所在的层；点最外层空白 → 总目录层。
   *  Ctrl+A 只全选这一层，不会把别的层级的也一起圈进来。 */
  const activeParentRef = useRef<string>('');

  /** 只全选当前层级的项 */
  const selectAll = () => {
    const parent = activeParentRef.current;
    const level = rows.filter((r) => r.parent === parent).map((r) => r.node.path);
    if (level.length) {
      onSelectionChange(level);
      return;
    }
    // 这一层当前是收起来的：先展开它，再把里面的项全选
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

  // ─────────────────── 鼠标点击：单选 / Ctrl 多选 / Shift 连选 ───────────────────
  const handleRowClick = (node: ResourceNode, e: React.MouseEvent) => {
    rootRef.current?.focus();
    // 记住现在聚焦的是哪一层（Ctrl+A 只全选这一层）
    activeParentRef.current = rowOf(node.path)?.parent ?? '';

    // Ctrl（或 Mac 的 Cmd）：逐个加减。第一次按下时，把「正在打开的那篇文章」
    // 也一起纳入选择，这样它不会被漏掉。
    if (e.ctrlKey || e.metaKey) {
      const base = selection.length ? [...selection] : selectedPath ? [selectedPath] : [];
      const next = base.includes(node.path) ? base.filter((p) => p !== node.path) : [...base, node.path];
      anchorRef.current = node.path;
      onSelectionChange(next);
      return;
    }

    // Shift：从「上次点的那一项」连选到这一项。只在同一层之间连选。
    if (e.shiftKey) {
      const anchor = anchorRef.current ? rowOf(anchorRef.current) : undefined;
      const here = rowOf(node.path);
      if (anchor && here && anchor.parent === here.parent) {
        const siblings = rows.filter((r) => r.parent === anchor.parent);
        const i = siblings.findIndex((r) => r.node.path === anchor.node.path);
        const j = siblings.findIndex((r) => r.node.path === here.node.path);
        const [lo, hi] = i <= j ? [i, j] : [j, i];
        onSelectionChange(siblings.slice(lo, hi + 1).map((r) => r.node.path));
        return; // 连选只负责选，不展开也不打开
      }
      // 不在一层：不跨层，退化成只选这一项
      anchorRef.current = node.path;
      onSelectionChange([node.path]);
      return;
    }

    // 普通点击：清掉多选，只选它
    anchorRef.current = node.path;
    onSelectionChange([node.path]);
    if (node.type === 'folder') toggleExpanded(node.path);
    else onSelect(node.path);
  };

  // 点列表空白处 = 取消选择，同时把「聚焦层级」切回总目录那一层
  const handleBlankClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-resource-row]')) return;
    activeParentRef.current = '';
    onSelectionChange([]);
    rootRef.current?.focus();
  };

  // ─────────────────── 拖拽移动 ───────────────────
  const dragPathsRef = useRef<string[]>([]);
  /** null = 没有拖到任何地方；'' = 拖到总目录；其它 = 拖到某个文件夹 */
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /** 目标是否可放：不能放进自己或自己的子目录，也不能放进原来就在的那个文件夹 */
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
      /* 某些浏览器在只读模式下会抛错，忽略即可 */
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

  // ─────────────────── 右键菜单 ───────────────────
  const [menu, setMenu] = useState<{ x: number; y: number; paths: string[]; node: ResourceNode | null } | null>(null);

  const openMenu = (e: React.MouseEvent, node: ResourceNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    rootRef.current?.focus();
    let paths: string[] = [];
    if (node) {
      // 右键点到哪一层，就把聚焦层级设到哪一层
      activeParentRef.current = rowOf(node.path)?.parent ?? '';
      // 右键点到「已经选中的多项」里 → 菜单作用于整组选择
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

  // ─────────────────── 删除确认气泡 ───────────────────
  const [confirming, setConfirming] = useState<{
    paths: string[];
    label: string;
    isFolder: boolean;
    /** true = 永久删除（Shift+Delete），不进回收站 */
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

    // 默认弹在行的上方（可以盖住顶部按钮区）；上方实在放不下才改到下方
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

  /** 真的执行删除：气泡里的按钮和回车键都走这里 */
  const doDelete = () => {
    if (!confirming) return;
    const list = confirming.paths;
    const permanent = confirming.permanent;
    setConfirming(null);
    onDelete(list, permanent);
  };

  // 点别处自动收起气泡
  useEffect(() => {
    if (!confirming) return;
    const close = () => setConfirming(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [confirming]);

  // 树第一次加载完（以及新建文件夹后）自动展开新出现的文件夹，
  // 但不打扰用户手动收起过的那些。
  // ⚠️ 只展开"该展开的"（名字不以 "-" 开头）；以 "-" 开头的新文件夹保持收起 ✓
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
    seenFoldersMemory = all;   // 记住"见过哪些文件夹"，重挂载后不会把用户折叠过的又展开
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
    setExpanded((prev) => {
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

  // 📝 「待命名的新建行」：点击新建时先在列表里插一个本地输入行，
  // 用户敲定名字后才真正调接口建文件。文件管理器就是这个逻辑，
  // 好处是整个过程没有任何跨组件的异步竞态。
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
    if (!cur || cur.id !== id) return; // 已经不是这一轮了，忽略（防竞态）
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

  /** 渲染那条等待命名的输入行 */
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
    if (!current || current.session !== session) return; // 已经不是这一轮了，忽略
    const target = current.path;
    const value = renameValue.trim();
    renamingRef.current = null;
    setRenaming(null);
    if (value) onRename(target, value);
  };

  // ─────────────────── 键盘：Delete / Shift+Delete / Enter / F2 / Ctrl+A / Esc ───────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    // 删除确认气泡开着时：直接按回车确认（小键盘的回车也算），Esc 取消
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
        // Shift+Delete = 永久删除（不进回收站，也不进系统回收站）
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
    // Ctrl+Z：撤回上一次删除（列表聚焦时有效，按一次撤一次）
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

  // 顶部两个按钮：图标在左、文字在右，中间留一点间距
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

  // ─────────────────── 右键菜单内容 ───────────────────
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
      // 空白处右键
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
            )}

            {/* 正在打开的那篇文章：一个小圆点做记号 */}
            {isOpened && !isRenaming && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500" />}

            {/* 操作按钮：桌面端鼠标悬停才出现；
                📱 手机上没有 hover，所以小屏一律常显（不然这些按钮根本点不到） */}
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
      {/* 顶部按钮区：上下排列，左右留出间距 */}
      <div className="flex flex-col gap-2 px-3 pt-3">
        <h3 className="shrink-0 font-black text-slate-900 dark:text-white text-base uppercase tracking-widest border-l-4 border-indigo-500 ml-2 pl-2 mb-1">
          Article List <span className="opacity-40 mx-0.5">|</span> <span className="tracking-normal">文章列表</span>
        </h3>
        <TopButton icon="/plus.svg" label="添加文章" onClick={() => beginCreate('', 'article')} />
        <TopButton icon="/new_folder.svg" label="新建文件夹" onClick={() => beginCreate('', 'folder')} />
        <TopButton Icon={Trash2} label="回收站" onClick={onOpenTrash} badge={trashCount} />
      </div>

      {/* 树（这块的空白处就是「总目录」，可以把东西拖进来） */}
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

      {/* 🗑️ 删除确认气泡：默认贴在对应那一行的上方，风格与项目其它浮层一致 */}
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

      {/* 右键菜单（Windows 11 风格，图标 + 文字） */}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

      {/* 💬 名称被截断时的悬停提示 */}
      <HoverTip tip={tip} />
    </div>
  );
}
