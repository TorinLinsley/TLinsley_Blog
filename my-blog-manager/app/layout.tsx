import 'katex/dist/katex.min.css';
import type { Metadata, Viewport } from "next";
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
import ClickUnhover from '../components/ClickUnhover';
import ApiKeyInjector from '../components/ApiKeyInjector';
import Navbar from '../components/Navbar';
import NavSwitchDim from '../components/NavSwitchDim';
import BackToTop from '../components/BackToTop';


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
        {
}
        {!siteConfig.useGradient && siteConfig.bgImages?.[0] && (
          <link rel="preload" as="image" href={siteConfig.bgImages[0]} />
        )}
      </head>

      <body className="w-screen overflow-x-hidden min-h-full flex flex-col relative transition-colors duration-1000 bg-slate-50 dark:bg-slate-950 font-serif">
        <ThemeProvider>
          <OperationProvider>
            <ToastProvider>
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
                        backgroundPosition: '50% 50%',
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
                    {

}
                    <Navbar />
                    {
}
                    <NavSwitchDim>{children}</NavSwitchDim>
                  </div>

                  {
}
                  <div className="hidden md:block">
                    <FloatingPlayer />
                  </div>
                  <div className="hidden md:block">
                    <GlobalToolbox />
                  </div>
                  <div className="hidden md:block">
                    <ClickEffect />
                  </div>

                  {
}
                  <BackToTop />
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
        <ClickUnhover />
        <CalloutRender />
        <PageKeys />
        {
}
        <ApiKeyInjector />
      </body>
    </html>
  );
}