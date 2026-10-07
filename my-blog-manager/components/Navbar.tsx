"use client";

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MenuLines } from './MorphIcons';
import { useOperations } from '../context/OperationContext';
import { useToast } from './ToastProvider';
import { AlertTriangle } from 'lucide-react';
import { siteConfig } from '../siteConfig';
import { useTheme } from './ThemeProvider';
import { registerLayer } from './layerStack';
import { navLinks } from '../lib/navLinks';

/** 小屏导航栏高度：3.25rem = 52px（大屏仍是 h-16 = 64px）。
    和博客前台 Navbar / MobileToc 用的是同一个值，两边观感才一致。 */
const NAV_HEIGHT = '3.25rem';

/**
 * 悬停色块「像进度条一样从左往右揭开」的过渡 ✓
 *   和博客前台 Navbar 用的是**同一套参数**（两边观感一致 ✓）
 *   弹簧 → **可打断** ✓ 时长 ≤0.35s ✓ 非线性 ✓
 */
const HOVER_REVEAL = { type: 'spring' as const, duration: 0.32, bounce: 0 };

export default function Navbar() {
  const [isOpBoxOpen, setIsOpBoxOpen] = useState(false);
  // 📱 手机端（<1024px）：导航链接平时收进抽屉，靠右上角那个按钮展开
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  /** 当前鼠标悬停的选项卡 href（null = 没有悬停）—— 桌面端色块用 ✓ 触摸设备不会触发 ✓ */
  const [hovered, setHovered] = useState<string | null>(null);
  /** 抽屉本体 / 汉堡按钮：交给 layerStack 判断"这一下该不该收"，顺带挡住"点空白穿透到正文链接" */
  const menuDrawerRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  // 菜单开着时把它登记成"最上面那一层"：
  // 空白处点一下只会收它，而且**不看退场动画有没有播完**，所以可以立刻点第二下收下面那层。
  useEffect(() => {
    if (!isMenuOpen) return;
    return registerLayer({
      panel: () => menuDrawerRef.current,
      controls: () => menuButtonRef.current,
      close: () => setIsMenuOpen(false),
    });
  }, [isMenuOpen]);

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [targetBlogPath, setTargetBlogPath] = useState("");

  const pathname = usePathname();

  // 切到别的页面后自动收起手机端抽屉（不然点完链接它还盖在页面上）
  useEffect(() => { setIsMenuOpen(false); }, [pathname]);

  // 抽屉打开时锁住背景滚动（和博客前台一致）
  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  const { operations, removeOperation, clearOperations } = useOperations();
  const { showToast } = useToast();

  useEffect(() => {
    const fetchPath = async () => {
      try {
        const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
        const config = await configRes.json();
        const res = await fetch(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${config.api_port}/api/deploy/config`);
        if (res.ok) {
          const data = await res.json();
          if (data.blogPath) {
            setTargetBlogPath(data.blogPath);
            localStorage.setItem('targetBlogPath', data.blogPath);
          }
        }
      } catch (e) {
        const path = localStorage.getItem('targetBlogPath') || "F:/Projects/my-blog";
        setTargetBlogPath(path);
      }
    };
    fetchPath();
  }, []);

  // 导航栏固定顶部，不再监听滚动（和博客前台一致）

  const { isDark, toggleTheme } = useTheme();

  /** 主题切换：圆形日月图标 + 文字（和博客前台逐字一致） */
  const ThemeButton = ({ withLabel = true }: { withLabel?: boolean }) => (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? '切换到日间模式' : '切换到夜间模式'}
      className="shrink-0 flex items-center gap-1.5 rounded-full pl-1 pr-2 py-0.5 bg-white/50 dark:bg-slate-800/60 border border-white/50 dark:border-white/10 shadow-sm hover:bg-white/80 dark:hover:bg-slate-700/70 transition-colors duration-300"
    >
      <span className="relative w-6 h-6 rounded-full overflow-hidden shrink-0 shadow-inner">
        <span
          className={`absolute inset-0 transition-transform duration-700 ${
            isDark ? '-translate-y-full' : 'translate-y-0'
          } bg-gradient-to-tr from-sky-300 to-yellow-200`}
        />
        <span
          className={`absolute inset-0 transition-transform duration-700 ${
            isDark ? 'translate-y-0' : 'translate-y-full'
          } bg-gradient-to-tr from-indigo-900 to-slate-800`}
        />
        <span
          className={`absolute inset-0 flex items-center justify-center text-[11px] transition-all duration-700 ${
            isDark ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
          }`}
        >
          🌸
        </span>
        <span
          className={`absolute inset-0 flex items-center justify-center text-[11px] transition-all duration-700 ${
            isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
          }`}
        >
          ✨
        </span>
      </span>
      {withLabel && (
        <span className="text-xs font-bold whitespace-nowrap text-slate-700 dark:text-slate-200">
          {isDark ? '夜间模式' : '日间模式'}
        </span>
      )}
    </button>
  );

  // 🌟 这里新增了 /tree 路由
  // 顺序说明：和博客前台保持一致 —— 资源分享是高频入口，放在首页右边第一位
  // 🧰 「工具」紧跟在资源分享后面；归档和项目按用户要求换了位置（归档在前、项目在后）
  // ⚠️ 列表本体在 lib/navLinks.ts —— 控制台里预览工具网页时注入的那条导航栏也用同一份。

  const isActivePath = (href: string) => pathname === href || pathname === `${href}/` || (href !== '/' && pathname.startsWith(`${href}/`));
  /** 手机端导航栏右上角显示的那两个字：当前在哪个栏目 */
  const currentTab = navLinks.find((l) => isActivePath(l.href))?.name || '菜单';

  const handleMinimize = () => {
    if (typeof window !== 'undefined' && (window as any).pywebview?.api) {
      (window as any).pywebview.api.minimize_window();
    }
  };
  const handleMaximize = () => {
    if (typeof window !== 'undefined' && (window as any).pywebview?.api) {
      (window as any).pywebview.api.maximize_window();
    }
  };
  const handleClose = () => {
    if (typeof window !== 'undefined' && (window as any).pywebview?.api) {
      (window as any).pywebview.api.close_window();
    }
  };

  // 🌟 监控增强版更新逻辑
  const handleUpdateLocal = async () => {
      if (operations.length === 0) {
        showToast("队列中没有待处理的操作", "warning");
        return;
      }

      try {
        showToast(`🔍 正在准备发送 ${operations.length} 个任务...`, "info");

        const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
        const configData = await configRes.json();
        const apiBase = `http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${configData.api_port}`;

        for (const op of operations) {
          let apiUrl = '';
          let body = {};

          switch (op.type) {
            case 'sync_photowall':
              apiUrl = `${apiBase}/api/gallery/sync`;
              body = { albums: op.value };
              break;
            case 'sync_friends':
              apiUrl = `${apiBase}/api/friends/sync`;
              body = { friends: op.value };
              break;
            case 'sync_projects':
              apiUrl = `${apiBase}/api/projects/sync`;
              body = { projects: op.value };
              break;
            case 'CONFIG':
              apiUrl = `${apiBase}/api/config/update`;
              body = { updates: op.payload };
              break;
            case 'create_moment':
              apiUrl = `${apiBase}/api/moments/save`;
              body = op.payload;
              break;
            default:
              apiUrl = `${apiBase}/api/drafts/sync_local`;
              body = { operations: [op] };
              break;
          }

          showToast(`🚀 正在请求后端: ${apiUrl}`, "info");

          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          const data = await res.json();
          if (!data.success) {
            showToast(`❌ 任务执行失败: ${data.message}`, "error");
            return;
          }
        }

        showToast("✅ 任务已全部执行，本地数据已写入！", "success");
        clearOperations();
        setIsOpBoxOpen(false);

        setTimeout(() => {
          window.location.reload();
        }, 2000);

      } catch (error: any) {
        showToast(`后端连接异常: ${error.message}`, "error");
      }
    };

  const handleSyncBlogClick = () => {
    if (!targetBlogPath) {
       const fallback = localStorage.getItem('targetBlogPath') || "F:/Projects/my-blog";
       setTargetBlogPath(fallback);
    }
    setIsOpBoxOpen(false);
    setSyncModalOpen(true);
  };

  const executeSyncBlog = async () => {
    setSyncModalOpen(false);

    try {
      const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
      const configData = await configRes.json();
      showToast("🚀 正在镜像数据至目标项目，请稍候...", "info");

      const res = await fetch(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${configData.api_port}/api/sync/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogPath: targetBlogPath })
      });

      const data = await res.json();
      if (data.success) {
        showToast(data.message, "success");
      } else {
        showToast(`❌ 同步失败: ${data.message}`, "error");
      }
    } catch (error) {
      showToast("无法连接到 Python 桌面核心引擎进行同步", "error");
    }
  };

  return (
    <>
      {/* ═══════════ 💻 桌面端导航栏（≥1024px）：尺寸和博客前台同一套 ═══════════ */}
      <header className="hidden lg:block w-full fixed top-0 left-0 right-0 z-50 border-b bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl border-white/20 dark:border-white/5 shadow-sm pywebview-drag-region">
        <div className="w-[96%] max-w-[1600px] mx-auto h-16 flex items-center justify-between gap-4 px-4 sm:px-[30px] box-border">

          <div className="flex items-center gap-3 shrink-0">
            <Link href="/" className="text-xl font-black text-slate-800 dark:text-white tracking-tighter hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-300 whitespace-nowrap">
              {siteConfig.navTitle}
              <span className="text-indigo-500 mx-1">
                {siteConfig.navSuffix || 'の'}
              </span>
              {siteConfig.navAfter}
            </Link>

            {/* 和博客前台保持一致的逻辑：首页里本来就有主题切换卡片，所以只在非首页显示 */}
            {pathname !== '/' && <ThemeButton />}
          </div>

          <div className="flex items-center gap-3 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* ⚠️ 选项卡：字体族/字重跟 logo 一致，字号基准 16px、当前栏目 16.3px。
                三处导航栏（前台 / 控制台 / 工具页注入）用同一组数字。只作用于大屏这条。 */}
            <nav className="flex items-center gap-3 xl:gap-5 2xl:gap-6 text-[16px] font-black whitespace-nowrap overflow-x-auto min-w-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {/*
                ⚠️ 悬停/选中样式（和博客前台 Navbar 同一套 ✓）
                  · **字号一个字不动** ✓（基准 16px ✓ 选中 16.3px ✓）
                  · **文字颜色完全不动** ✗ → 去掉 text-* / hover:text-* ✓
                  · 悬停：高 = 文字 1/3 的色块垫在**文字下层** ✓
                    从左往右**像进度条**揭开（clip-path ✓ 不是拉伸 ✗）移开反着缩回 ✓
                  · 选中常驻：站点原有的紫 indigo-500 ✓ / 悬停淡紫 indigo-400 ✓
                  · initial **不能用 false** ✗（每页各自引 Navbar → 切页重新挂载 ✗
                    用 false 色块一进来就展开好了 ✗ 看不出揭开过程 ✓）
              */}
              {navLinks.map((link) => {
                const active = isActivePath(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative py-1 whitespace-nowrap ${active ? 'text-[16.3px]' : ''}`}
                    onMouseEnter={() => setHovered(link.href)}
                    onMouseLeave={() => setHovered((h) => (h === link.href ? null : h))}
                  >
                    <span className="relative inline-block">
                      <motion.span
                        aria-hidden
                        className={`absolute left-0 right-0 ${
                          active ? 'bg-indigo-500' : 'bg-indigo-400'
                        }`}
                        style={{ bottom: 0, height: '0.5em' }}
                        initial={{ clipPath: 'inset(0 100% 0 0)' }}
                        animate={{
                          clipPath:
                            hovered === link.href || active
                              ? 'inset(0 0% 0 0)'
                              : 'inset(0 100% 0 0)',
                        }}
                        transition={HOVER_REVEAL}
                      />
                      <span className="relative">{link.name}</span>
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="relative shrink-0">
              <button onClick={() => setIsOpBoxOpen(!isOpBoxOpen)} className="relative w-10 h-10 rounded-xl bg-white/50 dark:bg-slate-800/50 flex items-center justify-center text-lg hover:scale-105 transition-all border border-white/20 shadow-sm cursor-pointer">
                📥
                {operations.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-5 w-5 bg-red-500 text-[10px] font-black text-white items-center justify-center border-2 border-white dark:border-slate-900">
                      {operations.length}
                    </span>
                  </span>
                )}
              </button>

              <AnimatePresence>
                {isOpBoxOpen && (
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute right-0 mt-3 w-80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4 z-50 cursor-default">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">待处理操作</h3>
                      <button onClick={clearOperations} className="text-[10px] text-red-500 font-bold hover:underline">清空全部</button>
                    </div>

                    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto mb-4 custom-scrollbar">
                      {operations.length === 0 ? (
                        <p className="text-center py-6 text-sm text-slate-400 font-medium">暂无积攒的操作</p>
                      ) : (
                        operations.map(op => (
                          <div key={op.id} className="bg-white/50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700 flex justify-between items-center group">
                            <div className="flex flex-col">
                              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{op.label}</span>
                              <span className="text-[10px] text-slate-400">{op.timestamp}</span>
                            </div>
                            <button onClick={() => removeOperation(op.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all text-lg">✕</button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={handleSyncBlogClick} className="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        🔄 同步 Blog
                      </button>
                      <button onClick={handleUpdateLocal} className="py-2.5 rounded-xl bg-indigo-500 text-white text-xs font-black shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 transition-colors">
                        🚀 更新本地
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* pywebview 的三个窗口按钮（只有桌面端 + 窗口模式才有意义） */}
            <div className="flex items-center gap-2 ml-2 pl-6 border-l border-slate-300/50 dark:border-slate-600/50 shrink-0">
              <button onClick={handleMinimize} className="w-3.5 h-3.5 rounded-full bg-yellow-400 hover:bg-yellow-500 flex items-center justify-center group transition-colors shadow-sm cursor-pointer z-[101]">
                <span className="opacity-0 group-hover:opacity-100 text-[8px] text-yellow-900 font-black">-</span>
              </button>
              <button onClick={handleMaximize} className="w-3.5 h-3.5 rounded-full bg-green-400 hover:bg-green-500 flex items-center justify-center group transition-colors shadow-sm cursor-pointer z-[101]">
                <span className="opacity-0 group-hover:opacity-100 text-[8px] text-green-900 font-black">+</span>
              </button>
              <button onClick={handleClose} className="w-3.5 h-3.5 rounded-full bg-red-400 hover:bg-red-500 flex items-center justify-center group transition-colors shadow-sm cursor-pointer z-[101]">
                <span className="opacity-0 group-hover:opacity-100 text-[8px] text-red-900 font-black">×</span>
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* ═══════════ 📱 手机端导航栏（<1024px）：和博客前台同一套尺寸 ═══════════
          52px 高；左边 logo + 主题按钮 +（控制台多出来的）待处理操作盒，
          右边当前栏目 + 抽屉按钮。13 个链接都在抽屉里。桌面端不渲染这一块。 */}
      <header
        className="lg:hidden w-full fixed top-0 left-0 right-0 z-[60] border-b bg-white/60 dark:bg-slate-900/70 backdrop-blur-xl border-white/20 dark:border-white/5 shadow-sm pywebview-drag-region"
        style={{ height: NAV_HEIGHT }}
      >
        <div className="h-full flex items-center justify-between gap-2 px-3 sm:px-4">

          {/* 左：标题 + 主题按钮 +（控制台专属）待处理操作盒 */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <Link
              href="/"
              className="min-w-0 truncate text-base sm:text-lg font-black text-slate-800 dark:text-white tracking-tight hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {siteConfig.navTitle || siteConfig.authorName}
              <span className="text-indigo-500 mx-0.5">{siteConfig.navSuffix || 'の'}</span>
              {siteConfig.navAfter || '宝藏之地'}
            </Link>

            <ThemeButton />

            {/* 控制台多出来的东西：待处理操作盒，就挂在主题按钮右边 */}
            <div className="relative shrink-0">
              <button onClick={() => setIsOpBoxOpen(!isOpBoxOpen)} className="relative w-8 h-8 rounded-xl bg-white/50 dark:bg-slate-800/60 border border-white/50 dark:border-white/10 shadow-sm flex items-center justify-center text-[15px] cursor-pointer">
                📥
                {operations.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center">
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[9px] font-black text-white items-center justify-center border-2 border-white dark:border-slate-900">
                      {operations.length}
                    </span>
                  </span>
                )}
              </button>

              <AnimatePresence>
                {isOpBoxOpen && (
                  /* 📱 锚定到**屏幕右侧**（不是按钮），宽度也按视口算 —— 这样不管按钮被挤到哪儿都不会跑出屏幕。
                     卡片位置本来就靠右，所以 fixed 相对的还是这层导航栏，尺寸写死也不会错位。 */
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="fixed right-3 top-[3.5rem] w-[calc(100vw-1.5rem)] max-w-sm bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4 z-[97] cursor-default">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">待处理操作</h3>
                      <button onClick={clearOperations} className="text-[10px] text-red-500 font-bold">清空全部</button>
                    </div>

                    <div className="flex flex-col gap-2 max-h-56 overflow-y-auto mb-4 custom-scrollbar">
                      {operations.length === 0 ? (
                        <p className="text-center py-6 text-sm text-slate-400 font-medium">暂无积攒的操作</p>
                      ) : (
                        operations.map(op => (
                          <div key={op.id} className="bg-white/50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <div className="flex flex-col min-w-0">
                              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200 truncate">{op.label}</span>
                              <span className="text-[10px] text-slate-400">{op.timestamp}</span>
                            </div>
                            <button onClick={() => removeOperation(op.id)} className="shrink-0 text-slate-400 text-lg px-1">✕</button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={handleSyncBlogClick} className="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black">🔄 同步 Blog</button>
                      <button onClick={handleUpdateLocal} className="py-2.5 rounded-xl bg-indigo-500 text-white text-xs font-black shadow-lg shadow-indigo-500/30">🚀 更新本地</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 右：当前栏目 + 抽屉按钮（和博客前台一致） */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <span className="shrink-0 max-w-[52px] sm:max-w-[92px] truncate text-[11px] sm:text-xs font-bold text-slate-400 dark:text-slate-500">
              {currentTab}
            </span>

            {/* 抽屉开关：menu.svg ⇄ close.svg（和博客前台同一套图标） */}
            <button
              type="button"
              ref={menuButtonRef}
              onClick={() => setIsMenuOpen((v) => !v)}
              aria-label={isMenuOpen ? '关闭导航菜单' : '打开导航菜单'}
              aria-expanded={isMenuOpen}
              className="relative w-8 h-8 shrink-0 rounded-xl bg-white/50 dark:bg-slate-800/60 border border-white/50 dark:border-white/10 shadow-sm hover:bg-white/80 dark:hover:bg-slate-700/70 transition-colors duration-300 cursor-pointer"
            >
              {/*
                三行（圆点＋长条）⇄ 叉：**真实线条的形变**（和前台 TLBlog 同一套）。
                原来这里是「menu.svg / close.svg 两张遮罩切换」，遮罩的内部线条
                浏览器不允许动画，所以做不出"横线转 45° 交叉"的过程。
                现在按 menu.svg 的同一套几何把线画成真实元素再动 —— 收起态外观和原来一致。
                详见 components/MorphIcons.tsx
              */}
              <MenuLines open={isMenuOpen} />
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════ 📱 手机端导航抽屉（<1024px）═══════════
          和博客前台同一套观感：遮罩从导航栏底部开始，点空白处收起；
          抽屉从右侧滑入。桌面端（lg 以上）完全不受影响。 */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              key="nav-mask"
              onClick={() => setIsMenuOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, pointerEvents: 'none' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="lg:hidden fixed left-0 right-0 bottom-0 z-[55] bg-slate-900/50 dark:bg-black/65 backdrop-blur-[2px]"
              style={{ top: NAV_HEIGHT }}
            />

            <motion.aside
              key="nav-drawer"
              ref={menuDrawerRef}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%', pointerEvents: 'none' }}
              transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.6 }}
              className="lg:hidden fixed right-0 bottom-0 z-[56] w-1/3 flex flex-col bg-white/85 dark:bg-slate-900/90 backdrop-blur-2xl border-l border-white/40 dark:border-white/10 shadow-2xl rounded-tl-3xl"
              style={{ top: NAV_HEIGHT }}
            >
              <nav className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-1">
                {/*
                  ⚠️ 手机端选项卡列表（和博客前台同一套 ✓）
                    · 去掉原来的**实色紫背景 + 白字** ✗（那会改文字颜色 ✗）
                    · 换成：文字下层高 = 文字 1/3 的色块 ✓ 选中常驻 ✓ 切换反着缩回 ✓
                    · **字号一个字不动** ✓（13px / sm 15px ✓）
                    · 触摸屏没有悬停 ✓ 这里只有"选中"一个状态 ✓
                */}
                {navLinks.map((link) => {
                  const active = isActivePath(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsMenuOpen(false)}
                      className="px-3 py-2.5 rounded-xl text-[13px] sm:text-[15px] font-bold truncate text-slate-700 dark:text-slate-200"
                    >
                      <span className="relative inline-block">
                        <motion.span
                          aria-hidden
                          className="absolute left-0 right-0 bg-indigo-500"
                          style={{ bottom: 0, height: '0.5em' }}
                          initial={{ clipPath: 'inset(0 100% 0 0)' }}
                          animate={{ clipPath: active ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)' }}
                          transition={HOVER_REVEAL}
                        />
                        <span className="relative">{link.name}</span>
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {syncModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSyncModalOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-[40px] shadow-2xl border border-white/50 p-10 text-center">
              <div className="w-16 h-16 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="text-amber-500" size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">系统镜像覆盖</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed text-balance">
                确认将管理端数据覆盖至<br />
                <span className="font-bold text-amber-500 break-all">{targetBlogPath}</span> 吗？<br />
                <span className="text-xs opacity-80 text-red-400 font-bold mt-2 block">此操作将清空目标项目的旧文章与配置！</span>
              </p>
              <div className="flex gap-3">
                <button onClick={() => setSyncModalOpen(false)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-black uppercase transition-colors hover:bg-slate-200 dark:hover:bg-slate-700">取消</button>
                <button onClick={executeSyncBlog} className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-amber-500/30 transition-all">确认覆盖</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}