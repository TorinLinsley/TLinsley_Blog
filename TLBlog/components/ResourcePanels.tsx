"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { FolderLines, TocBars } from './MorphIcons';
import { registerLayer } from './layerStack';

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
 */
let drawerMemory: null | 'left' | 'right' = null;

/**
 * 两个展开按钮的图标：都改成了**真实线条的形变**（见 components/MorphIcons.tsx）。
 *
 *   · 文章列表：文件夹外框 + 里面两条线 —— 展开时那两条线各自旋转、朝中心靠拢交叉成叉，外框不动
 *   · 大纲：    默认态**继续用 outline.svg 遮罩**（那份是不规则自定义轮廓，没法用基本图形忠实复刻），
 *              展开时先由三条真实矩形从左往右"依次伸"出来，动画结束后淡入回 outline-open.svg
 *
 * ⚠️ 历史说明：这里原来是「两张 svg 都常驻、只切透明度、刻意不加任何过渡」——
 *    因为遮罩的内部线条浏览器不允许动画，想"形变"就必须把线画成真实元素。
 *    这个改动是用户明确要求的，所以覆盖了当初那个"保持瞬间"的决定。
 *    原来担心的"换遮罩地址会导致闪一下空白"的问题依然不存在：
 *    大纲那张遮罩**常驻在 DOM 里**，只是改透明度，不会重新取图解码。
 */
function PanelIcon({ which, open }: { which: 'left' | 'right'; open: boolean }) {
  return which === 'left' ? <FolderLines open={open} /> : <TocBars open={open} />;
}

/**
 * 资源分享页的三栏容器。
 *
 * · 大屏（≥1024px）：跟原来一样，左列表 / 中正文 / 右大纲 三栏并排；
 * · 小屏（<1024px）：只留中间的正文，左右各给一个展开按钮，
 *   点它把对应的那一栏从侧边滑出来（盖住按钮），点空白处收起。
 *   抽屉里的列表照样能展开/收起文件夹、点文章即打开；
 *   ⚠️ 点文章**不会**自动收起抽屉——收起只能由用户手动来（点遮罩或再点一次按钮）。
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

  // 这次挂载是不是「切文章导致的重挂载」？是的话抽屉必须直接出现在原位。
  // 否则 framer-motion 会把 initial（滑出屏幕外）再演一遍，看起来就是点一下文章、
  // 抽屉又自己从旁边滑出来一次 —— 用户要的是列表完全不动。
  const skipEntranceRef = useRef(pathname !== '/resources' && drawerMemory !== null);
  useEffect(() => {
    // 首帧过后恢复正常：之后用户自己开关，滑入动画照常播
    skipEntranceRef.current = false;
  }, []);

  const setPanel = (next: null | 'left' | 'right' | ((prev: null | 'left' | 'right') => null | 'left' | 'right')) => {
    const value = typeof next === 'function' ? next(drawerMemory) : next;
    drawerMemory = value;
    setPanelState(value);
  };

  // 用户从文章退回资源分享首页时收起（其余情况一律不动，收起交给用户自己点）
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

  /** 抽屉本体 / 按钮行：交给 layerStack 判断"这一下该不该收" */
  const drawerRef = useRef<HTMLElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  // 抽屉开着就登记成一层：点空白只收最上面那层，且不等动画播完，
  // 所以「先收导航栏菜单、再立刻收这个抽屉」点两下就行。
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

  return (
    <>
      <style>{`
        /* 小屏：导航栏下面单独留一条「按钮行」，和导航栏一样固定住、不参与滚动。
           正文的滚动区域从这条行下面才开始 —— 于是按钮永远不会盖住正文里的字。
           全用 rem：会跟着手机上缩小的根字号一起缩，不会出现"导航栏缩了、内容没跟上"的错位。 */
        @media (max-width: 1023.98px) {
          /* 🔒 这一页在小屏上是「App 式」布局：整页不滚，只有卡片内部滚。
             否则手指在卡片外的空白处上下滑，会把整张卡片推上去，
             卡片就钻进按钮行那条带子里了 —— 这里等于给按钮行加了一层看不见的遮罩：
             卡片最多顶到按钮行的下沿，再往上就被"截断"（其实是从不越界）。 */
          html, body { overflow: hidden !important; }

          /* 双保险：把页面外层多出来的那点高度也去掉。
             否则整页仍留着一点点可"程序滚动"的余量（实测 24px），
             任何一个 scrollIntoView / 聚焦都会把卡片整体顶上去 —— 手指滑动虽然已经被
             overflow:hidden 挡住，但挡不住程序滚动。高度用 dvh，和 .res-main 对齐，
             免得手机地址栏让页面又高出一截。 */
          [data-res-page] {
            min-height: 100dvh !important;
            padding-bottom: 0 !important;
          }

          .res-main {
            margin-top: calc(3.25rem + ${TOOL_ROW_H} + 0.75rem) !important;
            /* 先写 vh 兜底，再用 dvh 覆盖：手机地址栏收起/展开时 100vh 会算错，
               用 dvh 才能保证卡片底部不被屏幕外面吃掉（老的浏览器会忽略 dvh 那行） */
            height: calc(100vh - 3.25rem - ${TOOL_ROW_H} - 0.75rem - 1.5rem) !important;
            height: calc(100dvh - 3.25rem - ${TOOL_ROW_H} - 0.75rem - 1.5rem) !important;
            margin-bottom: 1.5rem !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          /* 抽屉里的字稍微收一点：面板变窄了，字不缩一点会显得挤。
             ⚠️ 只作用于抽屉（[data-res-drawer]），大屏那两条常驻面板一点不受影响 */
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

      {/* 小屏：左右两个展开按钮自己占一整行（固定在导航栏正下方，不随内容滚动）。
          正文滚动区域从这一行底下开始，所以这两个按钮碰不到正文里的字了。
          按钮本身保持原来的样子，只是搬进了这条行里。 */}
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
          className="flex-1 bg-slate-200/50 dark:bg-slate-900/55 backdrop-blur-[60px] shadow-2xl border border-white/30 dark:border-white/10 overflow-hidden transition-all duration-700 flex flex-col"
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

      {/* 小屏抽屉
          ⚠️ mode="wait"：左右两栏切换时，必须等旧的那栏退场完毕再让新的一栏进来。
             否则两栏会同时挂着（旧的正在滑出、新的正在滑入），旧那栏里的文章链接
              还会接住手指的点击 —— 这就是"在大纲里点来点去却跳到了另一篇文章"的成因。 */}
      <AnimatePresence mode="wait">
        {panel && (
          <>
            {/* 遮罩：从「按钮行」下沿开始 —— 按钮行始终露在外面，展开状态下也点得到那两个按钮 */}
            {/* 🕶️ 从导航栏底下就开始盖：**把展开按钮那一行也罩进去**
                （以前从这一行下面开始，那一行不变暗，看着像漏了一块）。
                按钮行在 z-[46]、高于这层 z-[45]，所以按钮不会被压暗、照旧可点。 */}
            <motion.div
              key="res-panel-mask"
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
