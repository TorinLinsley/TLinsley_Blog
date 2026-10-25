"use client";

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MenuLines } from './MorphIcons';
import { siteConfig } from '../siteConfig';
import { useTheme } from './ThemeProvider';
import { registerLayer } from './layerStack';
import { navLinks } from '../lib/navLinks';
import { EASE_OUT } from '../lib/motion';
import { signalNavStart } from './NavSwitchDim';

const NAV_HEIGHT = '3.25rem';

const HOVER_REVEAL = { duration: 0.32, ease: EASE_OUT };

const BLOCK_BOTTOM = '-0.1em';

const TAB_DIM = 'text-slate-500 dark:text-slate-400';
const TAB_STRONG = 'text-slate-900 dark:text-slate-100';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [clicked, setClicked] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const menuDrawerRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    return registerLayer({
      panel: () => menuDrawerRef.current,
      controls: () => menuButtonRef.current,
      close: () => setIsMenuOpen(false),
    });
  }, [isMenuOpen]);


  const ROUTE_PARENT: Record<string, string> = {
    '/posts': '/timeline',
  };
  const groupPath = (() => {
    for (const child of Object.keys(ROUTE_PARENT)) {
      if (pathname === child || pathname.startsWith(`${child}/`)) return ROUTE_PARENT[child];
    }
    return pathname;
  })();
  const isActivePath = (href: string) =>
    href === '/'
      ? groupPath === '/'
      : groupPath === href || groupPath.startsWith(`${href}/`) || groupPath === `${href}/`;

  const currentTab = navLinks.find((l) => isActivePath(l.href))?.name || '菜单';

  useEffect(() => {
    setIsMenuOpen(false);
    setClicked(null);
  }, [pathname]);

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

            {
}
            {pathname !== '/' && <ThemeButton />}
          </div>

          <div className="flex items-center gap-3 min-w-0">
            {
}
            <nav className="flex items-center gap-3 xl:gap-5 2xl:gap-6 text-[16px] font-black whitespace-nowrap overflow-x-auto min-w-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {
}
              {navLinks.map((link) => {
                const active = clicked !== null ? clicked === link.href : isActivePath(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative py-1 transition-colors duration-300 ${
                      active ? `text-[16.3px] ${TAB_STRONG}` : TAB_DIM
                    }`}
                    onMouseEnter={() => { setHovered(link.href); router.prefetch(link.href); }}
                    onMouseLeave={() => setHovered((h) => (h === link.href ? null : h))}
                    onClick={() => { setClicked(link.href); signalNavStart(); }}
                  >
                    <span className="relative inline-block">
                      {
}
                      <motion.span
                        aria-hidden
                        className={`absolute left-0 right-0 ${
                          active
                            ? 'bg-indigo-500 dark:bg-indigo-400'
                            : 'bg-indigo-400 dark:bg-indigo-500'
                        }`}
                        style={{ bottom: BLOCK_BOTTOM, height: '0.5em' }}
                        initial={{ clipPath: 'inset(0 100% 0 0)' }}
                        animate={{
                          clipPath:
                            hovered === link.href ||
                            clicked === link.href ||
                            (active && clicked === null)
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
          </div>
        </div>
      </header>

      <header
        className="lg:hidden w-full fixed top-0 left-0 right-0 z-[60] border-b bg-white/60 dark:bg-slate-900/70 backdrop-blur-xl border-white/20 dark:border-white/5 shadow-sm"
        style={{ height: NAV_HEIGHT }}
      >
        <div className="h-full flex items-center justify-between gap-2 px-3 sm:px-4">
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

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="shrink-0 max-w-[52px] sm:max-w-[92px] truncate text-[11px] sm:text-xs font-bold text-slate-400 dark:text-slate-500">
              {currentTab}
            </span>

            <button
              type="button"
              ref={menuButtonRef}
              onClick={() => setIsMenuOpen((v) => !v)}
              aria-label={isMenuOpen ? '关闭菜单' : '打开菜单'}
              className="relative w-8 h-8 shrink-0 rounded-xl bg-white/50 dark:bg-slate-800/60 border border-white/50 dark:border-white/10 shadow-sm hover:bg-white/80 dark:hover:bg-slate-700/70 transition-colors duration-300"
            >
              {
}
              <MenuLines open={isMenuOpen} />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            {
}
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
                  const active = clicked !== null ? clicked === link.href : isActivePath(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => { setIsMenuOpen(false); signalNavStart(); }}
                      className={`px-3 py-2.5 rounded-xl text-[13px] sm:text-[15px] font-bold truncate transition-colors duration-300 ${
                        active ? TAB_STRONG : TAB_DIM
                      }`}
                    >
                      <span className="relative inline-block">
                        <motion.span
                          aria-hidden
                          className="absolute left-0 right-0 bg-indigo-500 dark:bg-indigo-400"
                          style={{ bottom: BLOCK_BOTTOM, height: '0.5em' }}
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
    </>
  );
}