"use client";

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MenuLines } from './MorphIcons';
import { siteConfig } from '../siteConfig';
import { useTheme } from './ThemeProvider';
import { registerLayer } from './layerStack';
import { navLinks } from '../lib/navLinks';

/** 小屏导航栏高度：3.25rem = 原来的 52px（大屏仍是 h-16 = 64px）。
    写成 rem 是为了跟着手机上的根字号一起缩，见 globals.css 里的手机缩放。 */
const NAV_HEIGHT = '3.25rem';

/**
 * 悬停色块「像进度条一样从左往右揭开」的过渡 ✓
 *   弹簧 → **可打断** ✓（鼠标快速划过时不会卡在半路 ✗）
 *   时长 ≤0.35s ✓ 非线性 ✓
 */
const HOVER_REVEAL = { type: 'spring' as const, duration: 0.32, bounce: 0 };

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  /** 当前鼠标悬停的选项卡 href（null = 没有悬停）—— 桌面端色块用 ✓ 触摸设备不会触发 ✓ */
  const [hovered, setHovered] = useState<string | null>(null);
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();
  /** 抽屉本体 / 汉堡按钮：交给 layerStack 判断"这一下该不该收" */
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

  // 顺序说明：资源分享是高频入口，放在首页右边第一位（最顺手的位置），其余依次后移
  // 🧰 「工具」紧跟在资源分享后面；归档和项目按用户要求换了位置（归档在前、项目在后）。
  // ⚠️ 这份列表现在放在 lib/navLinks.ts —— 工具网页里注入的那条导航栏也用同一份，
  //    要改顺序/加减栏目就去改那个文件，别在这里再写一份。

  /**
   * 当前路径算不算这个导航项。
   *
   * ⚠️ 以前这里只做精确比较（`pathname === href`），所以**只要点进子页面高亮就没了**：
   *    /resources            → 高亮 ✓
   *    /resources/xxx.md     → 不匹配 ✗ 高亮消失
   * 现在按「同一个栏目」判断：完全相等、或者以 `href/` 开头都算 ✓
   * （带 `/` 边界是为了别让 `/post` 误匹配 `/posts-archive` ✓）
   * 根路径 `/` 只能精确匹配，否则所有页面都会算首页 ✓
   */
  const isActivePath = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(`${href}/`) || pathname === `${href}/`;

  const currentTab = navLinks.find((l) => isActivePath(l.href))?.name || '菜单';

  // 换页自动收起
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // 菜单打开时锁住背景滚动
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  /** 主题切换：圆形日月图标 + 文字（沿用首页那张卡片的设计，去掉副标题小字） */
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

  return (
    <>
      {/* ═══════════ 大屏（≥1024px）：横向导航 ═══════════ */}
      <header className="hidden lg:block w-full fixed top-0 left-0 right-0 z-50 border-b bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl border-white/20 dark:border-white/5 shadow-sm">
        <div className="w-[96%] max-w-[1600px] mx-auto h-16 flex items-center justify-between gap-4 px-4 sm:px-[30px] box-border">
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/"
              className="text-xl font-black text-slate-800 dark:text-white tracking-tighter hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-300 whitespace-nowrap"
            >
              {siteConfig.navTitle || siteConfig.authorName}
              <span className="text-indigo-500 mx-1">{siteConfig.navSuffix || 'の'}</span>
              {siteConfig.navAfter || '宝藏之地'}
            </Link>

            {/*
              大屏的主题按钮：就放在 logo 右边。
              首页里本来就有那张主题切换卡片，所以只有「不是首页」时才补一个。
            */}
            {pathname !== '/' && <ThemeButton />}
          </div>

          <div className="flex items-center gap-3 min-w-0">
            {/* ⚠️ 选项卡：字体族/字重跟 logo 一致（font-black），字号**基准 16px**，
                当前栏目那一个单独放大到 **16.3px**（高亮除了变色、再微微大一点点）。
                只作用于**大屏这条**（整块在 hidden lg:block 里），手机那套导航栏不受影响。 */}
            <nav className="flex items-center gap-3 xl:gap-5 2xl:gap-6 text-[16px] font-black whitespace-nowrap overflow-x-auto min-w-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {/*
                ⚠️ 悬停/选中样式（用户要求）：
                  · **字体大小一个字不动** ✓（基准 16px 由父级给 ✓ 选中的 16.3px 保留 ✓）
                  · **文字颜色完全不动** ✗ → 去掉所有 text-* / hover:text-* ✓
                    文字永远跟随主题（浅色=深字 深色=白字）✓
                  · 悬停：一个高 = 文字高度 1/3 的色块，垫在**文字下层** ✓
                    从**左往右像进度条**揭开（clip-path ✓ 不是 scaleX 拉伸 ✗）
                    移开时反着缩回 ✓ 用弹簧 → 可打断 ✓
                  · 选中：色块常驻 ✓ 站点原有的紫 indigo-500 ✓
                    悬停：淡一点的紫 indigo-400 ✓
              */}
              {navLinks.map((link) => {
                const active = isActivePath(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative py-1 ${active ? 'text-[16.3px]' : ''}`}
                    /* 鼠标进入/离开驱动色块；触摸设备不会触发这两个事件 ✓ 等于天然只在桌面生效 ✓ */
                    onMouseEnter={() => setHovered(link.href)}
                    onMouseLeave={() => setHovered((h) => (h === link.href ? null : h))}
                  >
                    <span className="relative inline-block">
                      {/* 色块：垫在文字下层 ✓ 高 = 文字高度 1/3 ✓ 从左边进度条式揭开 ✓ */}
                      <motion.span
                        aria-hidden
                        className={`absolute left-0 right-0 rounded-[3px] ${
                          active ? 'bg-indigo-500' : 'bg-indigo-400'
                        }`}
                        style={{ bottom: '-0.06em', height: '0.34em' }}
                        initial={false}
                        animate={{
                          clipPath:
                            hovered === link.href || active
                              ? 'inset(0 0% 0 0)'
                              : 'inset(0 100% 0 0)',
                        }}
                        transition={HOVER_REVEAL}
                      />
                      {/* 文字在上层 ✓ */}
                      <span className="relative">{link.name}</span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* ═══════════ 小屏（<1024px）：紧凑导航栏 ═══════════ */}
      <header
        className="lg:hidden w-full fixed top-0 left-0 right-0 z-[60] border-b bg-white/60 dark:bg-slate-900/70 backdrop-blur-xl border-white/20 dark:border-white/5 shadow-sm"
        style={{ height: NAV_HEIGHT }}
      >
        <div className="h-full flex items-center justify-between gap-2 px-3 sm:px-4">
          {/* 左：logo 标题 + 紧跟它右边的主题切换按钮 */}
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
          </div>

          {/* 右：当前所在选项卡 + 更多菜单按钮 */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="shrink-0 max-w-[52px] sm:max-w-[92px] truncate text-[11px] sm:text-xs font-bold text-slate-400 dark:text-slate-500">
              {currentTab}
            </span>

            {/* 更多菜单按钮：menu.svg ⇄ close.svg */}
            <button
              type="button"
              ref={menuButtonRef}
              onClick={() => setIsMenuOpen((v) => !v)}
              aria-label={isMenuOpen ? '关闭菜单' : '打开菜单'}
              className="relative w-8 h-8 shrink-0 rounded-xl bg-white/50 dark:bg-slate-800/60 border border-white/50 dark:border-white/10 shadow-sm hover:bg-white/80 dark:hover:bg-slate-700/70 transition-colors duration-300"
            >
              {/*
                三行（圆点＋长条）⇄ 叉：**真实线条的形变**。
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

      {/* ═══════════ 侧边抽屉菜单 ═══════════ */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* 变暗遮罩：从导航栏底部开始，点它就收起
                ⚠️ exit 里带 pointerEvents:'none'：退场动画播放期间这层立刻不再接手势，
                   否则「先开页面里的大纲/文章列表抽屉、再开导航栏菜单」时，
                   快速点两下空白处想依次收起两层的第一次点击会被正在淡出的这层吃掉，
                   必须等动画放完才点得动第二下。 */}
            <motion.div
              key="nav-mask"
              data-nav-mask
              onClick={() => setIsMenuOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, pointerEvents: 'none' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="lg:hidden fixed left-0 right-0 bottom-0 z-[55] bg-slate-900/50 dark:bg-black/65 backdrop-blur-[2px]"
              style={{ top: NAV_HEIGHT }}
            />

            {/* 抽屉本体：从右往左滑入，收回时从左往右退出（退场期间同样不接手势） */}
            <motion.aside
              key="nav-drawer"
              data-nav-drawer
              ref={menuDrawerRef}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%', pointerEvents: 'none' }}
              transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.6 }}
              className="lg:hidden fixed right-0 bottom-0 z-[56] w-1/3 flex flex-col bg-white/85 dark:bg-slate-900/90 backdrop-blur-2xl border-l border-white/40 dark:border-white/10 shadow-2xl rounded-tl-3xl"
              style={{ top: NAV_HEIGHT }}
            >
              <nav className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-1">
                {navLinks.map((link) => {
                  const active = isActivePath(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsMenuOpen(false)}
                      className={`px-3 py-2.5 rounded-xl text-[13px] sm:text-[15px] font-bold truncate transition-colors duration-200 ${
                        active
                          ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      {link.name}
                    </Link>
                  );
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
