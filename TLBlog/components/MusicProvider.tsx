"use client";

import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

// 【增强版 LRC 歌词解析】
function parseLrc(lrcText: string) {
  if (!lrcText || lrcText.length > 30000) return [];

  const lines = lrcText.split(/\r?\n/);
  const result = [];

  for (let line of lines) {
    const matches = [...line.matchAll(/\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]/g)];
    if (matches.length > 0) {
      let text = line.replace(/\[\d{2,}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();

      // 剔除控制字符
      const cleanText = text.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "");

      if (cleanText) {
        for (const match of matches) {
          const min = parseInt(match[1]);
          const sec = parseInt(match[2]);
          const ms = match[3] ? parseInt(match[3]) : 0;
          const divisor = match[3] && match[3].length === 3 ? 1000 : 100;
          const time = min * 60 + sec + ms / divisor;
          result.push({ time, text: cleanText });
        }
      }
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

// 🌟 1. 扩充 Context 类型，加入 MusicPage 需要的所有属性
type PlayMode = 'loop' | 'single' | 'random';

interface MusicContextType {
  playlist: any[];
  currentIndex: number;
  currentSong: any; // 扩展了 lyrics 属性
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  currentLyric: string;
  isLoading: boolean;
  volume: number;
  isMuted: boolean;
  playMode: PlayMode;

  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  handleSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  playSong: (index: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  togglePlayMode: () => void;
}

const MusicContext = createContext<MusicContextType | null>(null);

/* ═══════════════════════════════════════════════════════════════════════════
   💾 播放进度「本地」保存 —— 只存在**用户自己的浏览器**里，服务器一概不碰 ✓

   用户要求（2026-10-08）：
     · 刷新当前页面（F5）→ **接着上一次继续放**，曲不能断 ✓
     · 从站内超链接跳转过来 → 恢复上次那一首 + 播放到哪儿，但**保持暂停**，
       用户自己点播放就行 ✓
     · "播放/暂停状态"本身不算要保存的内容 —— 它只在**刷新**这一种情况下
       用来判断"要不要自动接着放" ✓
     · 用户清掉浏览器数据（localStorage）→ 自然回到全新状态 ✓

   为什么用 localStorage：这是每个用户各自的播放进度，和服务端无关；
   换台电脑、换个浏览器就是各自独立的一份 ✓

   ⚠️ 只在浏览器端读写（localStorage 在服务端不存在）—— 所以读取统一放在
      useEffect 里（挂载之后），**不能**写在 useState 初始化里，
      否则服务端渲染的 HTML 和客户端第一次渲染对不上（hydration 报错）✗
   ═══════════════════════════════════════════════════════════════════════════ */

const LS_KEY = 'tl-music-v1';

type SavedMusic = {
  id: string;        // 优先按歌曲 id 找回来（歌单顺序变了也不会串到别的歌）
  index: number;     // id 找不到时（歌被删了）的兜底
  pos: number;       // 播放到第几秒
  dur: number;       // 上次的总时长（用来夹住 pos，别超过结尾）
  playing: boolean;  // 刷新前是不是正在放 —— **只在"刷新"时**用它决定要不要自动接着放 ✓
  vol: number;
  muted: boolean;
  mode: PlayMode;
  ts: number;
};

/** 读本地存档（坏数据一律当成没有，不让它把播放器搞崩） */
function readSaved(): SavedMusic | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    return {
      id: typeof v.id === 'string' ? v.id : '',
      index: Number.isFinite(v.index) ? Number(v.index) : 0,
      pos: Number.isFinite(v.pos) && v.pos > 0 ? Number(v.pos) : 0,
      dur: Number.isFinite(v.dur) && v.dur > 0 ? Number(v.dur) : 0,
      playing: !!v.playing,
      vol: Number.isFinite(v.vol) ? Number(v.vol) : 1,
      muted: !!v.muted,
      mode: v.mode === 'single' || v.mode === 'random' ? v.mode : 'loop',
      ts: Number(v.ts) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * 这一次页面加载是不是「按了刷新 / F5」？
 *   · 'reload'        → 刷新 ✓ 这种情况才自动接着放 ✓
 *   · 'navigate'      → 新打开 / 站内跳转过来 → 保持暂停，用户自己点 ✓
 *   · 'back_forward'  → 后退/前进 → 同样当"新打开"处理 ✓
 * （这也正好顺着浏览器的自动播放策略：刷新时浏览器认为用户已经交互过，
 *   允许自动播；新打开一个页面本来就播不了 ✓）
 */
function isPageReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return !!nav && nav.type === 'reload';
  } catch {
    return false;
  }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const [playlist, setPlaylist] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lyrics, setLyrics] = useState<{ time: number; text: string }[]>([]);
  const [currentLyric, setCurrentLyric] = useState("正在连接高可用神经云端...");
  const [isLoading, setIsLoading] = useState(true);

  // 🌟 2. 新增音量和播放模式状态
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>('loop');

  const audioRef = useRef<HTMLAudioElement>(null);

  // 💾 本地存档相关的几个 ref（都需要跨渲染保留、且改了不用触发重渲染）
  const savedRef = useRef<SavedMusic | null>(null);   // 这次挂载读到的存档（恢复用）
  const readyRef = useRef(false);                     // 恢复完成前，一律不许往存档里写（免得用初始值把存档覆盖了 ✗）
  const seekDoneRef = useRef(false);                  // 位置只恢复一次
  const lastSaveRef = useRef(0);                      // 写入节流用的时间戳
  /**
   * 🛟 「刷新后想接着放，但被浏览器自动播放策略拦下」时挂的标记 ✓
   *    用户在这个页面上第一次点击/按键（= 浏览器认可的用户手势）就立刻接着放 ✓
   *    为什么需要：刷新出来的新文档里没有"用户手势"，带声音的自动播放会被拒绝 ✗
   *    —— 这是浏览器的规矩，不是我们能绕过去的 ✗
   */
  const pendingResumeRef = useRef(false);

  /**
   * 当前歌曲 —— 💾 存档、恢复、渲染都要用它，所以**必须在这里提前声明** ✓
   * ⚠️ 不能像原来那样放到 return 前面才声明：下面几个 useEffect 的依赖数组里要用它，
   *    而那些 useEffect 是在渲染过程中就要求值的 —— 放后面会直接踩
   *    "Cannot access 'currentSong' before initialization" ✗（真会白屏）
   */
  const currentSong = playlist[currentIndex];

  /**
   * 💾 把当前状态写进本地存档。
   *   · 每秒最多写一次（timeupdate 每秒会触发好几次，不节流没必要）
   *   · force = true：真的有关键动作（暂停/拖动/切歌/关页面）→ 立刻写，不等节流 ✓
   *   · ⚠️ 恢复流程走完之前（readyRef）一律不写 —— 否则挂载瞬间会用"初始值"
   *     把用户上次的存档覆盖掉 ✗（这是最容易踩的坑）
   */
  const saveNow = (force = false) => {
    if (!readyRef.current) return;
    const el = audioRef.current;
    if (!el || !currentSong) return;
    const now = Date.now();
    if (!force && now - lastSaveRef.current < 900) return;
    lastSaveRef.current = now;
    const data: SavedMusic = {
      id: currentSong.id || '',
      index: currentIndex,
      pos: Number.isFinite(el.currentTime) ? el.currentTime : 0,
      dur: Number.isFinite(el.duration) ? el.duration : 0,
      playing: !el.paused,          // ← 直接问 audio 元素，永远准 ✓（不依赖 state）
      vol: volume,
      muted: isMuted,
      mode: playMode,
      ts: now,
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* 隐私模式/写满 → 忽略 */ }
  };

  /* ── ① 挂载后读存档：恢复音量/模式 + 决定"刷新时要不要自动接着放" ✓ ───────── */
  useEffect(() => {
    const s = readSaved();
    if (s) {
      savedRef.current = s;
      setVolumeState(s.vol);
      setIsMuted(s.muted);
      setPlayMode(s.mode);
      // 只有「刷新」且上次确实在放 → 自动接着放 ✓
      // 其它情况（站内跳转过来 / 新打开 / 从别的网站回来）→ 恢复歌曲和进度，但保持暂停 ✓
      if (s.playing && isPageReload()) {
        pendingResumeRef.current = true;   // 万一被浏览器拦了，用户一碰页面就接着放 ✓
        setIsPlaying(true);
      }
    }
    readyRef.current = true;   // 从这里开始才允许写存档 ✓
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchMusicData = async () => {
      try {
        // 🎵 不再带 ?ids=：歌单由服务端在请求时从 data/music-config.json 读
        //   （控制台保存后刷新即生效，不用重新构建）。请求次数和以前一模一样。
        const res = await fetch('/api/music');
        const rawResults = await res.json();

        const mergedPlaylist = rawResults
          .filter((song: any) => song && song.url && !song.error)
          .map((song: any) => ({
            id: song.id || Math.random().toString(),
            title: song.name || '未知歌曲',
            artist: song.artist || song.author || '未知歌手',
            cover: song.cover || song.pic || 'https://bu.dusays.com/2026/03/24/69c24230a5ff8.jpg',
            src: song.url,
            lrcUrl: null,
            lyrics: song.lrc ? parseLrc(song.lrc) : []
          }));

        if (isMounted) {
          if (mergedPlaylist.length > 0) setPlaylist(mergedPlaylist);
          else setCurrentLyric("云端链路受阻");

          // 💾 歌单回来了 → 把上次那一首找回来 ✓
          //    优先按 id 找（歌单加了新歌、顺序变了也不会串 ✗）；找不到再用 index 兜底 ✓
          const s = savedRef.current;
          if (s && mergedPlaylist.length > 0) {
            const byId = mergedPlaylist.findIndex((x: any) => x.id && x.id === s.id);
            const idx = byId >= 0 ? byId : Math.min(Math.max(0, s.index), mergedPlaylist.length - 1);
            setCurrentIndex(idx);
          }

          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) { setCurrentLyric("网络初始化失败"); setIsLoading(false); }
      }
    };

    // 歌单为空时服务端直接回 []，这里不用再拿构建时的配置做判断
    fetchMusicData();

    return () => { isMounted = false; };
  }, []);

  /* ── ② 恢复播放位置：src 一换就先把"从哪儿开始播"设好 ✓ ──────────────────
     ⚠️ 必须声明在下面那个"播放"的 effect **之前** —— effect 按声明顺序执行，
        否则会出现"先从头放了一小下、再跳到上次的位置"（能听出来 ✗） */
  useEffect(() => {
    const el = audioRef.current;
    const s = savedRef.current;
    if (!el || !s || !currentSong) return;
    if (currentSong.id !== s.id) return;        // 只对"上次那一首"生效
    if (seekDoneRef.current) return;
    const pos = s.dur > 2 ? Math.min(s.pos, s.dur - 1.5) : s.pos;   // 夹住，别超过结尾
    if (pos > 0.5) {
      try { el.currentTime = pos; } catch { /* 个别浏览器还没加载完，忽略，下面 metadata 再补一次 */ }
    }
    seekDoneRef.current = true;
  }, [currentSong?.src, currentSong?.id]);

  useEffect(() => {
    if (playlist.length === 0) return;
    let isMounted = true;
    const currentSong = playlist[currentIndex];
    setLyrics([]);
    setCurrentLyric("♪ 正在缓冲 ♪");
    if (currentSong.lyrics && currentSong.lyrics.length > 0) {
      if (isMounted) {
        setLyrics(currentSong.lyrics);
        setCurrentLyric(currentSong.lyrics[0]?.text || "\u266a \u7eaf\u4eab\u97f3\u4e50 \u266a");
      }
    } else if (currentSong.lrcUrl) {
      fetch(currentSong.lrcUrl)
        .then(res => res.text())
        .then(text => {
          if (isMounted) {
             const parsed = parseLrc(text);
             setLyrics(parsed);
             setPlaylist(prev => {
                const newPlaylist = [...prev];
                newPlaylist[currentIndex].lyrics = parsed;
                return newPlaylist;
             });
          }
        })
        .catch(() => { if (isMounted) setCurrentLyric("\u266a \u7eaf\u4eab\u97f3\u4e50 \u266a"); });
    }

    if (isPlaying && audioRef.current) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => { pendingResumeRef.current = false; })   // 放起来了 → 撤掉兜底标记 ✓
          // ⚠️ 浏览器可能拦下自动播放（刷新出来的新文档没有用户手势，几乎一定会拦）✗
          //    → 保持暂停，但**兜底标记留着**：用户一碰页面就自动接着放 ✓
          .catch(() => setIsPlaying(false));
      }
    }
    return () => { isMounted = false; };
  }, [currentIndex, playlist.length]); // 移除 playlist 依赖防止无限循环，只依赖长度

  // 🌟 4. 同步音量到 audio 元素（+ 💾 音量/静音也顺手存一下 ✓）
  // ⚠️ 依赖里必须带上 currentSong?.src：audio 元素是**歌单到了才挂上**的，
  //    只依赖 [volume, isMuted] 的话，恢复出来的音量永远应用不到它上面 ✗
  //    （原来就有这个隐患：默认音量 1 看不出来，一旦要恢复存档的音量就露馅 ✗）
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    saveNow(true);
  }, [volume, isMuted, currentSong?.src]);

  /* ── ③ 关页面/刷新前再存一次（F5 时最关键的一次：位置要精确 ✓） ─────────── */
  useEffect(() => {
    const flush = () => saveNow(true);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    // 切到后台也存一次（手机上直接杀掉 App 时 pagehide 不一定来得及）
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
      flush();   // 组件卸载前也补一次
    };
  }, [volume, isMuted, playMode, currentIndex, currentSong]);

  /* ── ④ 🛟 自动播放被浏览器拦下时的兜底：用户一碰页面就接着放 ✓ ──────────────
     ⚠️⚠️ 这里**绝对不能**再做"站内跳转就暂停"✗ —— 那是我上一版理解错了用户的意思：
        用户要的是"**从当前标签页跳到网站之外的网页**才暂停"✓
        而站内跳转现在是客户端路由（InSiteLinks 把站内链接全改成 SPA 了），
        音乐本来就**应该继续放** ✓ 上一版加了暂停 → 变成"翻一页停一次" ✗ 用户已经骂过 ✗ 别再改回去 ✗

     "跳到站外再回来"为什么不用管：同一标签页跳到站外 → 整页卸载，音乐自然停 ✓
     回来那次加载的 navigation.type 是 'navigate' / 'back_forward'（不是 'reload'）
     → 上面挂载那段恢复逻辑自然把它当"新打开"：恢复歌曲 + 进度、保持暂停 ✓ 正是用户要的 ✓ */
  useEffect(() => {
    if (!pendingResumeRef.current) return;

    // 🛟 只试一次是不够的：浏览器**只认"激活类"事件**（指针按下 / 按键 / 触摸…）✗
    //    → 所以这里广撒网 + 一直挂着，直到某一次真的放起来为止 ✓
    //    ⚠️ 绝对不能用 { once: true }：万一某个事件浏览器不认，监听器被消耗掉，
    //       后面真正的点击就再也接不住了 ✗（踩过）
    let done = false;
    const EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'touchstart', 'touchend'];

    const finish = () => {
      done = true;
      pendingResumeRef.current = false;
      EVENTS.forEach((e) => window.removeEventListener(e, tryPlay, true));
    };

    const tryPlay = () => {
      if (done) return;
      const a = audioRef.current;
      if (!a) return;                        // 🎵 歌还没挂上 → 等下一次事件（别当成失败 ✗）
      if (!a.paused) { finish(); return; }   // 已经在放了 → 收工 ✓
      a.play()
        .then(() => { setIsPlaying(true); finish(); })
        .catch(() => { /* 这一下浏览器还不认，等下一次事件 ✓ */ });
    };

    EVENTS.forEach((e) => window.addEventListener(e, tryPlay, { capture: true, passive: true }));
    // 页面一加载就先试一次：**媒体参与度(MEI)够高的浏览器这时候就会放行** → 完全无感 ✓
    tryPlay();

    return () => EVENTS.forEach((e) => window.removeEventListener(e, tryPlay, true));
  }, [currentSong?.src]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(!isPlaying);
      saveNow(true);        // 💾 手动播放/暂停是最该立刻记下来的一刻 ✓
    }
  };

  // 🌟 5. 重写 nextSong，加入对随机模式的处理
  const nextSong = () => {
    if (playMode === 'random') {
      setCurrentIndex(Math.floor(Math.random() * playlist.length));
    } else {
      setCurrentIndex((prev) => (prev + 1) % playlist.length);
    }
  };

  const prevSong = () => {
    if (playMode === 'random') {
      setCurrentIndex(Math.floor(Math.random() * playlist.length));
    } else {
      setCurrentIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
    }
  };

  // 🌟 6. 暴露直接播放指定歌曲的方法
  const playSong = (index: number) => {
    setCurrentIndex(index);
    if (!isPlaying) setIsPlaying(true); // 保证切歌后自动播放
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const { currentTime, duration } = audioRef.current;
      setCurrentTime(currentTime);
      setDuration(duration || 0);
      setProgress((currentTime / (duration || 1)) * 100);

      if (lyrics.length > 0) {
        const activeLyric = lyrics.slice().reverse().find(l => currentTime >= l.time);
        if (activeLyric && activeLyric.text !== currentLyric) {
          setCurrentLyric(activeLyric.text);
        }
      }
      saveNow();          // 💾 播放中每 ~1 秒记一次进度 ✓
    }
  };

  /**
   * 💾 元数据到了补一次位置：
   *   有些浏览器在"还没加载完"时设置 currentTime 会被忽略 —— 这里再校一次，
   *   而且只在"和上次位置差得明显"时才动它（正常情况一次都不会生效 ✓）
   */
  const handleLoadedMetadata = () => {
    const el = audioRef.current;
    const s = savedRef.current;
    if (el && s && currentSong && currentSong.id === s.id && !seekDoneRef.current && s.pos > 0.5) {
      const pos = s.dur > 2 ? Math.min(s.pos, s.dur - 1.5) : s.pos;
      if (Math.abs(el.currentTime - pos) > 1.5) {
        try { el.currentTime = pos; } catch { /* 忽略 */ }
      }
      seekDoneRef.current = true;
    }
    handleTimeUpdate();
  };

  // 🌟 7. 处理歌曲结束
  const handleEnded = () => {
    if (playMode === 'single' && audioRef.current) {
       audioRef.current.currentTime = 0;
       audioRef.current.play();
    } else {
       nextSong();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newProgress = Number(e.target.value);
    setProgress(newProgress);
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = (newProgress / 100) * audioRef.current.duration;
    }
    saveNow(true);        // 💾 拖动进度条立刻记 ✓
  };

  const setVolume = (val: number) => {
    setVolumeState(val);
    if (isMuted && val > 0) setIsMuted(false);
  };

  const toggleMute = () => setIsMuted(!isMuted);

  const togglePlayMode = () => {
    setPlayMode(prev => {
      if (prev === 'loop') return 'single';
      if (prev === 'single') return 'random';
      return 'loop';
    });
  };

  return (
    <MusicContext.Provider value={{
        playlist, currentIndex, currentSong, isPlaying, progress, currentTime, duration, currentLyric, isLoading,
        volume, isMuted, playMode, // 暴露新状态
        togglePlay, nextSong, prevSong, handleSeek,
        playSong, setVolume, toggleMute, togglePlayMode // 暴露新方法
    }}>
      {children}
      {currentSong && (
        <audio
          ref={audioRef}
          src={currentSong.src || undefined}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded} // 使用我们重写的结束处理
          onLoadedMetadata={handleLoadedMetadata}
        />
      )}
    </MusicContext.Provider>
  );
}

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) throw new Error("useMusic must be used within MusicProvider");
  return context;
};
