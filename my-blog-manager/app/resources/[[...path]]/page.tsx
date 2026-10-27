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
import { renderMathIn } from '../../../lib/renderMath';
import { highlightPreviewCode } from '../../../lib/highlightPreviewCode';
import { CALLOUT_ICONS, CALLOUT_DEFAULT_ICON } from '../../../lib/rehypeCallout';
import { calloutBlockquotesToHtml } from '../../../components/editor/calloutBridge';
import { badgeSourceToHtml } from '../../../lib/badgeSource';

const CONTENT_ID = 'resource-content';

const UNDO_LIMIT = 1000;

type UndoOp =
  | { kind: 'delete'; ids: string[]; label: string }
  | { kind: 'rename'; from: string; to: string; label: string }
  | { kind: 'move'; moves: { from: string; to: string }[]; label: string };

const parentPathOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseNameOf = (p: string) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p);

const remapPath = (p: string, oldPath: string, newPath: string) => {
  if (!p || !oldPath) return p;
  if (p === oldPath) return newPath;
  return p.startsWith(`${oldPath}/`) ? `${newPath}${p.slice(oldPath.length)}` : p;
};

const remapByPairs = (p: string, pairs: { from: string; to: string }[]) => {
  for (const { from, to } of pairs) {
    const r = remapPath(p, from, to);
    if (r !== p) return r;
  }
  return p;
};

function isEmptyHtml(html: string) {
  if (!html) return true;
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#12288;|&zwj;/g, '')
    .trim() === '';
}

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

function hasArticle(nodes: ResourceNode[], target: string): boolean {
  for (const n of nodes) {
    if (n.type === 'article' && n.path === target) return true;
    if (n.children && hasArticle(n.children, target)) return true;
  }
  return false;
}

function syncUrl(path: string) {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', path ? `/resources/${encodeURI(path)}` : '/resources');
}

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
  const [isDirty, setIsDirty] = useState(false);
  const suppressDirtyUntilRef = useRef(0);
  const [isImgToolOpen, setIsImgToolOpen] = useState(false);
  const [notFoundPath, setNotFoundPath] = useState('');
  const [isBooting, setIsBooting] = useState(true);
  const [selection, setSelection] = useState<string[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const undoStackRef = useRef<UndoOp[]>([]);

  const pushUndo = useCallback((op: UndoOp) => {
    undoStackRef.current.push(op);
    while (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
  }, []);

  const post = useCallback(async (api: string, body: any) => {
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
    setSelection([path]);
    setTitle(data.title || '');
    setInitialContent(data.contentHtml || '');
    setPreviewHtml(data.contentHtml || '');
    setMode('preview');
    setContentVersion(v => v + 1);
    setNotFoundPath('');
    setIsDirty(false);
    suppressDirtyUntilRef.current = Date.now() + 800;
    syncUrl(path);
  }, [apiBase, post, showToast]);

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
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
    if (url.origin !== window.location.origin) return;

    const matched = url.pathname.match(/^\/resources\/(.+)$/);
    if (!matched) return;

    let path = matched[1].replace(/\/+$/, '');
    try {
      path = decodeURIComponent(path);
    } catch {
    }
    if (!path) return;

    e.preventDefault();
    void openArticle(path);
  };

  useEffect(() => {
    (async () => {
      try {
        const cfgRes = await fetch(`/backend_config.json?t=${Date.now()}`);
        const cfg = await cfgRes.json();
        setApiBase(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${cfg.api_port}`);
      } catch {
        showToast('读取后端端口失败', 'error');
        setIsBooting(false);
      }
    })();
  }, [showToast]);

  useEffect(() => {
    if (!apiBase) return;
    (async () => {
      try {
        const list = await loadTree();
        if (urlPath && !hasArticle(list, urlPath)) {
          setNotFoundPath(urlPath);
          setSelectedPath('');
          setTitle('');
          setInitialContent('');
          setPreviewHtml('');
          return;
        }
        const wanted = urlPath || firstArticle(list);
        if (wanted) await openArticle(wanted);
      } finally {
        setIsBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const getDefaultName = useCallback((parent: string, type: 'article' | 'folder') => {
    const base = type === 'folder' ? '新建文件夹' : '新文章';
    const siblings = parent ? findNode(tree, parent)?.children ?? [] : tree;
    return nextFreeName(siblings.map(s => s.name), base);
  }, [tree]);

  const handleCreate = async (parent: string, type: 'article' | 'folder', name: string) => {
    const data = await post('/api/resources/create', { parent, type, name });
    if (!data.success) {
      showToast(data.message || '创建失败', 'error');
      return;
    }
    await loadTree();
    if (data.path) setSelection([data.path]);
    if (type === 'article' && data.path) await openArticle(data.path);
  };

  const handleRename = async (path: string, newName: string) => {
    const data = await post('/api/resources/rename', { path, newName });
    if (data.success) {
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
      if (data.path) {
        setSelection((prev) => prev.map((p) => remapPath(p, path, data.path)));
        const nextOpen = remapPath(selectedPath, path, data.path);
        if (nextOpen !== selectedPath) {
          setSelectedPath(nextOpen);
          syncUrl(nextOpen);
          if (path === selectedPath) setTitle(data.name || title);
        }
      }
    } else {
      showToast(data.message || '重命名失败', 'error');
    }
  };

  const loadTrash = useCallback(async () => {
    if (!apiBase) return;
    setTrashLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/resources/trash`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setTrashItems(data.items || []);
    } catch {
    } finally {
      setTrashLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

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
    const back = (data.restored || []).find((r: any) => r.path === selectedPath);
    if (back) await openArticle(back.path);
  };

  const handleUndo = async () => {
    const stack = undoStackRef.current;
    if (!stack.length) {
      showToast('没有可以撤回的操作了', 'warning');
      return;
    }

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

      if (op.kind === 'rename') {
        const oldName = baseNameOf(op.from);
        const data = await post('/api/resources/rename', { path: op.to, newName: oldName });
        if (!data.success) { skipped += 1; continue; }
        await done(`重命名，名称已改回「${oldName}」`, skipped);
        setSelection((prev) => prev.map((p) => remapPath(p, op.to, data.path)));
        const nextOpen = remapPath(selectedPath, op.to, data.path);
        if (nextOpen !== selectedPath) {
          setSelectedPath(nextOpen);
          syncUrl(nextOpen);
          if (selectedPath === op.to) setTitle(data.name || title);
        }
        return;
      }

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
    const data = await post('/api/resources/delete', { paths, permanent });
    if (!data.success) {
      showToast(data.message || '删除失败', 'error');
      return;
    }
    const done = (data.deleted || []) as any[];

    if (permanent) {
      showToast(`🔥 已永久删除 ${done.length} 项，无法恢复`, 'warning');
    } else {
      const ids: string[] = data.ids || [];
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
    if (selectedPath && hit(selectedPath)) {
      setSelectedPath('');
      setTitle('');
      setInitialContent('');
      setPreviewHtml('');
      const next = firstArticle(list);
      if (next) await openArticle(next);
      else syncUrl('');
    }
  };

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
    const html = editorRef.current?.getContent() || initialContent;
    setPreviewHtml(
      calloutBlockquotesToHtml(badgeSourceToHtml(html), CALLOUT_ICONS, CALLOUT_DEFAULT_ICON)
    );
    setMode('preview');
    setContentVersion(v => v + 1);
  };

  const saveRef = useRef(handleSave);
  useEffect(() => {
    saveRef.current = handleSave;
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isS = e.key === 's' || e.key === 'S';
      if (!(e.ctrlKey || e.metaKey) || !isS || e.shiftKey || e.altKey) return;
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

  useEffect(() => {
    const el = previewRef.current;
    if (!el || mode !== 'preview') return;
    highlightPreviewCode(el);
    void renderMathIn(el);
  }, [previewHtml, mode, contentVersion]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el || mode !== 'preview') return;
    el.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      const input = box as HTMLInputElement;
      input.disabled = true;
      input.tabIndex = -1;
      input.setAttribute('data-readonly', 'true');
    });
  }, [previewHtml, mode, contentVersion]);

  return (
    <div className="min-h-screen relative pb-8" data-res-page>
      {
}
      {
}
      <PageTransition onlyOnDocumentLoad fadeOnly>
        {
}
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
            {
}
            <div className="absolute top-5 right-6 z-30 flex items-center gap-3">

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
                <div className={mode === 'edit' ? 'h-full' : 'hidden'}>
                  <RichTextEditor
                    ref={editorRef}
                    title={title}
                    setTitle={(v: string) => { setTitle(v); setIsDirty(true); }}
                    initialContent={initialContent}
                    onOpenImageTool={() => setIsImgToolOpen(true)}
                    onChange={() => {
                      setContentVersion(v => v + 1);
                      if (Date.now() > suppressDirtyUntilRef.current) setIsDirty(true);
                    }}
                  />
                </div>

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
                    .dark .resource-preview a { color: #a5b4fc !important; border-bottom-color: #a5b4fc !important; }
                    .resource-preview blockquote {
                      border-left: 4px solid #6366f1 !important; background-color: rgba(99,102,241,0.05) !important;
                      padding: 1rem 1.5rem !important; margin: 1.5rem 0 !important;
                      border-radius: 0 1.25rem 1.25rem 0 !important; font-style: normal !important; color: inherit !important;
                    }
                    .resource-preview blockquote p { margin: 0 !important; color: inherit !important; }
                    .dark .resource-preview blockquote { border-left-color: #818cf8 !important; background-color: rgba(129,140,248,0.1) !important; color: inherit !important; }
                    .resource-preview pre { background-color: #282c34 !important; color: #abb2bf !important; padding: 1.25rem !important; border-radius: 0.75rem !important; overflow-x: auto !important; margin: 1.5rem 0 !important; box-shadow: inset 0 0 10px rgba(0,0,0,0.3) !important; }
                    .resource-preview pre code { background-color: transparent !important; color: inherit !important; font-size: 0.9em !important; padding: 0 !important; }
                    .resource-preview code { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, ui-monospace, monospace !important; }
                    .resource-preview code::before, .resource-preview code::after { content: none !important; }
                    .resource-preview p code, .resource-preview li code, .resource-preview td code, .resource-preview th code { background-color: rgba(99,102,241,0.1) !important; color: #6366f1 !important; padding: 0.15rem 0.35rem !important; border-radius: 0.3rem !important; font-weight: 600 !important; font-size: 0.9em !important; }
                    .dark .resource-preview p code, .dark .resource-preview li code, .dark .resource-preview td code, .dark .resource-preview th code { background-color: rgba(99,102,241,0.2) !important; color: #818cf8 !important; }
                    .resource-preview img { display: block !important; margin: 0 0 2rem !important; border-radius: 1.5rem !important; box-shadow: 0 20px 50px rgba(0,0,0,0.15) !important; max-width: 100% !important; height: auto !important; }
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

