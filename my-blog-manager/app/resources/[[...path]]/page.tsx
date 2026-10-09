"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import PageTransition from '../../../components/PageTransition';
import { ToastProvider, useToast } from '../../../components/ToastProvider';
import RichTextEditor, { RichTextEditorHandle } from '../../../components/editor/RichTextEditor';
import FloatingImageTool from '../../../components/editor/FloatingImageTool';
import ResourceTree, { ResourceNode } from '../../../components/resources/ResourceTree';
import ResourceToc from '../../../components/resources/ResourceToc';
import ResourcePanels from '../../../components/resources/ResourcePanels';
import IconButton from '../../../components/resources/IconButton';
import TrashPanel, { TrashItem } from '../../../components/resources/TrashPanel';
// 🧮 数学公式：正文里的 $…$ / $$…$$ 在这里渲染成真公式（规则见 lib/renderMath.ts）
import { renderMathIn } from '../../../lib/renderMath';
import { highlightPreviewCode } from '../../../lib/highlightPreviewCode';
import { CALLOUT_ICONS, CALLOUT_DEFAULT_ICON } from '../../../lib/rehypeCallout';
import { calloutBlockquotesToHtml } from '../../../components/editor/calloutBridge';

const CONTENT_ID = 'resource-content';

/** ↩️ 最多记住多少次操作（超过之后最早的会被挤掉，也就撤不回来了） */
const UNDO_LIMIT = 1000;

/**
 * 撤回栈里的一条记录。
 * 删除走回收站还原；重命名和移动就是把路径反过来做一遍。
 */
type UndoOp =
  | { kind: 'delete'; ids: string[]; label: string }
  | { kind: 'rename'; from: string; to: string; label: string }
  | { kind: 'move'; moves: { from: string; to: string }[]; label: string };

/** '资源分享/存档.md' → '资源分享' */
const parentPathOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
/** '资源分享/存档.md' → '存档.md' */
const baseNameOf = (p: string) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p);

/**
 * 路径重映射：p 正好是 oldPath、或者位于它下面，就换成 newPath 对应的路径。
 * 用来处理「重命名/移动的是一个文件夹，而当前打开的文章正好在里面」的情况 ——
 * 否则文章路径会失效，编辑区就白屏了。
 */
const remapPath = (p: string, oldPath: string, newPath: string) => {
  if (!p || !oldPath) return p;
  if (p === oldPath) return newPath;
  return p.startsWith(`${oldPath}/`) ? `${newPath}${p.slice(oldPath.length)}` : p;
};

/** 一组 (旧→新) 的重映射，命中第一个就返回 */
const remapByPairs = (p: string, pairs: { from: string; to: string }[]) => {
  for (const { from, to } of pairs) {
    const r = remapPath(p, from, to);
    if (r !== p) return r;
  }
  return p;
};

/** 判断一段 HTML 是不是「没有任何实际内容」 */
function isEmptyHtml(html: string) {
  if (!html) return true;
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#12288;|&zwj;/g, '')
    .trim() === '';
}

/** 深度优先找出第一篇可打开的文章 */
function firstArticle(nodes: ResourceNode[]): string {
  for (const n of nodes) {
    if (n.type === 'article') return n.path;
    if (n.children) {
      const found = firstArticle(n.children);
      if (found) return found;
    }
  }
  return '';
}

/** 判断某个文章路径在树里是否存在 */
function hasArticle(nodes: ResourceNode[], target: string): boolean {
  for (const n of nodes) {
    if (n.type === 'article' && n.path === target) return true;
    if (n.children && hasArticle(n.children, target)) return true;
  }
  return false;
}

/** 更新地址栏（不触发 Next 路由跳转，保证切换是瞬时的） */
function syncUrl(path: string) {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', path ? `/resources/${encodeURI(path)}` : '/resources');
}

/** 在树里按路径找一个节点 */
function findNode(nodes: ResourceNode[], path: string): ResourceNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const hit = findNode(n.children, path);
      if (hit) return hit;
    }
  }
  return null;
}

/** 参考资源管理器：从现有名字里算出一个不冲突的默认名（新文章 / 新文章 (2) ...） */
function nextFreeName(existing: string[], base: string): string {
  const taken = new Set(existing.map(n => n.replace(/\.md$/i, '')));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} (${i})`)) i += 1;
  return `${base} (${i})`;
}

function ResourcesContent() {
  const { showToast } = useToast();
  const params = useParams<{ path?: string[] }>();

  // ⚠️ Next 给的路由参数是「未解码」的（中文会变成 %E6%AC%A2...），必须自己解，
  // 否则和磁盘上的真实文件名匹配不上。
  const urlPath = (params?.path || [])
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .join('/');

  const [apiBase, setApiBase] = useState<string>('');
  const [tree, setTree] = useState<ResourceNode[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [title, setTitle] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [contentVersion, setContentVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  /** 🔴 有没有「改了但还没保存到本地」的内容 —— 只用于右上角那个提示，不参与保存逻辑 */
  const [isDirty, setIsDirty] = useState(false);
  /** 刚打开一篇文章时，编辑器初始化会触发一次 onChange，那一下不算「用户改了内容」 */
  const suppressDirtyUntilRef = useRef(0);
  const [isImgToolOpen, setIsImgToolOpen] = useState(false);
  const [notFoundPath, setNotFoundPath] = useState('');
  /**
   * 📱 首屏那一小段「后端还没把文章送回来」的时间：中间区域先给个安静的开场提示，
   * 别闪一句「当前还没有文章」—— 那一下看起来就像整页在重新加载。
   * 初始 true；端口没拿到 / 第一篇文章读完（成功或失败）都会落回 false。
   */
  const [isBooting, setIsBooting] = useState(true);
  // 🖱️ 多选：被选中的所有路径（Ctrl 逐个加、Shift 连选，正在打开的那篇也算在内）
  const [selection, setSelection] = useState<string[]>([]);
  // 🗑️ 回收站
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const editorRef = useRef<RichTextEditorHandle>(null);
  /** 预览区的 DOM 容器：KaTeX 要拿它当扫描范围 */
  const previewRef = useRef<HTMLDivElement>(null);
  // ↩️ 撤回栈：删除 / 重命名 / 移动 各压一条记录，Ctrl+Z 弹一条（按一次撤一次）
  const undoStackRef = useRef<UndoOp[]>([]);

  /** 压一条撤回记录（超过上限就把最早那条挤掉） */
  const pushUndo = useCallback((op: UndoOp) => {
    undoStackRef.current.push(op);
    while (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
  }, []);

  const post = useCallback(async (api: string, body: any) => {
    // 后端挂了/端口对不上时必须给出明确提示，否则页面会「静默失败」，
    // 看起来就像功能坏了（实际只是连不上后端）。
    if (!apiBase) {
      return { success: false, message: '还没拿到后端端口，请稍候或重新启动控制台' };
    }
    try {
      const res = await fetch(`${apiBase}${api}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return { success: false, message: `后端返回 ${res.status}，请确认控制台是正常启动的` };
      }
      return await res.json();
    } catch {
      return {
        success: false,
        message: `连不上 Python 后端（${apiBase}）。请用 Start.bat 启动控制台，不要只开前端窗口`,
      };
    }
  }, [apiBase]);

  const loadTree = useCallback(async (keepPath?: string) => {
    if (!apiBase) return [];
    try {
      const res = await fetch(`${apiBase}/api/resources/tree`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setTree(data.tree || []);
        return data.tree as ResourceNode[];
      }
      showToast(`读取资源目录失败: ${data.message || ''}`, 'error');
    } catch {
      showToast('无法连接到 Python 后端', 'error');
    }
    return [];
  }, [apiBase, showToast]);

  const openArticle = useCallback(async (path: string) => {
    if (!apiBase || !path) return;
    const data = await post('/api/resources/get', { path });
    if (!data.success) {
      showToast(data.message || '打开失败', 'error');
      return;
    }
    setSelectedPath(path);
    // 打开哪一篇就选中哪一篇（和资源管理器一致：当前项默认属于选中集）
    setSelection([path]);
    setTitle(data.title || '');
    setInitialContent(data.contentHtml || '');
    setPreviewHtml(data.contentHtml || '');
    setMode('preview');
    setContentVersion(v => v + 1);
    setNotFoundPath('');
    // 刚载入的内容当然算「已保存」，编辑器初始化引发的那次 onChange 也要忽略掉
    setIsDirty(false);
    suppressDirtyUntilRef.current = Date.now() + 800;
    // 地址栏跟着变，方便复制链接、收藏、刷新后还在同一篇
    syncUrl(path);
  }, [apiBase, post, showToast]);

  /**
   * 🖱️ 预览正文里的「站内资源文章链接」就地打开 —— 和左边列表点文章**完全一样**：
   *    不跳转、不重新挂载页面、没有入场动画，瞬间把右边这篇正文换掉。
   *
   * 为什么必须自己拦：正文是后端 markdown 渲染出来的 HTML，里面就是普通 <a>，
   * 点它会整页跳到 /resources/xxx（Next 的 <Link> 管不到 dangerouslySetInnerHTML 里的链接）。
   * 整页跳 = 资源页从头挂载一遍，还要重跑「取端口 → 拉目录 → 读文章」，
   * 看起来就像"刷新进来 / 首次进来"，还带着入场动画。
   *
   * 只拦「同源 + 落在 /resources/ 下」的链接；其它一律不碰，原样交回浏览器：
   *   · 外链（蓝奏云 / GitHub / 123 网盘…）      · #锚点
   *   · Ctrl / ⌘ / Shift / Alt + 点击、鼠标中键   · target="_blank"、download
   * 顺带：正文里写**相对链接**（`工具.md`、`../2疑难解答/x.md`）也能正常打开 ——
   * 它们会按当前地址栏（即当前文章所在目录）解析成 /resources/... 再匹配。
   */
  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    // 只处理左键单击、且没按修饰键（按了就是"新标签页打开"之类的意图，别抢）
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;
    if (anchor.target && anchor.target !== '_self') return;
    if (anchor.hasAttribute('download')) return;

    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;

    let url: URL;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }
    // 不同源 = 外链，交给浏览器 / 系统
    if (url.origin !== window.location.origin) return;

    const matched = url.pathname.match(/^\/resources\/(.+)$/);
    if (!matched) return;

    let path = matched[1].replace(/\/+$/, '');
    try {
      path = decodeURIComponent(path);
    } catch {
      /* 解不开就按原样试，后端会给出明确提示 */
    }
    if (!path) return;

    e.preventDefault();
    void openArticle(path);
  };

  // 初始化：拿后端端口 → 拉目录 → 打开第一篇文章
  useEffect(() => {
    (async () => {
      try {
        const cfgRes = await fetch(`/backend_config.json?t=${Date.now()}`);
        const cfg = await cfgRes.json();
        setApiBase(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${cfg.api_port}`);
      } catch {
        showToast('读取后端端口失败', 'error');
        // 端口都拿不到就别一直转圈了，落回「还没有文章」那个状态（和原来一样）
        setIsBooting(false);
      }
    })();
  }, [showToast]);

  useEffect(() => {
    if (!apiBase) return;
    (async () => {
      try {
        const list = await loadTree();
        // 地址栏指向的文章不存在（链接过期 / 已被删除或改名）→ 中间区域给出明确提示
        if (urlPath && !hasArticle(list, urlPath)) {
          setNotFoundPath(urlPath);
          setSelectedPath('');
          setTitle('');
          setInitialContent('');
          setPreviewHtml('');
          return;
        }
        // 地址栏带了文章路径就打开它（支持刷新/收藏/直接粘链接），否则打开第一篇
        const wanted = urlPath || firstArticle(list);
        if (wanted) await openArticle(wanted);
      } finally {
        // 等这篇真的读出来（或确定读不出来）再收起开场提示，中间不会闪「当前还没有文章」
        setIsBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  /** 给「待命名的新建行」算一个不冲突的默认名 */
  const getDefaultName = useCallback((parent: string, type: 'article' | 'folder') => {
    const base = type === 'folder' ? '新建文件夹' : '新文章';
    const siblings = parent ? findNode(tree, parent)?.children ?? [] : tree;
    return nextFreeName(siblings.map(s => s.name), base);
  }, [tree]);

  const handleCreate = async (parent: string, type: 'article' | 'folder', name: string) => {
    // 名字是用户在列表里敲定的，这里只负责真正落盘
    const data = await post('/api/resources/create', { parent, type, name });
    if (!data.success) {
      showToast(data.message || '创建失败', 'error');
      return;
    }
    await loadTree();
    if (data.path) setSelection([data.path]); // 新建完就选中它，接着可以改名/拖动
    if (type === 'article' && data.path) await openArticle(data.path);
  };

  const handleRename = async (path: string, newName: string) => {
    const data = await post('/api/resources/rename', { path, newName });
    if (data.success) {
      // 名字真的变了才记进撤回栈（名字没动的话后端会原样返回同一个路径）
      const changed = Boolean(data.path) && data.path !== path;
      if (changed) {
        pushUndo({
          kind: 'rename',
          from: path,
          to: data.path,
          label: `${baseNameOf(path)} → ${baseNameOf(data.path)}`,
        });
      }
      showToast(changed ? '✅ 已重命名，按 Ctrl+Z 可撤回' : '✅ 已重命名', 'success');
      await loadTree();
      // 选中集里那条也得跟着改名（改的是文件夹的话，里面选中的项也要一起重映射）
      if (data.path) {
        setSelection((prev) => prev.map((p) => remapPath(p, path, data.path)));
        const nextOpen = remapPath(selectedPath, path, data.path);
        if (nextOpen !== selectedPath) {
          setSelectedPath(nextOpen);
          syncUrl(nextOpen); // 地址栏跟着改名
          // 只有文章本身改名才换标题；只是它所在的文件夹改名的话，文章名没变
          if (path === selectedPath) setTitle(data.name || title);
        }
      }
    } else {
      showToast(data.message || '重命名失败', 'error');
    }
  };

  /** 回收站：拉列表（顺便给「回收站」按钮上的角标用） */
  const loadTrash = useCallback(async () => {
    if (!apiBase) return;
    setTrashLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/resources/trash`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setTrashItems(data.items || []);
    } catch {
      /* 后端没起来时静默即可，别打扰用户 */
    } finally {
      setTrashLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

  // 📡 实时监测：ResShare 和回收站一有变化就立刻更新列表 —— 自己操作触发的、
  // 外部程序改的、甚至你直接在系统里删文件或往里丢文件，都算。
  // 只更新数据、不刷新页面，所以完全没有「闪一下」的感觉。
  useEffect(() => {
    if (!apiBase) return;
    let disposed = false;
    let source: EventSource | null = null;
    let poller: ReturnType<typeof setInterval> | null = null;
    let lastRev = '';

    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

    const apply = (rev: string, treeData: any, trashData: any) => {
      if (disposed || !rev || rev === lastRev) return;
      lastRev = rev;
      setTree((prev) => (same(prev, treeData) ? prev : treeData || []));
      setTrashItems((prev) => (same(prev, trashData) ? prev : trashData || []));
    };

    // 后端是老版本（没有 /watch）或者长连接断了 → 退化成轮询，效果一样，只是慢一点点
    const startPolling = () => {
      if (poller || disposed) return;
      poller = setInterval(async () => {
        try {
          const [tRes, rRes] = await Promise.all([
            fetch(`${apiBase}/api/resources/tree`, { cache: 'no-store' }),
            fetch(`${apiBase}/api/resources/trash`, { cache: 'no-store' }),
          ]);
          const t = await tRes.json();
          const r = await rRes.json();
          if (t?.success && r?.success) {
            apply(JSON.stringify(t.tree) + JSON.stringify(r.items), t.tree, r.items);
          }
        } catch {
          /* 后端暂时没响应，等下一轮 */
        }
      }, 2000);
    };

    try {
      source = new EventSource(`${apiBase}/api/resources/watch`);
      source.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.type === 'change') apply(data.rev, data.tree, data.trash);
        } catch {
          /* 忽略坏消息 */
        }
      };
      source.onerror = () => {
        source?.close();
        source = null;
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      disposed = true;
      source?.close();
      if (poller) clearInterval(poller);
    };
  }, [apiBase]);

  /** 撤回 / 还原：把回收站里的东西送回它原来的位置 */
  const handleRestore = async (ids: string[]) => {
    if (!ids.length) return;
    const data = await post('/api/resources/restore', { ids });
    if (!data.success) {
      showToast(data.message || '还原失败', 'error');
      return;
    }
    showToast(`♻️ ${data.message || '已还原'}`, 'success');
    await loadTree();
    void loadTrash();
    // 还原回来的正好是当前打开的那篇 → 重新读一次内容（防止编辑区还是空的）
    const back = (data.restored || []).find((r: any) => r.path === selectedPath);
    if (back) await openArticle(back.path);
  };

  /**
   * Ctrl+Z 撤回：删除 / 重命名 / 移动 都能撤，按一次撤一步（列表区域聚焦时触发）。
   *
   * · 删除 → 从回收站把东西送回原位
   * · 重命名 → 把名字改回去
   * · 移动 → 把东西移回原来的文件夹
   *
   * 某一步要是做不成了（比如回收站已被清空、或者原位已经有同名文件），
   * 就跳过它继续撤更早的那一步，并在提示里说明跳过了几步。
   */
  const handleUndo = async () => {
    const stack = undoStackRef.current;
    if (!stack.length) {
      showToast('没有可以撤回的操作了', 'warning');
      return;
    }

    // 只有「删除」类撤回才需要看回收站：那一步的东西可能已经被清掉了
    let alive = new Set<string>();
    if (stack.some((op) => op.kind === 'delete')) {
      try {
        const res = await fetch(`${apiBase}/api/resources/trash`, { cache: 'no-store' });
        const data = await res.json();
        if (data.success) {
          const items: TrashItem[] = data.items || [];
          setTrashItems(items);
          alive = new Set(items.filter((i) => i.exists !== false).map((i) => i.id));
        }
      } catch {
        /* 拿不到就当空的处理，下面会跳过并提示 */
      }
    }

    const done = async (what: string, skipped: number) => {
      showToast(`↩️ 已撤回：${what}${skipped ? `（跳过 ${skipped} 步已失效的操作）` : ''}`, 'success');
      await loadTree();
      void loadTrash();
    };

    let skipped = 0;
    while (stack.length) {
      const op = stack.pop()!;

      // ── 撤回删除：从回收站还原 ──
      if (op.kind === 'delete') {
        const ids = op.ids.filter((id) => alive.has(id));
        if (!ids.length) { skipped += 1; continue; }
        const data = await post('/api/resources/restore', { ids });
        if (!data.success) { skipped += 1; continue; }
        ids.forEach((id) => alive.delete(id));
        await done(`删除 ${op.label}`, skipped);
        const back = (data.restored || []).find((r: any) => r.path === selectedPath);
        if (back) await openArticle(back.path);
        return;
      }

      // ── 撤回重命名：把名字改回原来的 ──
      if (op.kind === 'rename') {
        const oldName = baseNameOf(op.from);
        const data = await post('/api/resources/rename', { path: op.to, newName: oldName });
        if (!data.success) { skipped += 1; continue; }
        await done(`重命名，名称已改回「${oldName}」`, skipped);
        // 选中集和地址栏都得跟着改回去，否则多选后续操作会对不上
        setSelection((prev) => prev.map((p) => remapPath(p, op.to, data.path)));
        const nextOpen = remapPath(selectedPath, op.to, data.path);
        if (nextOpen !== selectedPath) {
          setSelectedPath(nextOpen);
          syncUrl(nextOpen);
          if (selectedPath === op.to) setTitle(data.name || title);
        }
        return;
      }

      // ── 撤回移动：按原来的父目录分组，各组移回去 ──
      if (op.kind === 'move') {
        const groups = new Map<string, string[]>();
        for (const m of op.moves) {
          const parent = parentPathOf(m.from);
          if (!groups.has(parent)) groups.set(parent, []);
          groups.get(parent)!.push(m.to);
        }
        const backMap = new Map<string, string>();
        for (const [parent, paths] of groups) {
          const data = await post('/api/resources/move', { paths, target: parent });
          if (!data.success) continue;
          for (const mv of (data.moved || []) as { from: string; to: string }[]) {
            backMap.set(mv.from, mv.to);
          }
        }
        if (!backMap.size) { skipped += 1; continue; }
        await done(`移动 ${op.label}`, skipped);
        const backPairs = [...backMap].map(([from, to]) => ({ from, to }));
        setSelection((prev) => prev.map((p) => remapByPairs(p, backPairs)));
        const nextOpen = remapByPairs(selectedPath, backPairs);
        if (nextOpen !== selectedPath) {
          setSelectedPath(nextOpen);
          syncUrl(nextOpen);
        }
        return;
      }
    }

    void loadTrash();
    showToast('没有可以撤回的操作了', 'warning');
  };

  /** 彻底删除 / 清空回收站 */
  const handlePurge = async (ids: string[] | null) => {
    const data = await post('/api/resources/trash/purge', ids ? { ids } : { all: true });
    if (!data.success) {
      showToast(data.message || '操作失败', 'error');
      return;
    }
    showToast(`🧹 ${data.message || '已彻底删除'}`, 'success');
    void loadTrash();
  };

  const handleDelete = async (paths: string[], permanent = false) => {
    if (!paths.length) return;
    // 确认气泡已经在列表里做过了，这里不再弹浏览器原生对话框
    const data = await post('/api/resources/delete', { paths, permanent });
    if (!data.success) {
      showToast(data.message || '删除失败', 'error');
      return;
    }
    const done = (data.deleted || []) as any[];

    if (permanent) {
      // 🔥 永久删除：不进回收站，自然也就进不了撤回栈
      showToast(`🔥 已永久删除 ${done.length} 项，无法恢复`, 'warning');
    } else {
      const ids: string[] = data.ids || [];
      // 不是真删：东西都躺在回收站里。撤回用 Ctrl+Z（列表聚焦时），按一次撤一次
      const names: string[] = done.map((d) => d.name);
      pushUndo({
        kind: 'delete',
        ids,
        label: names.length > 1 ? `${names.length} 个项目` : names[0] || '项目',
      });
      showToast(`🗑️ 已删除 ${ids.length} 项，按 Ctrl+Z 可撤回`, 'success');
      void loadTrash();
    }

    const list = await loadTree();
    const hit = (p: string) => paths.includes(p) || paths.some((d) => p.startsWith(`${d}/`));
    setSelection((prev) => prev.filter((p) => !hit(p)));
    // 删掉的正是当前打开的文章，或它所在的文件夹，就自动切到另一篇
    if (selectedPath && hit(selectedPath)) {
      setSelectedPath('');
      setTitle('');
      setInitialContent('');
      setPreviewHtml('');
      const next = firstArticle(list);
      if (next) await openArticle(next);
      else syncUrl(''); // 一篇都不剩了，地址栏回到 /resources
    }
  };

  /** 拖拽移动：把选中的文章/文件夹拖进某个文件夹 */
  const handleMove = async (paths: string[], target: string) => {
    if (!paths.length) return;
    const data = await post('/api/resources/move', { paths, target });
    if (!data.success) {
      showToast(data.message || '移动失败', 'error');
      return;
    }
    const moved: { from: string; to: string; renamed: boolean }[] = data.moved || [];
    if (moved.length) {
      pushUndo({
        kind: 'move',
        moves: moved.map((m) => ({ from: m.from, to: m.to })),
        label: moved.length > 1 ? `${moved.length} 个项目` : baseNameOf(moved[0].from),
      });
    }
    await loadTree();

    // 路径变了：选中集和地址栏都得跟着换（拖的是文件夹的话，里面的项也要重映射）
    const pairs = moved.map((m) => ({ from: m.from, to: m.to }));
    setSelection((prev) => prev.map((p) => remapByPairs(p, pairs)));
    const nextOpen = remapByPairs(selectedPath, pairs);
    if (nextOpen !== selectedPath) {
      setSelectedPath(nextOpen);
      syncUrl(nextOpen);
    }

    const renamedCount = moved.filter((m) => m.renamed).length;
    const skipped = data.skipped?.length ? `，跳过 ${data.skipped.length} 项` : '';
    showToast(
      `📦 已移动 ${moved.length} 项${renamedCount ? `（${renamedCount} 项重名已自动改名）` : ''}${skipped}，按 Ctrl+Z 可撤回`,
      'success'
    );
  };

  const handleSave = async () => {
    if (!selectedPath) {
      showToast('请先选择一篇文章', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const html = editorRef.current?.getContent() || '';
      const data = await post('/api/resources/save', { path: selectedPath, title, content: html });
      if (data.success) {
        showToast('✅ 已保存到本地，记得点右上角【同步Blog】推送到博客', 'success');
        setIsDirty(false);
        await loadTree();
      } else {
        showToast(data.message || '保存失败', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const toPreview = () => {
    /**
     * 编辑器导出的 HTML 里 callout 是「引用块 + 首段 [!type]」，
     * 直接丢给预览就只是个普通引用，和后端渲染的预览长得不一样 ✗
     * 这里套回 div 壳（连带图标），三处（编辑器 / 预览 / 博客前台）才是同一张脸。
     * ⚠️ 只用于预览；保存走的是原始 HTML，.md 里照旧写 `> [!info] 标题`。
     */
    const html = editorRef.current?.getContent() || initialContent;
    setPreviewHtml(calloutBlockquotesToHtml(html, CALLOUT_ICONS, CALLOUT_DEFAULT_ICON));
    setMode('preview');
    setContentVersion(v => v + 1);
  };

  // ⌨️ Ctrl+S / ⌘S 保存（编辑态下随时可用，焦点在正文里也在标题框里都行）
  // 用 ref 拿最新的 handleSave，免得每次重渲染都重新挂一遍监听
  const saveRef = useRef(handleSave);
  useEffect(() => {
    saveRef.current = handleSave;
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isS = e.key === 's' || e.key === 'S';
      if (!(e.ctrlKey || e.metaKey) || !isS || e.shiftKey || e.altKey) return;
      // 只有编辑态、且确实有文章时才接管；其它情况不拦，免得挡住浏览器自己的行为
      if (mode !== 'edit' || !selectedPath) return;
      e.preventDefault();
      e.stopPropagation();
      void saveRef.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [mode, selectedPath]);

  const toEdit = () => {
    setMode('edit');
    setContentVersion(v => v + 1);
  };

  /**
   * 🧮 数学公式渲染。
   *
   * 正文里的 `$…$ / $$…$$` 交给 lib/renderMath.ts 扫出来渲染（后端只保证公式不被
   * markdown 改坏，渲染统一在这一层做）。两条路都覆盖：
   *   · 从后端 load 出来的 contentHtml
   *   · 点过「编辑」再点「预览」时编辑器吐出来的 HTML
   *
   * ⚠️ 只在**预览区**跑：编辑区的 tiptap 里必须留着 `$…$` 源码，不然公式没法改。
   */
  useEffect(() => {
    const el = previewRef.current;
    if (!el || mode !== 'preview') return;
    // 🎨 代码块着色：后端 contentHtml 是 python-markdown + codehilite 吐的，靠 Pygments 上色；
    //    服务器没装 Pygments 时一个颜色都没有。这里用编辑器同一套 lowlight 在浏览器里补上，
    //    不依赖服务器环境（已经着色的块会自动跳过）。必须在 CodeCopy 量折叠高度之前跑完。
    highlightPreviewCode(el);
    // KaTeX 是按需加载的（没有公式就不下载），所以这里拿到的是 Promise，不用等它
    void renderMathIn(el);
  }, [previewHtml, mode, contentVersion]);

  return (
    <div className="min-h-screen relative pb-8" data-res-page>
      {/* 🏁 onlyOnDocumentLoad：站内点链接跳进来的这一页直接显示，不重播那 0.8s 入场动画
          （真的刷新 / 首次打开才播）。这样从首页卡片、搜索结果、正文里的超链接点进某篇资源文章，
          就是"瞬间出现"，和左边列表点文章一个手感。 */}
      {/* 🚫 fadeOnly：这一页里有 **fixed 的「按钮行」**（左右两个展开按钮，见 ResourcePanels）——
          入场动画只要动 transform，那层 div 就成了 fixed 的定位参照物：
          按钮会跟着动画往下飘，动画播完才"啪"地跳回导航栏正下方 ✗
          → 这一页改成只淡入、不做 20px 上滑 ✓（和博客前台同一处改动） */}
      <PageTransition onlyOnDocumentLoad fadeOnly>
        {/* 📱 小屏是「App 式」三栏：中间正文铺满，左右两栏收进抽屉（按钮在导航栏正下方那一行）。
            大屏和原来一模一样：左列表 / 中正文 / 右大纲 并排。 */}
        <ResourcePanels
          left={
            <ResourceTree
              tree={tree}
              selectedPath={selectedPath}
              selection={selection}
              onSelectionChange={setSelection}
              onSelect={openArticle}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
              onMove={handleMove}
              getDefaultName={getDefaultName}
              onOpenTrash={() => {
                setTrashOpen(true);
                void loadTrash();
              }}
              onUndo={handleUndo}
              trashCount={trashItems.length}
            />
          }
          right={<ResourceToc contentId={CONTENT_ID} contentKey={`${selectedPath}|${mode}|${contentVersion}`} />}
        >
            {/* 右上角：保存（仅编辑态）+ 预览 / 编辑
                ⚠️「保存」和两个小图标之间加了分隔线 + 拉开距离：
                   原来它俩紧挨着，那个 18px 的小眼睛很难点，很容易误点到"保存"——
                   看着就像"一切换预览就自动保存了"。 */}
            <div className="absolute top-5 right-6 z-30 flex items-center gap-3">

              {/* 未保存标识：只要你动过内容就一直亮着，存过就灭 —— 一眼能看出到底存没存 */}
              {isDirty && (
                <span className="shrink-0 text-[11px] font-black text-amber-500 whitespace-nowrap select-none" title="有改动还没保存到本地">
                  ● 未保存
                </span>
              )}

              {mode === 'edit' && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  title="保存到本地（快捷键 Ctrl+S）"
                  className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-500/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
              )}

              {mode === 'edit' && (
                <span className="w-px h-5 bg-slate-300/60 dark:bg-slate-600/60 shrink-0" />
              )}

              {/* 图标放大到 22px，指尖好点 */}
              <IconButton icon="/view.svg" title="预览" onClick={toPreview} size={22} />
              <IconButton icon="/edit.svg" title="编辑" onClick={toEdit} size={22} />
            </div>

            {notFoundPath ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 px-8 text-center">
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">这篇文章不存在</p>
                <p className="text-[11px]">它可能已经被删除或改名了，请从左侧列表里选择</p>
              </div>
            ) : !selectedPath ? (
              isBooting ? (
                // 📱 刚进来、接口还没回来：给个安静的开场，别闪「当前还没有文章」
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <div className="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-indigo-500 animate-spin" />
                  <p className="text-[11px] font-black tracking-widest">正在打开…</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 px-8 text-center">
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400">当前还没有文章</p>
                  <p className="text-[11px]">点左上角的「添加文章」新建一篇吧</p>
                </div>
              )
            ) : (
              <div id={CONTENT_ID} className="flex-1 min-h-0">
                {/* 编辑态 */}
                <div className={mode === 'edit' ? 'h-full' : 'hidden'}>
                  <RichTextEditor
                    ref={editorRef}
                    title={title}
                    setTitle={(v: string) => { setTitle(v); setIsDirty(true); }}
                    initialContent={initialContent}
                    onOpenImageTool={() => setIsImgToolOpen(true)}
                    onChange={() => {
                      setContentVersion(v => v + 1);
                      // 刚打开文章时编辑器初始化也会触发一次，那次不算用户改的
                      if (Date.now() > suppressDirtyUntilRef.current) setIsDirty(true);
                    }}
                  />
                </div>

                {/* 预览态：和博客前台一样的阅读观感 */}
                <div className={mode === 'preview' ? 'h-full overflow-y-auto custom-scrollbar' : 'hidden'}>
                  <style>{`
                    /* ⚠️ 这一整块必须和博客前台 app/resources/[[...path]]/page.tsx 里的 .resource-preview
                       逐条一致；编辑器的 .editor-content-area 也是照这一份对齐的。改这里就要三处一起改。 */
                    .resource-preview h1 { font-size: 2.2rem !important; font-weight: 900 !important; margin: 2rem 0 1.2rem !important; line-height: 1.25 !important; color: inherit !important; }
                    .resource-preview h2 { font-size: 1.6rem !important; font-weight: 800 !important; margin: 1.6rem 0 1rem !important; color: inherit !important; }
                    .resource-preview h3 { font-size: 1.25rem !important; font-weight: 700 !important; margin: 1.2rem 0 0.8rem !important; color: inherit !important; }
                    .resource-preview p, .resource-preview hr { font-size: 1rem !important; line-height: 1.8 !important; margin-bottom: 1rem !important; color: inherit !important; }
                    .resource-preview ul { list-style-type: disc !important; padding-left: 1.5rem !important; }
                    .resource-preview ol { list-style-type: decimal !important; padding-left: 1.5rem !important; }
                    .resource-preview li { display: list-item !important; margin-bottom: 0.4rem !important; }
                    .resource-preview a { color: #6366f1 !important; font-weight: 600 !important; border-bottom: 1px dashed #6366f1 !important; transition: all 0.3s ease !important; }
                    .resource-preview a:hover { color: #4f46e5 !important; border-bottom-style: solid !important; background-color: rgba(99,102,241,0.1) !important; border-radius: 0.2rem !important; }
                    .dark .resource-preview a { color: #a5b4fc !important; border-bottom-color: #a5b4fc !important; }
                    .dark .resource-preview a:hover { color: #c7d2fe !important; border-bottom-color: #c7d2fe !important; background-color: rgba(165,180,252,0.16) !important; }
                    .resource-preview blockquote {
                      border-left: 4px solid #6366f1 !important; background-color: rgba(99,102,241,0.05) !important;
                      padding: 1rem 1.5rem !important; margin: 1.5rem 0 !important;
                      border-radius: 0 1.25rem 1.25rem 0 !important; font-style: normal !important; color: #64748b !important;
                    }
                    .resource-preview blockquote p { margin: 0 !important; color: inherit !important; }
                    .dark .resource-preview blockquote { border-left-color: #818cf8 !important; background-color: rgba(129,140,248,0.1) !important; color: #94a3b8 !important; }
                    .resource-preview pre { background-color: #282c34 !important; color: #abb2bf !important; padding: 1.25rem !important; border-radius: 0.75rem !important; overflow-x: auto !important; margin: 1.5rem 0 !important; box-shadow: inset 0 0 10px rgba(0,0,0,0.3) !important; }
                    .resource-preview pre code { background-color: transparent !important; color: inherit !important; font-size: 0.9em !important; padding: 0 !important; }
                    .resource-preview code { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, ui-monospace, monospace !important; }
                    .resource-preview code::before, .resource-preview code::after { content: none !important; }
                    .resource-preview p code, .resource-preview li code { background-color: rgba(99,102,241,0.1) !important; color: #6366f1 !important; padding: 0.15rem 0.35rem !important; border-radius: 0.3rem !important; font-weight: 600 !important; font-size: 0.9em !important; }
                    .dark .resource-preview p code, .dark .resource-preview li code { background-color: rgba(99,102,241,0.2) !important; color: #818cf8 !important; }
                    .resource-preview img { display: block !important; margin: 2rem 0 !important; border-radius: 1.5rem !important; box-shadow: 0 20px 50px rgba(0,0,0,0.15) !important; max-width: 100% !important; height: auto !important; }
                    .resource-preview table { width: 100% !important; border-collapse: collapse !important; margin: 1.5rem 0 !important; }
                    .resource-preview th, .resource-preview td { border: 1px solid rgba(148,163,184,0.35) !important; padding: 0.6rem 0.9rem !important; }

                    /* 顶部留白收掉：原来是 .resource-preview 的 py-10（40px）
                       + 首个标题自身的 2rem 上外边距（32px）≈ 72px 空一截。
                       现在顶部只留 14px，并且把首元素的上外边距清零（它会叠在 padding 外面）。 */
                    .resource-preview { padding-top: calc(38px + 1%) !important; /* 首行文字顶部 = 右上角按钮下沿(38px) + 1% 内容宽 */ }
                    .resource-preview > :first-child { margin-top: 0 !important; }

                    /* 📱 小屏：和博客前台那份保持完全一致（控制台窗口最小 1024px，这条实际不会触发，只为两边同步好维护） */
                    @media (max-width: 1023.98px) {
                      .resource-preview { padding-left: 1rem !important; padding-right: 1rem !important; }
                    }
                  `}</style>
                  {isEmptyHtml(previewHtml) ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400 px-8 text-center">
                      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">这篇文章还没有内容</p>
                      <p className="text-[11px]">点右上角的「编辑」开始写吧</p>
                    </div>
                  ) : (
                    <div
                      ref={previewRef}
                      onClick={handlePreviewClick}
                      className="resource-preview px-10 py-10 max-w-none text-slate-800 dark:text-slate-200 transition-colors duration-700"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  )}
                </div>
              </div>
            )}
        </ResourcePanels>
      </PageTransition>

      <FloatingImageTool
        isOpen={isImgToolOpen}
        onClose={() => setIsImgToolOpen(false)}
        onInsert={(url) => {
          editorRef.current?.insertImage(url);
          setContentVersion(v => v + 1);
        }}
      />

      {/* 🗑️ 回收站：删掉的东西都在这儿，可以还原回原位 */}
      {trashOpen && (
        <TrashPanel
          items={trashItems}
          loading={trashLoading}
          onClose={() => setTrashOpen(false)}
          onRestore={handleRestore}
          onPurge={handlePurge}
        />
      )}
    </div>
  );
}

export default function ResourcesPage() {
  return (
    <ToastProvider>
      <ResourcesContent />
    </ToastProvider>
  );
}


