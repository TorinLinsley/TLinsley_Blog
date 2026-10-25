import 'katex/dist/katex.min.css';
import type { Metadata } from "next";
import "./noto-serif-sc.css";
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
import ClickUnhover from '../components/ClickUnhover';

import ContentLiveRefresh from '../components/ContentLiveRefresh';
import Navbar from '../components/Navbar';
import NavSwitchDim from '../components/NavSwitchDim';
import BackToTop from '../components/BackToTop';


const SITE_URL = 'https://blog.torinlinsley.top';

const SITE_ALIASES = [
  'TLinsley', 'tlinsley', 'TL博客', 'tl博客', 'tlinsley博客', 'TLinsley博客',
  'Torin Linsley', 'torinlinsley', '宝藏之地',
];

const SITE_DESCRIPTION = 'Torin Linsley 的个人博客。记录开发、学习笔记，另有资源分享与在线工具。';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: siteConfig.title,
  description: SITE_DESCRIPTION,
  keywords: [...SITE_ALIASES, '资源分享', '工具站'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL + '/',
    siteName: siteConfig.title,
    title: siteConfig.title,
    description: SITE_DESCRIPTION,
    locale: 'zh_CN',
  },
  icons: {
    icon: [
      { url: siteConfig.faviconUrl },
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {
}
        <meta name="referrer" content="no-referrer" />

        {



}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{
              var u=navigator.userAgent||'';
              /* 🧱 已知"嘴上支持、实际不渲染"的浏览器 → 挂 .no-glass 走实色兜底 ✗
                 · OPPO / HeyTap 自带浏览器（实测不渲染 ✓）
                 · Windows 7 / 8 / 8.1：这代系统上 backdrop-filter 实测不生效 ✗（Win7+Chrome109+硬件合成也照样没有 ✓）
                 → 按 UA 里的 Windows NT 6.1/6.2/6.3 点名 ✓ 其它系统不受影响 ✓ */
              var bad=/HeyTapBrowser|OppoBrowser|HeyTap|OPPOBrowser/i.test(u)||/Windows NT 6\.1|Windows NT 6\.2|Windows NT 6\.3/i.test(u);
              if(bad){document.documentElement.classList.add('no-glass')}
            }catch(e){}`,
          }}
        />

        {
}
        {!siteConfig.useGradient && siteConfig.bgImages?.[0] && (
          <link rel="preload" as="image" href={siteConfig.bgImages[0]} />
        )}

        {
}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: siteConfig.title,
              alternateName: SITE_ALIASES,
              url: SITE_URL + '/',
              inLanguage: 'zh-CN',
              publisher: {
                '@type': 'Person',
                name: siteConfig.authorName || siteConfig.navTitle || '',
                url: SITE_URL + '/about',
              },
            }),
          }}
        />
      </head>

      <body className="w-screen overflow-x-hidden min-h-full flex flex-col relative transition-colors duration-1000 bg-slate-50 dark:bg-slate-950 font-serif">
        <ThemeProvider>

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
                    backgroundPosition: '50% 50%',
                    animation: siteConfig.useGradient ? 'gradientMove 15s ease infinite' : 'none'
                  }}
                ></div>

                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/40 dark:bg-indigo-900/20 blur-[100px] rounded-full z-[-7] md:mix-blend-overlay"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/30 dark:bg-purple-900/30 blur-[100px] rounded-full z-[-7] md:mix-blend-overlay"></div>

                <div className="hidden md:block absolute inset-0 w-full h-full">
                  <BackgroundEffects />
                </div>
              </div>

              <div className="hidden md:block">
                <DanmakuBackground />
              </div>

              <div className="relative z-10 flex-1 flex flex-col">
                {

}
                <Navbar />
                {
}
                <NavSwitchDim>{children}</NavSwitchDim>
              </div>

              <div className="hidden md:block">
                <FloatingPlayer />
              </div>

              <div className="hidden md:block">
                <GlobalToolbox />
              </div>

              {
}
              <BackToTop />

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
          <RepoCard />
        <TableScroll />
        <ImageZoom />
        {
}
        <InSiteLinks />
        {
}
        <ClickUnhover />
        <PageKeys />

        </ThemeProvider>
      </body>
    </html>
  );
}