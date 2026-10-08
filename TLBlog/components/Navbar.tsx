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

/** 小屏导航栏高度：3.25rem = 原来的 52px（大屏仍是 h-16 = 64px）。
    写成 rem 是为了跟着手机上的根字号一起缩，见 globals.css 里的手机缩放。 */
const NAV_HEIGHT = '3.25rem';

/**
 * 悬停色块「像进度条一样从左往右揭开」的过渡 ✓
 *
 * 📌 这条是**用户拿 8 条曲线现场对比之后挑的**（对比页：Downloads/nav-curve-compare.html 里的 D）
 *    · 0.32s + cubic-bezier(.23,1,.32,1) —— 就是它 ✓
 *    · 手感：**起步就冲出去，剩下大半时间一路减速** → "伸出来是快" + "丝滑" ✓
 *    · 数值直接复用站里的 **EASE_OUT** 令牌（和进场/按下反馈同一条）✓ 不再单开一条曲线 ✓
 *
 * ⚠️ 试过、但**被否掉**的写法，别再改回去 ✗：
 *    ① 弹簧 {type:'spring', duration:.32, bounce:0} —— 手感接近，但被打断时会带着速度走，
 *       和这条贝塞尔的观感不一致 ✓
 *    ② 「慢 → 快 → 慢」的 S 形（EASE_WIPE：.62,0,.42,1 / .55,0,.5,1 / .7,0,.4,1 都试过）：
 *       数学上两头确实慢、中间确实快，但时长压到 0.2~0.3s 时**两头各只有 2 帧**，
 *       人眼根本分辨不出来 ✗ —— 用户原话："感觉不出快与慢的变化…像线性的" ✗
 *       真要做三段节奏，时长起码 0.4s 以上（对比页里的 C），那就整体显拖了 ✗ 不要 ✓
 *    ③ 想微调只动 duration（0.28 更脆 / 0.36 更从容），曲线一个字都不用动 ✓
 */
const HOVER_REVEAL = { duration: 0.32, ease: EASE_OUT };

/**
 * 选项卡下面那个色块**比文字底边再往下压多少** ✓
 *   0    = 色块底边正好贴齐文字底边（原来的值）
 *   -0.1em ≈ 再往下 1.6px（用户："把选项卡下面的条稍微往下偏移一点"）
 *   → 以后想让它再低一点/再高一点，只改这一个数就行 ✓
 *   ⚠️ 用 em 不用 px：手机端根字号会缩，写 px 在大屏小屏上偏移量就不一样了 ✓
 */
const BLOCK_BOTTOM = '-0.1em';

/**
 * 选项卡文字颜色 ✓（用户："未选中的弱化一点 —— 深色别那么白、浅色别那么黑"）
 *   · 未选中 → slate-500 / slate-400（就是工具网页那条导航栏一直在用的弱化色 ✓ 四处统一）
 *   · 选中   → 正文那个强度 slate-900 / slate-100 → 一强一弱，当前栏目一眼看出来 ✓
 *   ⚠️ 悬停**不参与**变色 ✗ 悬停只负责揭开色块 ✓
 */
const TAB_DIM = 'text-slate-500 dark:text-slate-400';
const TAB_STRONG = 'text-slate-900 dark:text-slate-100';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  /** 当前鼠标悬停的选项卡 href（null = 没有悬停）—— 桌面端色块用 ✓ 触摸设备不会触发 ✓ */
  const [hovered, setHovered] = useState<string | null>(null);
  /**
   * 已经点过、正在等新页面加载的那个选项卡 ✓
   *   ⚠️ 用户反馈："点了别的选项卡后鼠标迅速移开，色块先缩回了 ✗
   *      等新页面加载出来又伸出来 ✗ —— 点击后应该**固定住已伸出的状态**" ✓
   *   → 点过之后把这个 href 记下来，它的色块**不再受鼠标移开影响** ✓
   *   → 新页面挂载后组件重建，这个状态自然清空 ✓ 不会残留 ✓
   */
  const [clicked, setClicked] = useState<string | null>(null);
  const pathname = usePathname();
  /**
   * ⚡ 用来**预取页面**（见下面选项卡的 onMouseEnter）。
   * 为什么非要它：这些页面的内容都是服务器现读磁盘出来的，点下去才开始要 → 必然有等待 ✗
   * 悬停就预取 → 真按下去时数据已经在浏览器里了 → 内容**当帧就换** ✓
   * 这才是"条在动"和"界面在换"**真正同时**的关键（光调动画曲线是做不到的 ✗）
   */
  const router = useRouter();
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
    /* ⚠️ 导航栏现在挂在 app/layout.tsx 上，切页**不再重新挂载**了 ——
       clicked 得自己跟着路由清，不然用浏览器后退回到别的栏目时，
       之前点过的那条色块会一直锁在伸出状态 ✗
       （不会闪：路由一变 active 已经是新的那条了，这个 effect 在 DOM 更新之后才跑 ✓） */
    setClicked(null);
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
                    /* 未选中弱化 / 选中保持正文强度 ✓ 300ms 颜色过渡：切页时和色块一起变化，不突兀 ✓ */
                    className={`relative py-1 transition-colors duration-300 ${
                      active ? `text-[16.3px] ${TAB_STRONG}` : TAB_DIM
                    }`}
                    /* 鼠标进入/离开驱动色块；触摸设备不会触发这两个事件 ✓ 等于天然只在桌面生效 ✓
                       ⚡ 悬停的同时**预取这一页**：鼠标移到选项卡上就一定早于点击，
                          这段时间足够把内容取回来 → 点下去内容当帧就换 ✓ 和条同一帧开始 ✓ */
                    onMouseEnter={() => { setHovered(link.href); router.prefetch(link.href); }}
                    onMouseLeave={() => setHovered((h) => (h === link.href ? null : h))}
                    /* 点一下就把这一条的色块**锁在伸出状态** ✓ 不随鼠标移开而缩回 ✓
                       ⚡ 同时通知内容区"要切了"——内容区只在**真的等超时**时才变暗，
                          预取命中的正常情况一次都不会闪 ✓（见 components/NavSwitchDim.tsx） */
                    onClick={() => { setClicked(link.href); signalNavStart(); }}
                  >
                    <span className="relative inline-block">
                      {/* 色块：垫在文字下层 ✓
                          位置 = BLOCK_BOTTOM（文件顶部那个常量）：贴齐**文字底边**，再往下压一点点 ✓
                          高 0.5em = 文字的一半 —— 尺寸和颜色这次都不动 ✓ */}
                      <motion.span
                        aria-hidden
                        className={`absolute left-0 right-0 ${
                          /* ⚠️ 深色模式把两个紫色**对调** ✓（用户要求：浅紫在深色导航栏上更明显 ✓）
                             浅色模式: 选中深紫 500 / 悬停浅紫 400
                             深色模式: 选中浅紫 400 / 悬停深紫 500  ← 对调 ✓ */
                          active
                            ? 'bg-indigo-500 dark:bg-indigo-400'
                            : 'bg-indigo-400 dark:bg-indigo-500'
                        }`}
                        style={{ bottom: BLOCK_BOTTOM, height: '0.5em' }}
                        /**
                         * ⚠️⚠️ initial **不能**用 false ✗（用户反馈"切换选项卡那个条是瞬间出现的"）
                         *   原因：每个页面都各自 import 了 Navbar ✗ → 切页时导航栏**重新挂载** ✗
                         *   initial={false} 会让它在挂载瞬间就是"已展开"✗ → 揭开动画没机会播 ✗
                         *   → 改成"挂载时也从藏起来开始" ✓
                         *     切到新页面时，那个色块会**重新从左往右揭开一次** ✓
                         *     （旧的随整页销毁，物理上不可能再播缩回 ✗ 这是各页各自引 Navbar 的必然结果 ✓）
                         */
                        initial={{ clipPath: 'inset(0 100% 0 0)' }}
                        animate={{
                          clipPath:
                            /* ⚠️⚠️ 这个条件决定了"旧的缩回"什么时候开始（用户实测反馈过）：
                               写成 `|| active` 时：点下去之后 active 还是旧的（路由要等新页面
                               **加载完**才变）→ 旧的色块定住不动、等界面完全切过去才缩回 ✗
                               现在改成 `active && clicked === null`：
                               点下去那一刻 clicked 就有值了 → 旧的**立刻**不再算伸出 → 马上开始缩回 ✓
                               和新那条的揭开**同时进行**，不被页面切换影响 ✓
                               三个条件：悬停 / 刚点的那条（锁住） / 没有待跳转时的当前栏目 */
                            hovered === link.href ||
                            clicked === link.href ||
                            (active && clicked === null)
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
                    /*
                      ⚠️ 手机端选项卡列表（用户要求"和大屏一起改"）✓
                        · 去掉原来的**实色紫背景 + 白字** ✗（那会改文字颜色 ✗）
                        · 换成和大屏同一套：文字下层一个高 = 文字 1/3 的色块 ✓
                          选中时**常驻**（站点原有的紫 indigo-500 ✓）
                          切换时反着缩回 ✓（本页正常播放 ✓）
                        · **字号一个字不动** ✓（13px / sm 15px ✓）
                        · 触摸屏没有悬停 ✓ 所以这里只有"选中"这一个状态 ✓
                    */
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => { setIsMenuOpen(false); signalNavStart(); }}
                      /* 手机端和大屏同一条规矩：未选中弱化 ✓ 选中保持正文强度 ✓（触摸屏没有悬停） */
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
