"use client";

import { usePathname } from 'next/navigation';
import { useMusic } from './MusicProvider';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function FloatingPlayer() {
  const pathname = usePathname();
  const { currentSong, isPlaying, togglePlay, nextSong, currentLyric, isLoading } = useMusic();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 这里只拦截还没有初始化的情况，不拦截首页
  if (!isMounted || isLoading || !currentSong) return null;

  // 【核心修复】：判断是否在首页。在首页时我们让它隐身，但不销毁它！
  const isHidden = pathname === '/';

  return (
    /* ↔️ 默认在**右下角**（和猫同一侧），右下角让给计算器
       🎵 left 用 max(0px, calc(1.5rem - 2vw))：在原来的左边距上再往左偏 2% 屏宽。
          它本来就只离左边 24px（1.5rem），1920 的屏减 38px 会变负数 → 用 max() 夹住，最多贴到最左 0px。 */
    <div className="fixed bottom-6 z-[9999]" style={{ pointerEvents: 'none', right: 'max(0px, calc(1.5rem - 2vw))' }}>
      <motion.div
        drag
        dragMomentum={false} // 取消惯性
        style={{ touchAction: 'none' }}
        // 【核心魔法】：使用 framer-motion 平滑控制它的隐身与显现，并且动态控制点击穿透
        animate={{
          opacity: isHidden ? 0 : 1,
          scale: isHidden ? 0.8 : 1,
          pointerEvents: isHidden ? 'none' : 'auto',
        }}
        initial={false}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="flex items-center gap-3 bg-white/70 dark:bg-slate-800/80 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-2xl p-2 pr-4 rounded-full transition-colors duration-700 cursor-grab active:cursor-grabbing"
      >

        {/* 旋转的光碟封面 */}
        <div
          className="w-10 h-10 rounded-full border border-white/50 shadow-sm flex-shrink-0 overflow-hidden relative animate-[spin_6s_linear_infinite] pointer-events-none"
          style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
        >
          <img src={currentSong.cover || undefined} alt="cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white/80 backdrop-blur-sm rounded-full shadow-inner"></div>
        </div>

        {/* 歌曲信息与滚动歌词 */}
        <div className="flex flex-col w-32 max-w-[120px] overflow-hidden pointer-events-none">
          <span className="text-sm font-bold text-slate-900 dark:text-white truncate transition-colors duration-700">{currentSong.title}</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate transition-colors duration-700">{currentLyric}</span>
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center gap-2 ml-1">
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-8 h-8 bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform cursor-pointer"
          >
            {/* 播放/暂停图标外框 18px（1.125rem）：三角墨迹约 11.25px，比 14px 外框（8.75px）大 2.5px。
                换形状后几何基准从 -6.25% 变 -2.1%；下面这个 translateX 值保持你手调的，没动。 */}
            {isPlaying ? <svg className="w-[1.125rem] h-[1.125rem]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-[1.125rem] h-[1.125rem]" style={{ transform: 'translateX(-2.2%)' }} fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); nextSong(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-slate-600 dark:text-slate-300 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          >
            <svg className="w-[1.625rem] h-[1.625rem]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        </div>

      </motion.div>
    </div>
  );
}