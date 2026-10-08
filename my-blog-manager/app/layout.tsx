import 'katex/dist/katex.min.css';
import type { Metadata, Viewport } from "next";
import "./noto-serif-sc.css";   // ⬅️ 自托管的思源宋体（Noto Serif SC），见下方说明
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import BackgroundEffects from "../components/BackgroundEffects";
import { MusicProvider } from "../components/MusicProvider";
import FloatingPlayer from "../components/FloatingPlayer";
import { siteConfig } from "../siteConfig";
import ClickEffect from "../components/ClickEffect";
import BackgroundSlider from "../components/BackgroundSlider";
import GlobalToolbox from "../components/GlobalToolbox";
import UrlCopyShortcut from "../components/UrlCopyShortcut";
import { OperationProvider } from "../context/OperationContext";
import { ToastProvider } from '../components/ToastProvider';
import CyberCat from '../components/CyberCat';
import DanmakuBackground from '../components/DanmakuBackground';
import GlobalSnow from '../components/GlobalSnow';
import CodeCopy from '../components/CodeCopy';
import RepoCard from '../components/RepoCard';
import TableScroll from '../components/TableScroll';
import ImageZoom from '../components/ImageZoom';
import CalloutRender from '../components/CalloutRender';
import PageKeys from '../components/pageScrollKeys';
import HoverTip from '../components/HoverTip';
import InSiteLinks from '../components/InSiteLinks';
import ApiKeyInjector from '../components/ApiKeyInjector';
import Navbar from '../components/Navbar';

/**
 * 🈶 字体改成**本地自托管**了，不再用 next/font/google。
 *
 * 为什么：next/font/google 在**每次 build** 时都会去 fonts.gstatic.com 拉
 * Noto Serif SC 的 101 个 unicode-range 分片 —— 服务器网络抖一下，构建就报
 * "next/font/google queries have exactly one entry" 然后整包构建失败 ✗（反复踩）
 *
 * 现在：分片已经下到 `public/fonts/noto-serif-sc/`，@font-face 写在
 * `app/noto-serif-sc.css`（脚本 `scripts/fetch_noto_serif.mjs` 生成，想更新字体重跑即可）。
 * build 完全不联网 ✓ unicode-range 原样保留 → 浏览器还是只下用到的分片，加载速度不变 ✓
 * （Geist / Geist Mono 本来就没被任何样式引用，一并没有了 ✓）
 */

/* 📱 手机键盘弹出时让「可视区域真的变矮」，而不是盖在页面上。
   浏览器默认是"盖住"：布局视口不变，为了把光标露出来会把整页往上顶，
   于是编辑器工具栏就被顶出屏幕外了（连 100dvh 都不会跟着缩）。
   加上这条之后 dvh 会随键盘收缩 → 编辑区跟着缩 → 工具栏始终留在可视区里。 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.bio,  icons: { icon: siteConfig.faviconUrl, apple: siteConfig.faviconUrl },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* 启动画面已移除：不再有过场遮罩，页面直接显示 */}
        {/* 🚀 首屏那张背景图提前预加载（和博客前台 layout.tsx 同一套写法）：
            CSS 里的 background 图浏览器发现得晚，预加载能让它从 HTML 一起开始下，
            首屏更快；换图不用改这里，自动跟着 bgImages[0] 走 */}
        {!siteConfig.useGradient && siteConfig.bgImages?.[0] && (
          <link rel="preload" as="image" href={siteConfig.bgImages[0]} />
        )}
      </head>

      <body className="w-screen overflow-x-hidden min-h-full flex flex-col relative transition-colors duration-1000 bg-slate-50 dark:bg-slate-950 font-serif">
        <ThemeProvider>
          <OperationProvider>
            <ToastProvider>
              {/* Ctrl + Alt + R：复制当前完整地址（控制台没有地址栏，用它补上） */}
              {/* 🖱️ 全站悬停提示：原生 title 一律换成网页自己的气泡（详见组件注释） */}
              <HoverTip />
              <UrlCopyShortcut />
              <MusicProvider>
                <div id="app-mount-root" className="flex-1 flex flex-col">
                  <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
                    {!siteConfig.useGradient && <BackgroundSlider />}
                    <div className="absolute inset-0 z-[-9] bg-white/30 dark:bg-slate-900/40 backdrop-blur-md transition-colors duration-1000"></div>
                    <div
                      className="absolute inset-0 z-[-8] opacity-60 dark:opacity-20 mix-blend-color transition-opacity duration-1000 transform-gpu"
                      style={{
                        background: `linear-gradient(-45deg, ${siteConfig.themeColors.join(', ')})`,
                        backgroundSize: '400% 400%',
                        backgroundPosition: '50% 50%', // 不流动时就停在渐变正中间（约等于原来流动时的平均观感）
                        // ⚠️ 纯图片背景（useGradient === false）时这一层不能再流动：
                        //    它是 mix-blend-color 压在壁纸上的"色膜"，background-position 一动
                        //    颜色就顺着斜对角扫过去，看着就像背景图整体偏移了（15 秒一循环）。
                        animation: siteConfig.useGradient ? 'gradientMove 15s ease infinite' : 'none'
                      }}
                    ></div>
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/40 dark:bg-indigo-900/20 blur-[100px] rounded-full mix-blend-overlay z-[-7]"></div>
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/30 dark:bg-purple-900/30 blur-[100px] rounded-full mix-blend-overlay z-[-7]"></div>

                    <div className="bg-effects-wrapper transition-opacity duration-1000">
                      <BackgroundEffects />
                    </div>
                  </div>

                  <DanmakuBackground />
                  <GlobalSnow />

                  <div className="relative z-10 flex-1 flex flex-col">
                    {/*
                      🧭 导航栏挪到**根布局**里了（原来 17 个页面各自 import 一份）。

                      为什么必须这样：页面各引一份 = 切页时整条导航栏被销毁重建 ✗
                      表现就是"点选项卡 → 色块刚揭开 → 页面像刷新一样断了"✗
                      放到这里之后它**全程常驻**（React 不会重建它）：切页只换下面 children 那块 ✓
                        · 色块能把揭开动画（.32s 弹簧）完整播完 ✓ 不会被切页打断 ✓
                        · 选中那一条平滑接手：点过的那条 → 新页面的 active ✓ 中间不闪 ✗
                        · 手机上开着的抽屉、悬停状态也跨页保留 ✓
                      ⚠️ 高度/留白：导航栏自己是 `fixed`（不占布局空间），
                         各页面原来的 mt-28 / pt-20 留白**一个像素都不用改** ✓
                      ⚠️ 博客前台（TLBlog/app/layout.tsx）是同一套写法，改一处记得看另一处 ✓
                    */}
                    <Navbar />
                    {children}
                  </div>

                  {/* 📱 小屏不显示这些悬浮物（和博客前台 layout.tsx 完全同一套写法：
                      悬浮播放器 / 工具箱 / 点击粒子 统一用 hidden md:block 包起来） */}
                  <div className="hidden md:block">
                    <FloatingPlayer />
                  </div>
                  <div className="hidden md:block">
                    <GlobalToolbox />
                  </div>
                  <div className="hidden md:block">
                    <ClickEffect />
                  </div>
                </div>

                <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
                  @keyframes gradientMove { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
                  body.winter-mode .bg-effects-wrapper { opacity: 0 !important; visibility: hidden; }
                  .winter-mode .snow-cap { position: relative !important; overflow: visible !important; }
                  .dark.winter-mode .snow-cap {
                    background-color: rgba(23, 37, 84, 0.4) !important;
                    border-color: rgba(59, 130, 246, 0.3) !important;
                    backdrop-filter: blur(12px) brightness(80%) !important;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
                  }
                  body.winter-mode .snow-cap {
                    background-color: rgba(239, 246, 255, 0.45) !important;
                    border-color: rgba(191, 219, 254, 0.6) !important;
                    backdrop-filter: blur(12px) saturate(120%) !important;
                    box-shadow: 0 8px 32px rgba(191, 219, 254, 0.25) !important;
                    transition: all 0.7s ease !important;
                  }
                `}} />
              </MusicProvider>
            </ToastProvider>
          </OperationProvider>
        </ThemeProvider>
        {/* 📱 小屏不显示这只猫（和博客前台同一套：hidden md:block 包起来） */}
        <div className="hidden md:block">
          <CyberCat />
        </div>
        <CodeCopy />
        {/* 🔗 GitHub / Gitee 的仓库或主页链接 → 卡片（和 CodeCopy 一样是"挂一个组件自己扫 DOM"） */}
        <RepoCard />
        <TableScroll />
        {/* 🔍 点击图片放大查看（和博客前台是同一个组件、同一份代码） */}
        <ImageZoom />
        {/* 🔗 正文里的站内链接改走客户端路由：点一下瞬间切页，不再整篇文档重载
            （原来会重新 Boot 控制台 + 重播入场动画，看着像"刷新进来"） */}
        <InSiteLinks />
        <CalloutRender />
        <PageKeys />
        {/* 🔑 给所有"调后端 API"的请求自动带上管理密钥 X-Admin-Key
            （后端能改博客文件，见 cms_core/main.py 顶部说明；这里是配套的前端半边） */}
        <ApiKeyInjector />
      </body>
    </html>
  );
}