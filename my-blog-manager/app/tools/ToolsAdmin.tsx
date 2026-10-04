"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, X, FolderOpen, FileText, Upload, Check, ChevronLeft, Loader2, Download } from 'lucide-react';

/**
 * 🧰 控制台的「工具」管理界面。
 *
 * 数据只有一份：<博客>/tools/tools.json（后端 cms_core/api/tools.py 读写），
 * 前台 /tools 是 force-dynamic 读同一份，所以这边一改、前台刷新就生效，不用重建。
 *
 * 弹窗结构（都在这个文件里，省得来回跳）：
 *   · ToolForm    —— 新增/编辑：名称、项目目录名（带"使用已有名称/清空"和非法字符即时提示）、
 *                    项目路径（可选浏览）、主网页文件名（可选浏览）、描述、标签、图标
 *   · BrowseDialog—— 浏览目录 / 文件（支持关键字 + 通配符 * ? 搜索）
 *   · IconDialog  —— 选图标：本地（public/uploads/ico，可上传）/ 网络（待接入）
 *   · 删除确认
 */

/** 工具页导航栏主题的 6 个预设：明暗(auto/dark/light) × 透明度(trans/solid)，外加 auto 与 hidden */
type NavTheme = 'auto' | 'dark-trans' | 'dark-solid' | 'light-trans' | 'light-solid' | 'hidden';

type Tool = {
  name: string;
  dir: string;
  entry: string;
  description?: string;
  icon?: string;
  tags?: string[];
  navTheme?: NavTheme;
  created?: string;
};

type DirItem = { name: string; path: string };
type FileItem = { name: string; path: string; ext: string };
type IconItem = { name: string; file: string; url: string };

/** 和各系统/浏览器不对付的字符（后端也照这个挡） */
const ILLEGAL_CHARS = "\\/:*?\"<>|#%&{}$!+'`=@~^[];,";
const RESERVED = [
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
];
const DIR_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** 目录名体检：给出"哪些字符不能用"的一句话提示（输入框下面那行红字） */
function checkDirName(name: string) {
  const raw = (name || '').trim();
  if (!raw) return { ok: false, illegal: [] as string[], msg: '' };

  const illegal = Array.from(
    new Set(
      raw.split('').filter((ch) => {
        const code = ch.charCodeAt(0);
        return ILLEGAL_CHARS.includes(ch) || code < 32 || code > 126;
      })
    )
  );
  const reserved = RESERVED.includes(raw.toUpperCase().split('.')[0]);

  let msg = '';
  if (illegal.length) msg = `这些字符不能用：${illegal.join(' ')}（中文、空格同样不行）`;
  else if (reserved) msg = `${raw} 是 Windows 保留名，换一个`;
  else if (!DIR_OK.test(raw)) msg = '只能字母/数字开头，且只能用 字母 数字 . _ -';

  return { ok: !msg, illegal, msg };
}

const lastSeg = (p: string) => {
  const s = (p || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return s.includes('/') ? s.slice(s.lastIndexOf('/') + 1) : s;
};

const emptyForm = () => ({
  origDir: '',
  name: '',
  dir: '',
  path: '',
  entry: '',
  description: '',
  icon: '',
  tags: '',
  navTheme: 'auto' as NavTheme,
});

/** 导航栏主题的 6 个预设（存进 tools.json 的 navTheme） */
const NAV_THEMES: { value: NavTheme; label: string; hint: string }[] = [
  { value: 'auto', label: '自动', hint: '跟着工具页面自己的明暗走（页面自带主题切换时，导航栏也会跟着变）' },
  { value: 'dark-trans', label: '深色·半透明', hint: '深色 + 半透明毛玻璃，适合深色背景的工具' },
  { value: 'dark-solid', label: '深色·不透明', hint: '深色实底，适合深色背景、但想要一条干净实心导航栏的工具' },
  { value: 'light-trans', label: '浅色·半透明', hint: '浅色 + 半透明毛玻璃，适合浅色背景、想透出一点底图的工具' },
  { value: 'light-solid', label: '浅色·不透明', hint: '浅色实底（纯白），适合浅色背景的工具' },
  { value: 'hidden', label: '不要导航栏', hint: '这个工具不注入顶部导航栏' },
];

/** 老数据兼容：以前只有 dark / light 两种，映射到现在的预设 */
const normalizeNavTheme = (v?: string): NavTheme => {
  if (v === 'dark') return 'dark-trans';
  if (v === 'light') return 'light-solid';
  return (NAV_THEMES.some((o) => o.value === v) ? v : 'auto') as NavTheme;
};

export default function ToolsAdmin() {
  const [apiBase, setApiBase] = useState('');
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('全部');

  const [form, setForm] = useState<null | ReturnType<typeof emptyForm>>(null);
  const [picker, setPicker] = useState<null | 'path' | 'file'>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const [del, setDel] = useState<Tool | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  /** 「主网页文件名」的实时体检结果：这个目录里到底有没有这个名字的文件 */
  const [entryInfo, setEntryInfo] = useState<{ state: 'idle' | 'checking' | 'ok' | 'missing' | 'nodir'; files: string[] }>({
    state: 'idle',
    files: [],
  });

  // ---------------------------------------------------------------- 基址 & 数据
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/backend_config.json?t=${Date.now()}`, { cache: 'no-store' });
        const cfg = await res.json();
        const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
        setApiBase(`http://${host}:${cfg.api_port}`);
      } catch {
        setErr('读不到 backend_config.json，连不上后端');
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/tools/list`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setTools(data.tools || []);
        setErr(data.configured ? '' : '还没配置博客路径（设置 → 双轨配置 里填 XHBlogs 路径）');
      } else {
        setErr(data.message || '读取失败');
      }
    } catch (e: any) {
      setErr(`连不上后端（${apiBase}）`);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);

  /**
   * 🔎 主网页文件名的实时体检。
   *
   * 目录/文件名改动后停 350ms 去问一次后端「tools/<目录> 里有哪些文件」，再拿填的名字对一下：
   *   ok      —— 名字对得上 ✓
   *   missing —— 目录在、但里面没这个文件 ✗（最常见：名字写错 / 还没上传 → 点开就是 404）
   *   nodir   —— 目录还不存在（新工具还没保存过；保存时会自动创建）
   * 顺带把目录里现有的 .html 列出来，点一下就能改成那个名字。
   */
  useEffect(() => {
    const dir = (form?.dir || '').trim();
    const entry = (form?.entry || '').trim();
    if (!apiBase || !form || !dir || !entry) {
      setEntryInfo({ state: 'idle', files: [] });
      return;
    }

    let alive = true;
    const timer = setTimeout(async () => {
      setEntryInfo((s) => ({ ...s, state: 'checking' }));
      const rel = entry.replace(/^\/+/, '');
      const slash = rel.lastIndexOf('/');
      const sub = slash >= 0 ? rel.slice(0, slash) : '';
      const name = slash >= 0 ? rel.slice(slash + 1) : rel;
      const target = `tools/${dir}${sub ? `/${sub}` : ''}`;

      try {
        const res = await fetch(`${apiBase}/api/tools/browse?path=${encodeURIComponent(target)}&mode=file`, { cache: 'no-store' });
        const data = await res.json();
        if (!alive) return;
        if (data.exists === false) {
          setEntryInfo({ state: 'nodir', files: [] });
          return;
        }
        const files: string[] = (data.files || []).map((f: any) => String(f.name));
        setEntryInfo({
          state: files.includes(name) ? 'ok' : 'missing',
          files: files.filter((n) => /\.html?$/i.test(n)),
        });
      } catch {
        if (alive) setEntryInfo({ state: 'idle', files: [] });
      }
    }, 350);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, form?.dir, form?.entry]);

  const post = useCallback(async (api: string, body: any) => {
    const res = await fetch(`${apiBase}${api}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }, [apiBase]);

  // ---------------------------------------------------------------- 搜索 / 标签
  const allTags = useMemo(() => {
    const s = new Set<string>();
    tools.forEach((t) => t.tags?.forEach((x) => s.add(x)));
    return ['全部', ...Array.from(s)];
  }, [tools]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tools.filter((t) => {
      const hitSearch = !q
        || t.name.toLowerCase().includes(q)
        || (t.description || '').toLowerCase().includes(q)
        || t.dir.toLowerCase().includes(q)
        || t.entry.toLowerCase().includes(q)
        || (t.tags || []).some((x) => x.toLowerCase().includes(q));
      const hitTag = activeTag === '全部' || (t.tags || []).includes(activeTag);
      return hitSearch && hitTag;
    });
  }, [tools, search, activeTag]);

  // ---------------------------------------------------------------- 操作
  const openAdd = () => { setNote(''); setEntryInfo({ state: 'idle', files: [] }); setForm(emptyForm()); };
  const openEdit = (t: Tool) => {
    setNote('');
    setEntryInfo({ state: 'idle', files: [] });
    setForm({
      origDir: t.dir,
      name: t.name,
      dir: t.dir,
      path: `tools/${t.dir}`,
      entry: t.entry,
      description: t.description || '',
      icon: t.icon || '',
      tags: (t.tags || []).join(', '),
      navTheme: normalizeNavTheme(t.navTheme),
    });
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setNote('');
    try {
      const data = await post('/api/tools/save', {
        origDir: form.origDir,
        dir: form.dir.trim(),
        name: form.name.trim(),
        entry: form.entry.trim(),
        description: form.description.trim(),
        icon: form.icon.trim(),
        tags: form.tags,
        navTheme: form.navTheme,
      });
      if (data.success) {
        setTools(data.tools || []);
        setForm(null);
      } else {
        setNote(data.message || '保存失败');
      }
    } catch (e: any) {
      setNote(`保存失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!del) return;
    setBusy(true);
    try {
      const data = await post('/api/tools/delete', { dir: del.dir });
      if (data.success) setTools(data.tools || []);
      else setNote(data.message || '删除失败');
    } finally {
      setBusy(false);
      setDel(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-10 py-6 md:py-10 pt-24 md:pt-28 relative z-10">

      {/* 标题 */}
      <div className="mb-8 md:mb-14 text-center">
        <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white mb-2 md:mb-4 tracking-tighter">
          工具
        </h1>
        <p className="text-xs md:text-base text-slate-500 dark:text-slate-400 font-medium italic opacity-80">
          “ 🔧 本网站里的网页工具，点开就能用 ”
        </p>
      </div>

      {/* 搜索 + 标签 */}
      <div className="mb-8 md:mb-12 flex flex-col items-center gap-5 md:gap-8">
        <div className="relative w-full max-w-lg group px-2 md:px-0">
          <input
            type="text"
            placeholder="搜寻想要的小工具..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl border border-white/40 dark:border-white/5 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 pl-10 md:pl-14 text-sm md:text-base text-slate-800 dark:text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder-slate-400 font-medium"
          />
          <svg className="w-4 h-4 md:w-6 md:h-6 absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        {allTags.length > 1 && (
          <div className="flex flex-wrap justify-center gap-1.5 md:gap-2 px-2 md:px-0">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`px-3 py-1.5 md:px-5 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black transition-all duration-500 border ${
                  activeTag === tag
                    ? 'bg-indigo-500 text-white border-indigo-500 shadow-md scale-105'
                    : 'bg-white/30 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400 border-white/20 dark:border-white/5 hover:bg-white/60 dark:hover:bg-slate-700/60'
                }`}
              >
                {tag === '全部' ? tag : `# ${tag}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {err && (
        <p className="mb-6 text-center text-xs text-rose-500 dark:text-rose-400 font-bold">{err}</p>
      )}

      {/* 卡片墙 */}
      {loading ? (
        <p className="text-center text-xs text-slate-400 py-16"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />读取中…</p>
      ) : (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* ⚠️ 首页那个「工具」卡片只放带 + 标签的工具，且最多 3 个（第 4 格留给「更多工具」） —— 超了在这里提醒 */}
          {filtered.filter((t) => (t.tags || []).map((x) => String(x).trim()).includes('+')).length > 3 && (
            <div className="mb-5 rounded-2xl border border-amber-400/60 bg-amber-500/10 px-4 py-3 text-[12px] font-bold text-amber-600 dark:text-amber-400 leading-relaxed">
              ⚠️ 首页「工具」卡片最多显示 3 个带 <b>+</b> 标签的工具，现在有{' '}
              {filtered.filter((t) => (t.tags || []).map((x) => String(x).trim()).includes('+')).length} 个标了 <b>+</b>
              —— 请去掉几个，否则首页只会显示前 3 个。
            </div>
          )}

          {/* 👇 新增工具：和项目矩阵那张虚线卡一样的 + 号动画（悬停转 90°） */}
          <motion.div
            layout
            onClick={openAdd}
            className="group cursor-pointer flex flex-col items-center justify-center min-h-[220px] md:min-h-[320px] rounded-[32px] md:rounded-[40px] border-4 border-dashed border-slate-300 dark:border-slate-700 bg-white/10 hover:border-indigo-500 hover:bg-indigo-500/5 transition-all duration-500"
          >
            <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-indigo-500 group-hover:text-white transition-all shadow-md group-hover:rotate-90">
              <Plus size={40} />
            </div>
            <span className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-slate-400 group-hover:text-indigo-500">INIT NEW TOOL</span>
          </motion.div>

          <AnimatePresence mode="popLayout">
            {filtered.map((t) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={t.dir}
                className="relative group"
              >
                {/* 悬浮管理按钮（手机常显） */}
                <div className="absolute top-5 right-5 z-30 flex gap-2 opacity-0 group-hover:opacity-100 max-lg:opacity-100! transition-all">
                  <button onClick={() => openEdit(t)} title="编辑" className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"><Pencil size={16} /></button>
                  <button onClick={() => setDel(t)} title="删除" className="w-9 h-9 rounded-xl bg-red-500 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"><Trash2 size={16} /></button>
                </div>

                <a
                  href={`/tools/${encodeURIComponent(t.dir)}/${t.entry.split('/').map(encodeURIComponent).join('/')}`}
                  className="block h-full rounded-[32px] md:rounded-[40px] bg-white/50 dark:bg-slate-800/50 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-xl overflow-hidden transition-all duration-700 hover:-translate-y-1 p-6 md:p-8"
                >
                  <div className="flex items-start gap-4 md:gap-5">
                    <div className="w-12 h-12 md:w-16 md:h-16 shrink-0 rounded-xl md:rounded-2xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center overflow-hidden text-slate-800 dark:text-white">
                      {t.icon ? (
                        <ToolIcon icon={t.icon} />
                      ) : (
                        <span className="text-[10px] font-black text-indigo-400/70">NO ICON</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                        {t.name}
                      </h2>
                      {t.description && (
                        <p className="mt-1.5 text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-snug line-clamp-3">{t.description}</p>
                      )}

                      {t.tags && t.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {t.tags.map((x) => (
                            <span key={x} className="text-[9px] font-black text-slate-500 dark:text-slate-400 bg-slate-500/5 dark:bg-white/5 px-2 py-0.5 rounded-md border border-slate-500/10 dark:border-white/5">#{x}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="mt-4 text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">
                    /tools/{t.dir}/{t.entry}
                  </p>
                </a>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ============================ 新增 / 编辑弹窗 ============================ */}
      <AnimatePresence>
        {form && (
          <Overlay onClose={() => setForm(null)}>
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              className="tool-dialog w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl border border-white/40 dark:border-white/10 p-4 md:p-7 overflow-y-auto overscroll-contain custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="text-base md:text-xl font-black text-slate-900 dark:text-white">
                  {form.origDir ? '编辑工具' : '新增工具'}
                </h3>
                <button onClick={() => setForm(null)} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors"><X size={16} /></button>
              </div>

              {/* 名称 */}
              <Field label="名称（显示在卡片上的名字）">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：随机数生成器"
                  className={INPUT}
                />
              </Field>

              {/* 项目路径（可选，只是帮你把目录名带出来） */}
              <Field label="项目路径（可选，选完会把最后一级填到下面）">
                <div className="flex gap-2">
                  <input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="tools/random_generator" className={INPUT} />
                  <button type="button" onClick={() => setPicker('path')} className={BTN_GHOST}><FolderOpen size={15} /> 浏览</button>
                </div>
              </Field>

              {/* 目录名 = 地址栏那一段 */}
              <Field label="项目目录名（地址栏 /tools/ 后面那一段，决定文件夹名）">
                <div className="flex gap-2 items-start">
                  <div className="flex-1">
                    <input
                      value={form.dir}
                      onChange={(e) => setForm({ ...form, dir: e.target.value })}
                      placeholder="random_generator"
                      className={`${INPUT} ${form.dir && !checkDirName(form.dir).ok ? 'border-rose-400 dark:border-rose-500 focus:ring-rose-400/50' : ''}`}
                    />
                    {form.dir && checkDirName(form.dir).msg && (
                      <p className="mt-1 text-[10px] md:text-[11px] font-bold text-rose-500 leading-snug">⚠ {checkDirName(form.dir).msg}</p>
                    )}
                    {form.dir && form.path && form.dir !== lastSeg(form.path) && (
                      <p className="mt-1 text-[10px] md:text-[11px] font-bold text-amber-500 leading-snug">
                        ⚠ 当前的文件名会覆盖工具网页项目目录名。
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, dir: lastSeg(form.path) })}
                      disabled={!form.path}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[10px] md:text-[11px] font-black hover:bg-indigo-500 hover:text-white transition-colors disabled:opacity-40"
                    >
                      使用已有名称
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, dir: '' })}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-300 text-[10px] md:text-[11px] font-black hover:bg-slate-500 hover:text-white transition-colors"
                    >
                      清空
                    </button>
                  </div>
                </div>
              </Field>

              {/* 主网页文件名 */}
              <Field label="运行网页的文件名（点卡片时打开的就是它）">
                <div className="flex gap-2">
                  <input value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} placeholder="RandomGenerator.html" className={INPUT} />
                  <button type="button" onClick={() => setPicker('file')} className={BTN_GHOST}><FileText size={15} /> 浏览</button>
                </div>

                {/* 实时体检：这个名字在服务器上那个目录里到底有没有 */}
                {entryInfo.state === 'missing' && (
                  <div className="mt-1.5">
                    <p className="text-[10px] md:text-[11px] font-bold text-rose-500 leading-snug">
                      ⚠ tools/{form.dir}/{form.entry} 这个名字在该目录里找不到 —— 名字对不上或文件还没上传，点卡片会打不开（404）。
                    </p>
                    {entryInfo.files.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-bold">目录里现有：</span>
                        {entryInfo.files.slice(0, 8).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setForm({ ...form, entry: f })}
                            className="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[10px] font-black hover:bg-indigo-500 hover:text-white transition-colors"
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {entryInfo.state === 'nodir' && (
                  <p className="mt-1.5 text-[10px] md:text-[11px] font-bold text-amber-500 leading-snug">
                    ⚠ tools/{form.dir} 目录还不存在 —— 保存时会自动创建；建完记得把网页文件放进去，否则点开是 404。
                  </p>
                )}
                {entryInfo.state === 'ok' && (
                  <p className="mt-1.5 text-[10px] md:text-[11px] font-bold text-emerald-500 leading-snug">
                    ✓ 目录里找到了：{form.entry}
                  </p>
                )}
              </Field>

              {/* 描述 */}
              <Field label="描述（这个工具是干嘛的）">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="写一两句，卡片上会显示"
                  className={`${INPUT} resize-none`}
                />
              </Field>

              {/* 标签 */}
              <Field label="标签（用逗号隔开，前台可以按标签筛选）">
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="时间, 计算" className={INPUT} />
              </Field>

              {/* 导航栏主题 */}
              <Field label="工具页里的导航栏主题（顶部那条）">
                <div className="flex flex-wrap gap-1.5">
                  {NAV_THEMES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      title={opt.hint}
                      onClick={() => setForm({ ...form, navTheme: opt.value })}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-colors border ${
                        form.navTheme === opt.value
                          ? 'bg-indigo-500 text-white border-indigo-500'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-transparent hover:border-indigo-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] md:text-[11px] text-slate-400 leading-snug">
                  {NAV_THEMES.find((o) => o.value === form.navTheme)?.hint}
                </p>
              </Field>

              {/* 图标 */}
              <Field label="图标">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIconOpen(true)}
                    className="group w-16 h-16 md:w-20 md:h-20 rounded-xl md:rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white/40 dark:bg-slate-800/40 flex items-center justify-center overflow-hidden hover:border-indigo-500 transition-colors text-slate-800 dark:text-white"
                  >
                    {form.icon ? (
                      <ToolIcon icon={form.icon} />
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-indigo-500 group-hover:text-white group-hover:rotate-90 transition-all shadow">
                        <Plus size={22} />
                      </span>
                    )}
                  </button>
                  {form.icon && (
                    <button type="button" onClick={() => setForm({ ...form, icon: '' })} className="text-[11px] font-black text-slate-400 hover:text-rose-500 transition-colors">
                      清除图标
                    </button>
                  )}
                </div>
              </Field>

              {note && <p className="mt-3 text-[11px] md:text-xs font-bold text-rose-500 leading-snug">{note}</p>}

              <div className="mt-5 flex gap-2">
                <button onClick={() => setForm(null)} className="flex-1 py-3 rounded-xl text-slate-500 font-black text-xs uppercase">取消</button>
                <button
                  onClick={save}
                  disabled={busy || !form.name.trim() || !form.dir.trim() || !form.entry.trim() || !checkDirName(form.dir).ok}
                  className="flex-1 py-3 rounded-xl bg-indigo-500 text-white font-black text-xs uppercase shadow-lg flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} 保存
                </button>
              </div>
            </motion.div>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ============================ 浏览目录 / 文件 ============================ */}
      <AnimatePresence>
        {picker && form && (
          <BrowseDialog
            apiBase={apiBase}
            mode={picker === 'path' ? 'dir' : 'file'}
            startPath={picker === 'file' && form.dir ? `tools/${form.dir}` : (form.path || 'tools')}
            onClose={() => setPicker(null)}
            onPickDir={(p) => {
              setForm((f) => {
                if (!f) return f;
                // 选目录：路径填上；目录名还没写就顺手带上最后一级
                const seg = lastSeg(p);
                return { ...f, path: p, dir: f.dir ? f.dir : seg };
              });
              setPicker(null);
            }}
            onPickFile={(p) => {
              setForm((f) => {
                if (!f) return f;
                const prefix = f.dir ? `tools/${f.dir}/` : '';
                const rel = prefix && p.startsWith(prefix) ? p.slice(prefix.length) : lastSeg(p);
                return { ...f, entry: rel };
              });
              setPicker(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* ============================ 选图标 ============================ */}
      <AnimatePresence>
        {iconOpen && form && (
          <IconDialog
            apiBase={apiBase}
            current={form.icon}
            onClose={() => setIconOpen(false)}
            onPick={(url) => { setForm({ ...form, icon: url }); setIconOpen(false); }}
          />
        )}
      </AnimatePresence>

      {/* ============================ 删除确认 ============================ */}
      <AnimatePresence>
        {del && (
          <Overlay onClose={() => setDel(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl border border-white/40 dark:border-white/10 p-5 md:p-7"
            >
              <h3 className="text-base md:text-lg font-black text-slate-900 dark:text-white mb-2">删除「{del.name}」？</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                文件夹会挪到 <span className="font-mono">tools/.trash/</span>，清单里也去掉；后悔了可以手动搬回来。
              </p>
              <div className="mt-5 flex gap-2">
                <button onClick={() => setDel(null)} className="flex-1 py-3 rounded-xl text-slate-500 font-black text-xs uppercase">取消</button>
                <button onClick={doDelete} disabled={busy} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-xs uppercase shadow-lg disabled:opacity-40">删除</button>
              </div>
            </motion.div>
          </Overlay>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ======================================================================== */
/* 下面都是弹窗里用的小零件                                                    */
/* ======================================================================== */

const INPUT = 'w-full bg-slate-100 dark:bg-slate-800/70 border border-transparent focus:border-indigo-500 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm text-slate-800 dark:text-white outline-none transition-colors font-medium';
const BTN_GHOST = 'shrink-0 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] md:text-xs font-black flex items-center gap-1.5 hover:bg-indigo-500 hover:text-white transition-colors';

/**
 * 🎭 工具图标画法。
 *
 * · 网络图标（`iconify:库:名字`）和 .svg 文件 → 用 **CSS mask** 画：
 *   只取它的形状，颜色交给 `currentColor` —— 所以**深色模式自动变白、浅色自动变深** ✓
 *   （以前用 <img>，颜色是 SVG 文件里写死的，深色下就是一团黑 ✗）
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 md:mb-5">
      <label className="block mb-1.5 text-[10px] md:text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center md:items-start md:pt-[12vh] bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full flex justify-center">{children}</div>
    </div>
  );
}

/** 浏览目录 / 文件：支持关键字搜索（* ? 通配符） */
/** 主网页文件一般就是 .html / .htm */
const isHtmlExt = (ext: string) => ext === '.html' || ext === '.htm';

function BrowseDialog({
  apiBase, mode, startPath, onClose, onPickDir, onPickFile,
}: {
  apiBase: string;
  /** 'dir' = 选目录、'file' = 选文件。容错：传 'path' 之类也当"选目录" */
  mode: string;
  startPath: string;
  onClose: () => void;
  onPickDir: (p: string) => void;
  onPickFile: (p: string) => void;
}) {
  // ⚠️ 调用「项目路径」那个浏览时历史上传进来的是 'path'，而这里判断的是 'dir'，
  //    于是点它走的是"选文件"分支：标题错写成「选择主网页文件」、后端只回文件夹（因为 mode≠file）、
  //    底部变成灰着的「就用它」，而「选它 / 就选当前目录」永远不出现。
  //    统一在这里归一化，两边怎么传都不会再错。
  const dirMode = mode !== 'file';
  const [cur, setCur] = useState(startPath || 'tools');
  const [dirs, setDirs] = useState<DirItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [parent, setParent] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  // 选文件改成「先选中 → 再确认」：以前点一下立刻就用，既没有确认按钮，也看不出选没选上
  const [picked, setPicked] = useState<FileItem | null>(null);
  const [exists, setExists] = useState(true);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/tools/browse?path=${encodeURIComponent(p)}&mode=${dirMode ? 'dir' : 'file'}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        const list: FileItem[] = data.files || [];
        setDirs(data.dirs || []);
        setFiles(list);
        setParent(data.parent || '');
        setCur(data.path || '');
        setExists(data.exists !== false);
        // 进目录后自动预选 index.html（没有就选第一个网页文件），多数情况直接按确认就行
        setPicked(dirMode
          ? null
          : (list.find((f) => f.name.toLowerCase() === 'index.html')
            || list.find((f) => isHtmlExt(f.ext))
            || null));
      }
    } finally {
      setLoading(false);
    }
  }, [apiBase, dirMode]);

  useEffect(() => { void load(startPath || 'tools'); }, [load, startPath]);

  /** 关键字 → 正则：* 任意、? 单字符；没通配符就当"包含" */
  const match = (name: string) => {
    const s = q.trim();
    if (!s) return true;
    const hasWild = /[*?]/.test(s);
    const re = new RegExp('^' + s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + (hasWild ? '$' : ''), 'i');
    return hasWild ? re.test(name) : name.toLowerCase().includes(s.toLowerCase());
  };

  const shownDirs = dirs.filter((d) => match(d.name));
  const shownFiles = files.filter((f) => match(f.name));

  return (
    <Overlay onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        className="tool-dialog-sm w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl border border-white/40 dark:border-white/10 overflow-hidden flex flex-col"
      >
        <div className="p-3.5 md:p-5 border-b border-slate-100 dark:border-white/5 flex items-center gap-2">
          <button onClick={() => parent !== '' || cur ? load(parent) : null} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-colors" title="上一级">
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black text-slate-400 uppercase">{dirMode ? '选择网页项目目录' : '选择主网页文件'}</p>
            <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate">/{cur}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        <div className="p-3 md:p-4">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索（支持 * 和 ? 通配符）"
            className={INPUT}
          />
          <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
            {dirMode
              ? '点文件夹进去；想选哪个目录，直接按那一行右边的「选它」。'
              : '点文件夹进去；点文件选中，再按右下角「就用它」确认（双击文件可以直接确认）。'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 md:px-4 pb-3">
          {loading && <p className="text-center text-[11px] text-slate-400 py-6">读取中…</p>}

          {!loading && shownDirs.map((d) => (
            <div key={d.path} className="flex items-center gap-2 py-1.5">
              <button onClick={() => load(d.path)} className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <FolderOpen size={15} className="text-amber-500 shrink-0" /> <span className="truncate">{d.name}</span>
              </button>
              {dirMode && (
                <button onClick={() => onPickDir(d.path)} className="px-2.5 py-1.5 rounded-lg bg-indigo-500 text-white text-[10px] font-black shrink-0">选它</button>
              )}
            </div>
          ))}

          {!loading && shownFiles.map((f) => {
            const on = picked?.path === f.path;
            return (
              <button
                key={f.path}
                onClick={() => setPicked(f)}
                onDoubleClick={() => onPickFile(f.path)}
                title={isHtmlExt(f.ext) ? '单击选中，双击直接确认' : '这不是网页文件（主网页文件一般是 .html）'}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold transition-colors ${
                  on
                    ? 'bg-indigo-500/15 ring-1 ring-indigo-500 text-indigo-600 dark:text-indigo-300'
                    : isHtmlExt(f.ext)
                      ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <FileText size={15} className={isHtmlExt(f.ext) ? 'text-indigo-500 shrink-0' : 'text-slate-400 shrink-0'} />
                <span className="truncate">{f.name}</span>
                {on && <span className="ml-auto shrink-0 text-[10px] font-black">已选</span>}
              </button>
            );
          })}

          {!loading && !dirMode && exists && files.length === 0 && dirs.length > 0 && (
            <p className="text-center text-[11px] text-amber-500 py-4">
              这个目录里一个文件都没有，只有子文件夹 —— 主网页文件（一般是 <b>index.html</b>）是不是还没传上来？
            </p>
          )}

          {!loading && shownDirs.length === 0 && shownFiles.length === 0 && (
            <p className="text-center text-[11px] text-slate-400 py-6">
              {exists ? '这个目录下没有匹配的东西' : '服务器上还没有这个目录（先把文件传上去）'}
            </p>
          )}
        </div>

        {dirMode ? (
          <div className="p-3 md:p-4 border-t border-slate-100 dark:border-white/5">
            <button onClick={() => onPickDir(cur)} className="w-full py-2.5 rounded-xl bg-indigo-500 text-white text-xs font-black">
              就选当前目录：/{cur || '（根目录）'}
            </button>
          </div>
        ) : (
          <div className="p-3 md:p-4 border-t border-slate-100 dark:border-white/5 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black text-slate-400 uppercase">已选中</p>
              <p className={`text-[11px] font-mono truncate ${picked ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400'}`}>
                {picked ? `/${picked.path}` : '点上面的文件选中它'}
              </p>
            </div>
            <button
              disabled={!picked}
              onClick={() => picked && onPickFile(picked.path)}
              className={`px-4 py-2.5 rounded-xl text-xs font-black shrink-0 transition-colors ${
                picked ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
              }`}
            >
              就用它
            </button>
          </div>
        )}
      </motion.div>
    </Overlay>
  );
}

/** 选图标：本地（public/uploads/ico，可上传） + 网络（Iconify 聚合库，选中自动存成本地图标） */
function IconDialog({
  apiBase, current, onClose, onPick,
}: {
  apiBase: string;
  current: string;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [tab, setTab] = useState<'local' | 'net'>('local');
  const [icons, setIcons] = useState<IconItem[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');

  // —— 网络图标库那半边 ——
  const [sets, setSets] = useState<{ prefix: string; label: string }[]>([]);
  const [set, setSet] = useState('');
  /** 搜索范围：关 = 在所有来源里搜；开 = 只在上面的来源里搜（没选来源时这项不可用） */
  const [onlyCurrent, setOnlyCurrent] = useState(true);
  const [netIcons, setNetIcons] = useState<{ name: string; svg: string }[]>([]);
  const [netLoading, setNetLoading] = useState(false);
  const [netMsg, setNetMsg] = useState('');
  const [netPicked, setNetPicked] = useState('');

  // —— iconfont（阿里矢量图标库）项目导入 ——
  const [fontUrl, setFontUrl] = useState('');
  const [fontBusy, setFontBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/tools/icons`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setIcons(data.icons || []);
      else setMsg(data.message || '读取图标失败');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);

  // 打开「网络」标签时拉一次来源列表（图标库清单）
  useEffect(() => {
    if (tab !== 'net' || sets.length > 0 || !apiBase) return;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/tools/icon/sets`, { cache: 'no-store' });
        const data = await res.json();
        if (data.success) setSets(data.sets || []);
      } catch {
        /* 拉不到就只显示"全部图标库"，搜索照样能用 */
      }
    })();
  }, [tab, sets.length, apiBase]);

  // 关键字 / 来源变化 → 停 400ms 去搜（**服务器代取**，浏览器不碰外网）
  useEffect(() => {
    if (tab !== 'net' || !apiBase) return;
    const kw = q.trim();
    if (!kw) {
      setNetIcons([]);
      setNetMsg('输入关键字开始搜（例如 home、user、时间、github、minecraft）');
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      setNetLoading(true);
      setNetMsg('');
      // 范围：勾了"只搜当前来源"且确实选了来源 → 限定 prefix；否则在所有来源里搜
      const scope = onlyCurrent ? set : '';
      try {
        const res = await fetch(
          `${apiBase}/api/tools/icon/search?q=${encodeURIComponent(kw)}&prefix=${encodeURIComponent(scope)}&limit=48`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (!alive) return;
        setNetIcons(data.icons || []);
        if (data.message) setNetMsg(data.message);
        else if (!(data.icons || []).length) setNetMsg('没搜到，换个词试试');
      } catch (e: any) {
        if (alive) setNetMsg(`搜索失败：${e?.message || e}`);
      } finally {
        if (alive) setNetLoading(false);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [tab, q, set, onlyCurrent, apiBase]);

  /** 点一个网络图标 → 后端下载成本地图标（public/uploads/ico），然后直接选中它 */
  const importNet = async (name: string) => {
    setNetPicked(name);
    setNetMsg('');
    try {
      const res = await fetch(`${apiBase}/api/tools/icon/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        await load();          // 本地那份也刷新，回头能在「本地」标签里看到它
        onPick(data.url);
      } else {
        setNetMsg(data.message || '下载失败');
      }
    } catch (e: any) {
      setNetMsg(`下载失败：${e?.message || e}`);
    } finally {
      setNetPicked('');
    }
  };

  /** 🅰️ 从 iconfont 项目导入：把项目里所有图标存成本地图标，然后切到「本地」标签让用户挑 */
  const importFont = async () => {
    const url = fontUrl.trim();
    if (!url) return;
    setFontBusy(true);
    setNetMsg('');
    try {
      const res = await fetch(`${apiBase}/api/tools/icon/import-font`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.success) {
        await load();
        setNetMsg(`✓ 从 iconfont 导入了 ${data.count} 个图标，切到「本地图标」就能看到并选用`);
        setFontUrl('');
        setTimeout(() => setTab('local'), 600);
      } else {
        setNetMsg(data.message || '导入失败');
      }
    } catch (e: any) {
      setNetMsg(`导入失败：${e?.message || e}`);
    } finally {
      setFontBusy(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${apiBase}/api/tools/icon/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        await load();
        onPick(data.url);   // 传完直接选中，省一步
      } else {
        setMsg(data.message || '上传失败');
      }
    } catch (e: any) {
      setMsg(`上传失败：${e?.message || e}`);
    } finally {
      setUploading(false);
    }
  };

  const shown = icons.filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()) || i.file.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Overlay onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        className="tool-dialog-sm w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl border border-white/40 dark:border-white/10 overflow-hidden flex flex-col"
      >
        <div className="p-3.5 md:p-5 border-b border-slate-100 dark:border-white/5 flex items-center gap-2">
          <div className="flex-1 flex gap-1.5">
            {(['local', 'net'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-colors ${tab === k ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
              >
                {k === 'local' ? '本地图标' : '网络图标'}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        <div className="p-3 md:p-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'local' ? '按名称搜索本地图标…' : '搜网络图标（例如 clock / 时间 / github）'}
            className={INPUT}
          />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 md:px-4 pb-4">
          {tab === 'local' ? (
            <>
              {loading && <p className="text-center text-[11px] text-slate-400 py-6">读取中…</p>}
              <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                {/* 上传本地图标：和新建卡片同款 + 号动画 */}
                <label className="group aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors">
                  <input
                    type="file"
                    accept=".svg,.ico,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }}
                  />
                  {uploading ? (
                    <Loader2 size={18} className="animate-spin text-indigo-500" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-indigo-500 group-hover:text-white group-hover:rotate-90 transition-all">
                      <Plus size={18} />
                    </span>
                  )}
                </label>

                {shown.map((i) => (
                  <button
                    key={i.file}
                    onClick={() => onPick(i.url)}
                    title={i.name}
                    className={`aspect-square rounded-xl border bg-white/60 dark:bg-slate-800/60 flex items-center justify-center p-1.5 hover:border-indigo-500 transition-colors text-slate-800 dark:text-white ${current === i.url ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-200 dark:border-white/10'}`}
                  >
                    <ToolIcon icon={i.url} className="w-full h-full" />
                  </button>
                ))}
              </div>

              {!loading && shown.length === 0 && (
                <p className="text-center text-[11px] text-slate-400 py-4">
                  还没有本地图标 —— 点左上角那个 + 上传一个（存到 public/uploads/ico，前后台立刻就能用）
                </p>
              )}
            </>
          ) : (
            <div className="py-1">
              {/* 来源下拉（第一个是「全部图标库」，后面才是各个来源）+ 搜索范围开关 */}
              <div className="flex items-center gap-2 mb-2.5">
                <select
                  value={set}
                  onChange={(e) => setSet(e.target.value)}
                  className="flex-1 min-w-0 bg-slate-100 dark:bg-slate-800/70 border border-transparent focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs md:text-sm text-slate-800 dark:text-white outline-none font-medium"
                >
                  <option value="">全部图标库</option>
                  {sets.map((s) => (
                    <option key={s.prefix} value={s.prefix}>{s.label}</option>
                  ))}
                </select>

                <label
                  title={set ? '勾上就只在这个来源里搜；不勾就在所有来源里搜' : '先在上面的下拉里选一个来源'}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl border text-[10px] md:text-[11px] font-black whitespace-nowrap transition-colors ${
                    set
                      ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 cursor-pointer'
                      : 'border-slate-200 dark:border-white/10 text-slate-400 opacity-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!set}
                    checked={onlyCurrent && Boolean(set)}
                    onChange={(e) => setOnlyCurrent(e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-500"
                  />
                  只搜当前来源
                </label>
              </div>

              <p className="mb-2 text-[10px] text-slate-400 leading-relaxed">
                {!set
                  ? '范围：全部图标库（想限定某一个，就在下拉里选它，再勾上"只搜当前来源"）'
                  : onlyCurrent
                    ? `范围：只在「${sets.find((s) => s.prefix === set)?.label || set}」里搜`
                    : `范围：全部图标库（已选「${sets.find((s) => s.prefix === set)?.label || set}」但没勾限定）`}
              </p>

              {netLoading && (
                <p className="text-center text-[11px] text-slate-400 py-8">
                  <Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" />搜索中…
                </p>
              )}

              {!netLoading && netIcons.length > 0 && (
                <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                  {netIcons.map((ic) => (
                    <div key={ic.name} className="relative">
                      {/* 点一下 = 直接用它（存的是 iconify:库:名字 的引用，走同源代理加载，不落地） */}
                      <button
                        type="button"
                        title={`${ic.name}（点一下直接用它）`}
                        onClick={() => onPick(`iconify:${ic.name}`)}
                        className={`w-full aspect-square rounded-xl border bg-white/70 dark:bg-slate-800/70 flex items-center justify-center hover:border-indigo-500 transition-colors text-slate-800 dark:text-white ${
                          current === `iconify:${ic.name}` ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-200 dark:border-white/10'
                        }`}
                        dangerouslySetInnerHTML={{ __html: ic.svg }}
                      />
                      {/* 想留一份在本地（不依赖外网）就点这个角标 */}
                      <button
                        type="button"
                        title="存到本地（public/uploads/ico），选中后不再依赖外网"
                        onClick={() => importNet(ic.name)}
                        disabled={netPicked === ic.name}
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-slate-900/85 text-white flex items-center justify-center shadow hover:bg-indigo-500 transition-colors"
                      >
                        {netPicked === ic.name ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {netMsg && <p className="mt-3 text-center text-[11px] text-slate-400 leading-relaxed">{netMsg}</p>}

              <p className="mt-3 text-center text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                点图标 = 直接用它（走本站代理加载，深色模式自动变白、浅色自动变深）；
                <br />
                想留一份在本地就点右下角那个 ⤓ 角标（存进 public/uploads/ico，之后完全不依赖外网）。
              </p>

              {/* 🅰️ 阿里巴巴矢量图标库（iconfont.cn）：官方没有免登录的全站搜索接口，
                  所以这里接的是**你自己的项目** —— 把项目的 Symbol JS 链接粘进来即可 */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                <p className="text-[10px] md:text-[11px] font-black text-slate-500 dark:text-slate-400 mb-1.5">
                  🅰️ 从 iconfont 项目导入（阿里矢量图标库）
                </p>
                <div className="flex gap-2">
                  <input
                    value={fontUrl}
                    onChange={(e) => setFontUrl(e.target.value)}
                    placeholder="//at.alicdn.com/t/c/font_xxxxxx_xxxx.js"
                    className={INPUT}
                  />
                  <button
                    type="button"
                    onClick={importFont}
                    disabled={fontBusy || !fontUrl.trim()}
                    className="shrink-0 px-3 rounded-xl bg-indigo-500 text-white text-[11px] md:text-xs font-black flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {fontBusy ? <Loader2 size={14} className="animate-spin" /> : null} 导入
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 leading-relaxed">
                  在 iconfont.cn 项目页里这样拿链接：
                  <span className="text-slate-500 dark:text-slate-300 font-bold">① 点「Symbol」标签</span> →
                  <span className="text-slate-500 dark:text-slate-300 font-bold">② 点右侧「查看在线链接」</span> →
                  <span className="text-slate-500 dark:text-slate-300 font-bold">③ 复制展开出来那串 //at.alicdn.com/…js</span>
                  <br />
                  （图标格子上显示的 <span className="font-mono">icon-xxxx</span> 是图标名、不是链接；「Font class」的 .css 也不行，那里面没有图形）
                  导入后会存成本地图标（public/uploads/ico），前后台立刻可用。
                </p>
              </div>
            </div>
          )}

          {msg && <p className="mt-3 text-[11px] font-bold text-rose-500">{msg}</p>}
        </div>
      </motion.div>
    </Overlay>
  );
}
