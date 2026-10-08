import 'katex/dist/katex.min.css';
import type { Metadata } from "next";
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
import CyberCat from '../components/CyberCat';
import DanmakuBackground from '../components/DanmakuBackground';
import CodeCopy from '../components/CodeCopy';
import RepoCard from '../components/RepoCard';
import TableScroll from '../components/TableScroll';
import ImageZoom from '../components/ImageZoom';
import InSiteLinks from '../components/InSiteLinks';
import PageKeys from '../components/pageScrollKeys';

import ContentLiveRefresh from '../components/ContentLiveRefresh';
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

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.bio,
  icons: {
    icon: siteConfig.faviconUrl,
    apple: siteConfig.faviconUrl,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* 启动画面已移除：刷新/进站不再有过场遮罩，页面直接显示 */}
        {/* 🚀 首屏那张背景图提前预加载：CSS 里的 background 图浏览器发现得晚，
            预加载能让它从 HTML 一起开始下，首屏更快（换图不用改这里，自动跟着 bgImages[0] 走） */}
        {!siteConfig.useGradient && siteConfig.bgImages?.[0] && (
          <link rel="preload" as="image" href={siteConfig.bgImages[0]} />
        )}
      </head>

      <body className="w-screen overflow-x-hidden min-h-full flex flex-col relative transition-colors duration-1000 bg-slate-50 dark:bg-slate-950 font-serif">
        <ThemeProvider>

          {/* 🔄 内容一变（控制台改完自动同步过来）就软刷新当前页面，不用手动 F5 */}
          <ContentLiveRefresh />

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

                {/* 👇 🌟 优化：手机端去掉了 mix-blend-overlay，但保留了 blur 模糊光晕，确保视觉不打折 */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/40 dark:bg-indigo-900/20 blur-[100px] rounded-full z-[-7] md:mix-blend-overlay"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/30 dark:bg-purple-900/30 blur-[100px] rounded-full z-[-7] md:mix-blend-overlay"></div>

                {/* 隐藏手机端高负载粒子特效 */}
                <div className="hidden md:block absolute inset-0 w-full h-full">
                  <BackgroundEffects />
                </div>
              </div>

              {/* 隐藏手机端弹幕 */}
              <div className="hidden md:block">
                <DanmakuBackground />
              </div>

              <div className="relative z-10 flex-1 flex flex-col">
                {/*
                  🧭 导航栏挪到**根布局**里了（原来 14 个页面各自 import 一份）。

                  为什么必须这样：页面各引一份 = 切页时整条导航栏被销毁重建 ✗
                  表现就是"点选项卡 → 色块刚揭开 → 页面像刷新一样断了"✗
                  放到这里之后它**全程常驻**（React 不会重建它）：切页只换下面 children 那块 ✓
                    · 色块能把揭开动画（.32s 弹簧）完整播完 ✓ 不会被切页打断 ✓
                    · 选中的那一条平滑接手：点过的那条 → 新页面的 active ✓ 中间不闪 ✗
                    · 手机上开着的抽屉、鼠标悬停状态也都跨页保留了 ✓
                  ⚠️ 高度/留白：导航栏自己是 `fixed`（不占布局空间），
                     所以各页面原来的 mt-24 / pt-20 那些留白**一个像素都不用改** ✓
                  ⚠️ 控制台那边（my-blog-manager/app/layout.tsx）是同一套写法，改一处记得看另一处 ✓
                */}
                <Navbar />
                {children}
              </div>

              <div className="hidden md:block">
                <FloatingPlayer />
              </div>

              <div className="hidden md:block">
                <GlobalToolbox />
              </div>

              {/* 手机端右下角那个返回按钮已按需求移除 */}

              {/* 隐藏手机端点击粒子 */}
              <div className="hidden md:block">
                <ClickEffect />
              </div>
            </div>

            <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
              @keyframes gradientMove { 
                0% { background-position: 0% 50%; } 
                50% { background-position: 100% 50%; } 
                100% { background-position: 0% 50%; } 
              }
            `}} />
          </MusicProvider>

          <div className="hidden md:block">
            <CyberCat />
          </div>

          <CodeCopy />
          {/* 🔗 GitHub / Gitee 的仓库或主页链接 → 卡片（和控制台那份是同一套写法） */}
          <RepoCard />
        <TableScroll />
        {/* 🔍 点击图片放大查看（和资源页/控制台预览是同一个组件、同一份代码） */}
        <ImageZoom />
        {/* 🔗 正文里的站内链接改走客户端路由：点一下瞬间切页，不再整篇文档重载
            （和控制台 my-blog-manager 那份是同一套写法） */}
        <InSiteLinks />
        <PageKeys />

        </ThemeProvider>
      </body>
    </html>
  );
}