"use client";

import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

function parseLrc(lrcText: string) {
  if (!lrcText || lrcText.length > 30000) return [];

  const lines = lrcText.split(/\r?\n/);
  const result = [];

  for (let line of lines) {
    const matches = [...line.matchAll(/\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]/g)];
    if (matches.length > 0) {
      let text = line.replace(/\[\d{2,}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();

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

type PlayMode = 'loop' | 'single' | 'random';

interface MusicContextType {
  playlist: any[];
  currentIndex: number;
  currentSong: any;
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





const LS_KEY = 'tl-music-v1';

type SavedMusic = {
  id: string;
  index: number;
  pos: number;
  dur: number;
  playing: boolean;
  vol: number;
  muted: boolean;
  mode: PlayMode;
  ts: number;
};

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

  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>('loop');

  const audioRef = useRef<HTMLAudioElement>(null);

  const savedRef = useRef<SavedMusic | null>(null);
  const readyRef = useRef(false);
  const seekDoneRef = useRef(false);
  const lastSaveRef = useRef(0);
  const pendingResumeRef = useRef(false);

  const currentSong = playlist[currentIndex];

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
      playing: !el.paused,
      vol: volume,
      muted: isMuted,
      mode: playMode,
      ts: now,
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {  }
  };

  useEffect(() => {
    const s = readSaved();
    if (s) {
      savedRef.current = s;
      setVolumeState(s.vol);
      setIsMuted(s.muted);
      setPlayMode(s.mode);
      if (s.playing && isPageReload()) {
        pendingResumeRef.current = true;
        setIsPlaying(true);
      }
    }
    readyRef.current = true;
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchMusicData = async () => {
      try {
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

    fetchMusicData();

    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    const s = savedRef.current;
    if (!el || !s || !currentSong) return;
    if (currentSong.id !== s.id) return;
    if (seekDoneRef.current) return;
    const pos = s.dur > 2 ? Math.min(s.pos, s.dur - 1.5) : s.pos;
    if (pos > 0.5) {
      try { el.currentTime = pos; } catch {  }
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
          .then(() => { pendingResumeRef.current = false; })
          .catch(() => setIsPlaying(false));
      }
    }
    return () => { isMounted = false; };
  }, [currentIndex, playlist.length]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    saveNow(true);
  }, [volume, isMuted, currentSong?.src]);

  useEffect(() => {
    const flush = () => saveNow(true);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
      flush();
    };
  }, [volume, isMuted, playMode, currentIndex, currentSong]);


  useEffect(() => {
    if (!pendingResumeRef.current) return;

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
      if (!a) return;
      if (!a.paused) { finish(); return; }
      a.play()
        .then(() => { setIsPlaying(true); finish(); })
        .catch(() => {  });
    };

    EVENTS.forEach((e) => window.addEventListener(e, tryPlay, { capture: true, passive: true }));
    tryPlay();

    return () => EVENTS.forEach((e) => window.removeEventListener(e, tryPlay, true));
  }, [currentSong?.src]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(!isPlaying);
      saveNow(true);
    }
  };

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

  const playSong = (index: number) => {
    setCurrentIndex(index);
    if (!isPlaying) setIsPlaying(true);
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
      saveNow();
    }
  };

  const handleLoadedMetadata = () => {
    const el = audioRef.current;
    const s = savedRef.current;
    if (el && s && currentSong && currentSong.id === s.id && !seekDoneRef.current && s.pos > 0.5) {
      const pos = s.dur > 2 ? Math.min(s.pos, s.dur - 1.5) : s.pos;
      if (Math.abs(el.currentTime - pos) > 1.5) {
        try { el.currentTime = pos; } catch {  }
      }
      seekDoneRef.current = true;
    }
    handleTimeUpdate();
  };

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
    saveNow(true);
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
        volume, isMuted, playMode,
        togglePlay, nextSong, prevSong, handleSeek,
        playSong, setVolume, toggleMute, togglePlayMode
    }}>
      {children}
      {currentSong && (
        <audio
          ref={audioRef}
          src={currentSong.src || undefined}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
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