"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { registerLayer } from '../layerStack';

/** 小屏导航栏高度（和 Navbar 里保持一致）。写成 rem，跟着手机上缩小的根字号一起缩。 */
const NAV_H = '3.25rem';

/** 小屏「按钮行」的高度：左右两个展开按钮固定占这么一行，正文从它下面才开始（所以不会挡住正文） */
const TOOL_ROW_H = '3rem';

/**
 * 抽屉的开合状态放在**组件外面**。
 *
 * 原因：资源页是 [[...path]] 动态路由，在它下面切换文章时，Next 会把整棵子树
 * 卸载重建（实测：文章→文章也一样，不只是第一次进文章）。state 活不过这次重挂载，
 * 于是用户一点文章，抽屉就"自己收起来"了。
 * 把状态存在模块作用域里，重挂载时读回来即可；刷新页面时模块重新初始化，自然是关着的。
 *
 * （这份和博客前台 TLBlog/components/ResourcePanels.tsx 是故意保持一致的，改一边记得改另一边。）
 */
let drawerMemory: null | 'left' | 'right' = null;

/**
 * 两个展开按钮的图标：默认 / 展开各一张 svg，**瞬间切换**（没有任何过渡）。
 *   · 文章列表：file_list.svg  ⇄  open-folder.svg
 *   · 大纲：    outline.svg    ⇄  outline-open.svg
 *
 * ⚠️ 这里是"两张图都常驻，只切换显隐"，而不是"一个 span 换 mask 地址"。
 *    换地址那种写法的毛病：浏览器要为**新地址**取图 + 解码，没命中缓存的那一次
 *    会先渲染一帧没有图标的空白 —— 连点的时候就会偶发"闪一下才出现第二个图标"。
 *    两张图在挂载时就都进 DOM 并解码好，切换只改透明度，所以永远不掉帧、不闪。
 */
function PanelIcon({ which, open }: { which: 'left' | 'right'; open: boolean }) {
  const srcOf = (isOpen: boolean) => (which === 'left'
    ? (isOpen ? '/open-folder.svg' : '/file_list.svg')
    : (isOpen ? '/outline-open.svg' : '/outline.svg'));
  const maskStyle = (src: string): React.CSSProperties => ({
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  });
  return (
    <>
      <span
        aria-hidden
        data-icon-state="closed"
        className={`absolute inset-0 m-auto w-4 h-4 bg-slate-800 dark:bg-slate-100 ${open ? 'opacity-0' : 'opacity-100'}`}
        style={maskStyle(srcOf(false))}
      />
      <span
        aria-hidden
        data-icon-state="open"
        className={`absolute inset-0 m-auto w-4 h-4 bg-slate-800 dark:bg-slate-100 ${open ? 'opacity-100' : 'opacity-0'}`}
        style={maskStyle(srcOf(true))}
      />
    </>
  );
}

/**
 * 资源分享页的三栏容器（控制台版）。
 *
 * · 大屏（≥1024px）：跟原来一样，左列表 / 中正文 / 右大纲 三栏并排；
 * · 小屏（<1024px）：只留中间的正文，左右各给一个展开按钮，
 *   点它把对应的那一栏从侧边滑出来（盖住按钮），点空白处收起。
 */
export default function ResourcePanels({
  left,
  right,
  children,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [panel, setPanelState] = useState<null | 'left' | 'right'>(() =>
    // 回到资源分享首页（没选中文章）就复位；切文章时把上次的开合状态还原回来
    pathname === '/resources' ? null : drawerMemory
  );

  // 这次挂载是不是「切文章导致的重挂载」？是的话抽屉必须直接出现在原位，
  // 否则 framer-motion 会把 initial（滑出屏幕外）再演一遍 —— 看起来就是点一下文章、
  // 抽屉又自己从旁边滑出来一次。
  const skipEntranceRef = useRef(pathname !== '/resources' && drawerMemory !== null);
  useEffect(() => {
    skipEntranceRef.current = false;
  }, []);

  const setPanel = (next: null | 'left' | 'right' | ((prev: null | 'left' | 'right') => null | 'left' | 'right')) => {
    const value = typeof next === 'function' ? next(drawerMemory) : next;
    drawerMemory = value;
    setPanelState(value);
  };

  // 用户从文章退回资源分享首页时收起
  useEffect(() => {
    if (pathname === '/resources') {
      drawerMemory = null;
      setPanelState(null);
    }
  }, [pathname]);

  // 抽屉打开时锁住背景滚动
  useEffect(() => {
    document.body.style.overflow = panel ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [panel]);

  const drawerRef = useRef<HTMLElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  // 抽屉开着就登记成一层：点空白只收最上面那层，且不等动画播完，
  // 所以「先收导航栏菜单、再立刻收这个抽屉」点两下就行；顺带挡住"点空白穿透到正文链接" ✓
  useEffect(() => {
    if (!panel) return;
    return registerLayer({
      panel: () => drawerRef.current,
      // ⚠️ 这里**不**把整条按钮行当 controls：
      //    按钮行是通栏的（left-0 right-0），两个按钮中间那块空档也属于这一行，
      //    如果整行都算"控件"，点那一块就不会被当成空白 → 收不掉下面那层。
      //    按钮本身由 layerStack 里的 INTERACTIVE（button/a/input…）单独放行，够用了。
      close: () => setPanel(null),
    });
  }, [panel]);

  // 导航栏高度 / 按钮行高度用 CSS 变量喂给小屏样式（和大屏的 112px 对齐口径分开写）
  return (
    <>
      <style>{`
        /* 小屏：导航栏下面单独留一条「按钮行」，和导航栏一样固定住、不参与滚动。
           正文的滚动区域从这条行下面才开始 —— 于是按钮永远不会盖住正文里的字。 */
        @media (max-width: 1023.98px) {
          /* 🔒 这一页在小屏上是「App 式」布局：整页不滚，只有卡片内部滚。 */
          html, body { overflow: hidden !important; }

          [data-res-page] {
            min-height: 100dvh !important;
            padding-bottom: 0 !important;
          }

          .res-main {
            margin-top: calc(${NAV_H} + ${TOOL_ROW_H} + 0.75rem) !important;
            height: calc(100vh - ${NAV_H} - ${TOOL_ROW_H} - 0.75rem - 1.5rem) !important;
            height: calc(100dvh - ${NAV_H} - ${TOOL_ROW_H} - 0.75rem - 1.5rem) !important;
            margin-bottom: 1.5rem !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          /* 抽屉里的字稍微收一点：面板变窄了，字不缩一点会显得挤。 */
          [data-res-drawer] { font-size: 0.92rem; }
          [data-res-drawer] .text-base { font-size: 0.92rem; }
          [data-res-drawer] .text-\\[15px\\] { font-size: 0.86rem; }
        }

        /* 🐱 大屏：左右各留出「猫」那么宽的空档 —— 左下角那只猫就不会再压住文章列表。
           猫是 fixed left-20（80px）+ 本体 120px 宽 → 右边缘在 200px，
           所以左右各留 224px（14rem），左栏的左边缘刚好落在猫右侧一点点；
           两边留一样宽，整页依旧是居中的。

           ⚠️ 这里**只加左右 padding**，左右两栏的宽度在下面用 vw 另行算（见 section 的 style）：
              padding 只让**中间正文那一栏变窄**，左右两块宽度和以前完全一样。
           ⚠️ 224px 只在 ≥1536px 生效：再窄一点（1280~1535）留 224 会把中栏挤到 300px 以下、
              触发横向滚动，所以那一档留 96px。 */
        @media (min-width: 1536px) {
          .res-main {
            padding-left: 224px !important;
            padding-right: 224px !important;
          }
        }
        @media (min-width: 1280px) and (max-width: 1535.98px) {
          .res-main {
            padding-left: 96px !important;
            padding-right: 96px !important;
          }
        }
      `}</style>

      {/* 小屏：左右两个展开按钮占一整行（固定在导航栏正下方，不随内容滚动）。
          ⚠️ z 必须**高于遮罩**（遮罩 z-[45]）：遮罩现在盖到了这一行的位置，
          这一行自己没有底色（只有两个按钮），所以效果是"这一片区域跟着变暗、
          两个按钮保持正常亮度且照旧可点"，正好是想要的样子。
          （抽屉本身是 z-50，从这一行下面开始，不会压到按钮。） */}
      <div
        data-res-toolbar
        ref={toolbarRef}
        className="lg:hidden fixed left-0 right-0 z-[46] flex items-center justify-between px-3"
        style={{ top: NAV_H, height: TOOL_ROW_H }}
      >
        <button
          type="button"
          data-res-toggle="left"
          aria-label={panel === 'left' ? '收起资源列表' : '展开资源列表'}
          onClick={() => setPanel((p) => (p === 'left' ? null : 'left'))}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg"
        >
          <PanelIcon which="left" open={panel === 'left'} />
        </button>
        <button
          type="button"
          data-res-toggle="right"
          aria-label={panel === 'right' ? '收起大纲' : '展开大纲'}
          onClick={() => setPanel((p) => (p === 'right' ? null : 'right'))}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg"
        >
          <PanelIcon which="right" open={panel === 'right'} />
        </button>
      </div>

      <main
        className="res-main w-full flex flex-row z-10 relative overflow-x-auto"
        style={{
          marginTop: '112px',
          height: 'calc(100vh - 112px - 32px)',
          marginBottom: '32px',
          gap: '6px',
          paddingLeft: 14,
          paddingRight: 14,
        }}
      >
        {/* 左：大屏常驻
            ⚠️ 宽度用 vw 算，不用 % —— % 是相对 .res-main 的**内容盒**，上面一加左右 padding
               它就会跟着缩水；用 vw（再减掉原来那 28px 的边距）算出来和以前一模一样，
               于是新留出来的边距**全部由中间正文那一栏承担**。 */}
        <section
          className="hidden lg:flex shrink-0 bg-slate-200/50 dark:bg-slate-900/55 backdrop-blur-[60px] shadow-2xl border border-white/30 dark:border-white/10 overflow-hidden transition-all duration-700 flex-col"
          style={{ width: 'clamp(240px, calc((100vw - 28px) * 0.21), 420px)', borderRadius: '15px' }}
        >
          {left}
        </section>

        {/* 中：正文（小屏时占满） */}
        <section
          className="flex-1 bg-slate-200/50 dark:bg-slate-900/55 backdrop-blur-[60px] shadow-2xl border border-white/30 dark:border-white/10 overflow-hidden transition-all duration-700 flex flex-col relative"
          style={{ borderRadius: '15px', minWidth: 300 }}
        >
          {children}
        </section>

        {/* 右：大屏常驻（宽度同样用 vw 算，理由见左边那条注释） */}
        <section
          className="hidden lg:flex shrink-0 bg-slate-200/50 dark:bg-slate-900/55 backdrop-blur-[60px] shadow-2xl border border-white/30 dark:border-white/10 overflow-hidden transition-all duration-700 flex-col"
          style={{ width: 'clamp(260px, calc((100vw - 28px) * 0.23), 460px)', borderRadius: '15px' }}
        >
          {right}
        </section>
      </main>

      {/* 小屏：抽屉 + 遮罩 */}
      <AnimatePresence>
        {panel && (
          <>
            {/* 🕶️ 遮罩从导航栏底下就开始盖，**把展开按钮那一行也一起罩进去**。
                以前是从那一行下面开始的（top 加了 TOOL_ROW_H），于是那一行不变暗，
                看着像漏了一块。按钮那一行本身在 z-[46]、高于这层 z-[45]，
                所以按钮不会被压暗、也照旧能点。 */}
            <motion.div
              key="res-mask"
              data-res-mask
              onClick={() => setPanel(null)}
              initial={skipEntranceRef.current ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, pointerEvents: 'none' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="lg:hidden fixed left-0 right-0 bottom-0 z-[45] bg-slate-900/50 dark:bg-black/65 backdrop-blur-[2px]"
              style={{ top: NAV_H }}
            />

            <motion.aside
              key={`res-panel-${panel}`}
              data-res-drawer={panel}
              ref={drawerRef}
              initial={skipEntranceRef.current ? false : { x: panel === 'left' ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: panel === 'left' ? '-100%' : '100%', pointerEvents: 'none' }}
              transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.6 }}
              className={`lg:hidden fixed bottom-0 z-50 w-[77.9%] max-w-[323px] flex flex-col bg-white/90 dark:bg-slate-900/95 backdrop-blur-2xl shadow-2xl ${
                panel === 'left'
                  ? 'left-0 border-r border-white/40 dark:border-white/10 rounded-tr-3xl'
                  : 'right-0 border-l border-white/40 dark:border-white/10 rounded-tl-3xl'
              }`}
              style={{ top: `calc(${NAV_H} + ${TOOL_ROW_H})` }}
            >
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {panel === 'left' ? left : right}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
