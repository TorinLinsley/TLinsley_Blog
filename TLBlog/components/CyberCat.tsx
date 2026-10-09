"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function CyberCat() {
  const [isPetted, setIsPetted] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const chatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  /** 🖐️ 刚刚是「拖动」还是「点击」——拖动松手后浏览器还会补一次 click，那次不算摸猫 */
  const draggedRef = useRef(false);

  // --- 💬 说话功能 ---
  const speak = (text: string, duration = 6000) => {
    setSpeech(text);
    if (chatTimeoutRef.current) clearTimeout(chatTimeoutRef.current);
    chatTimeoutRef.current = setTimeout(() => {
      setSpeech(null);
    }, duration);
  };

  /**
   * 接口返回非 2xx 时该怎么说话。
   *
   * ⚠️ 只有"本来就是写给访客看"的那几类才把服务端文案转述出来：
   *      403 来源被拒 / 413 消息太长 / 429 发得太快
   *    其余（尤其是 500）一律**不转述**，走兜底台词 ——
   *    否则像 `Key missing` 这种内部错误会直接显示在页面上，
   *    既难看，又等于把服务端内部信息透给访客。
   *
   * @returns true = 已经说过了，调用方直接 return；false = 调用方走 throw 用兜底台词
   */
  const speakIfFriendlyError = async (res: Response): Promise<boolean> => {
    if (![403, 413, 429].includes(res.status)) return false;
    const info = await res.json().catch(() => null);
    if (!info?.error || typeof info.error !== 'string') return false;
    speak(info.error, 6000);
    return true;
  };

  // --- 🖱️ 交互事件：摸猫猫 ---
  const handlePetCat = () => {
    if (draggedRef.current) return;   // 刚才是把猫拖走，不是摸它
    if (isPetted) return;
    setIsPetted(true);
    speak("呼噜噜... 摸得本喵很舒服喵~", 2000);
    setTimeout(() => {
      setIsPetted(false);
    }, 2000);
  };

  // --- 🐟 交互事件：喂小鱼干 ---
  const handleFeed = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止触发摸猫或拖拽
    if (isThinking) return;

    setShowInput(false); // 喂食时关掉输入框
    setIsThinking(true);
    speak("嗷呜！真好吃喵！本喵吃饱了要说两句...", 6000);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: "我刚刚喂了你一条美味的小鱼干！你有什么表示？" }),
      });

      if (!res.ok) {
        // 只有 403/413/429 才转述服务端文案；500 走兜底（别把 Key missing 抛给访客）
        if (await speakIfFriendlyError(res)) return;
        throw new Error('API Error');
      }

      const data = await res.json();
      speak(data.reply, 8000);
    } catch (error) {
      speak("吧唧吧唧... 鱼干好吃，但本喵卡壳了喵...", 4000);
    } finally {
      setIsThinking(false);
    }
  };

  // --- 💬 交互事件：发送聊天 ---
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isThinking) return;

    const userMessage = inputValue;
    setInputValue('');
    setShowInput(false);
    setIsThinking(true);
    speak("让本喵想想喵...", 10000);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!res.ok) {
        // 同上：仍然只有 403/413/429 才转述，500 走兜底
        if (await speakIfFriendlyError(res)) return;
        throw new Error('API Error');
      }

      const data = await res.json();
      speak(data.reply, 8000);
    } catch (error) {
      speak("铲屎官的网线被老鼠咬断了吧？喵！", 4000);
    } finally {
      setIsThinking(false);
    }
  };

  // --- ⏳ 随机挂机语录 ---
  useEffect(() => {
    const randomBarks = [
      "喵呜~ 今天天气真不错喵~",
      "好困哦，想睡觉喵...",
      "铲屎官，快去敲代码！",
      "我的小鱼干藏哪里去了？",
      "怎么没人理本喵...",
    ];
    const randomTalkInterval = setInterval(() => {
      if (!speech && !showInput && !isThinking && Math.random() > 0.8) {
        const randomMsg = randomBarks[Math.floor(Math.random() * randomBarks.length)];
        speak(randomMsg, 4000);
      }
    }, 20000);

    return () => clearInterval(randomTalkInterval);
  }, [speech, showInput, isThinking]);


  return (
    <motion.div
      drag
      /* 🖐️ 和控制台的悬浮播放器一样：想去哪就拖到哪。
         ⚠️ 原来这里写的是 dragConstraints={{ left:0, right:0, top:0, bottom:0 }} ——
         那个值等于「位移上限 0 像素」，看着有 drag 属性，实际拖不动、只会弹回来。
         所以别再加 dragConstraints（播放器也没加）。 */
      dragMomentum={false}
      /* 🐱 left = 音乐播放器的左边距 + 3rem。
         3rem 正好是猫左边那两个按钮的偏移量（下面那个 div 是 -left-12 = -3rem），
         所以按钮的左边缘会**正好和播放器的左边缘对齐**，不会被推到屏幕外面去。
         = max(0px, 1.5rem - 2vw) + 3rem = max(3rem, 4.5rem - 2vw)
         （1920 的屏：max(48px, 33.6px) = 48px → 猫在 48px，按钮左边缘落在 0，和播放器齐平） */
      style={{ touchAction: 'none', right: 'max(1.5rem, calc(2.5rem - 2vw))' }}
      /* 拖完紧接着那一次 click 要忽略：拖猫不该等于摸猫 */
      onPointerDownCapture={() => { draggedRef.current = false; }}
      onDragStart={() => { draggedRef.current = true; }}
      whileDrag={{ scale: 1.1, cursor: "grabbing" }}
      /* ↔️ 默认在**右下角**（和悬浮播放器同一侧、叠在它上面），右下角让给计算器 */
      className="fixed bottom-20 z-[9999] flex flex-col items-center group cursor-grab active:cursor-grabbing"
    >
      {/* 💬 聊天气泡 */}
      <div className="relative w-full flex justify-center mb-6">
        <AnimatePresence>
          {speech && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="absolute bottom-0 right-0 bg-white dark:bg-slate-800 text-slate-700 dark:text-gray-200 px-4 py-3 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 text-sm max-w-[240px] break-words text-center leading-relaxed"
              style={{ pointerEvents: 'none', transformOrigin: 'bottom center' }}
            >
              {speech}
              <div className="absolute -bottom-[6px] right-[54px] w-3 h-3 bg-white dark:bg-slate-800 border-b border-r border-gray-100 dark:border-slate-700 transform rotate-45"></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 🐈 猫咪本体 & 交互按钮区 */}
      <div className="relative">

        {/* 🌟 核心修改区：去掉了 opacity-0 和 group-hover，让按钮常驻显示 */}
        <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20">

            {/* 💬 聊天按钮 */}
            <button
              /* 和悬浮播放器那两个按钮一样：从按钮上按下不触发拖动，点击照常 */
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                 e.stopPropagation();
                 setShowInput(!showInput);
              }}
              // 稍微加了一点半透明背景，让常驻按钮在深色背景下也好看
              className="bg-white/90 dark:bg-slate-700/90 p-2.5 rounded-full shadow-md hover:scale-110 active:scale-95 transition-transform border border-gray-100 dark:border-slate-600 text-blue-500 hover:text-blue-600 flex items-center justify-center backdrop-blur-sm"
              title="聊天"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
              </svg>
            </button>

            {/* 🐟 喂食按钮 */}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleFeed}
              disabled={isThinking}
              className={`bg-white/90 dark:bg-slate-700/90 p-2.5 rounded-full shadow-md hover:scale-110 active:scale-95 transition-transform border border-gray-100 dark:border-slate-600 flex items-center justify-center backdrop-blur-sm ${isThinking ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="喂小鱼干"
            >
              <span className="text-xl leading-none">🐟</span>
            </button>
        </div>

        {/* 猫咪图片容器 */}
        <div
          className="w-[120px] h-[120px] relative cursor-pointer"
          onClick={handlePetCat}
        >
          <style>{`
            .cat-sprite {
              width: 100%;
              height: 100%;
              background-image: url('/siamese-cat.png'); 
              background-size: 300% 300%; 
              background-repeat: no-repeat;
              image-rendering: pixelated; 
            }
            .cat-idle {
              animation: idle-frames 1.2s infinite;
              background-position-y: 0%; 
            }
            .cat-petted {
              animation: pet-frames 0.8s infinite;
              background-position-y: 50%; 
            }
            .cat-thinking {
              animation: idle-frames 0.6s infinite;
              background-position-y: 0%; 
            }
            @keyframes idle-frames {
              0%, 33.32% { background-position-x: 0%; }
              33.33%, 66.65% { background-position-x: 50%; }
              66.66%, 100% { background-position-x: 100%; }
            }
            @keyframes pet-frames {
              0%, 49.99% { background-position-x: 0%; }
              50%, 100% { background-position-x: 50%; }
            }
          `}</style>
          <div className={`cat-sprite drop-shadow-2xl ${isPetted ? 'cat-petted' : isThinking ? 'cat-thinking' : 'cat-idle'}`} />
        </div>
      </div>

      {/* ⌨️ 互动输入框 */}
      <AnimatePresence>
        {showInput && (
          <motion.form
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            onSubmit={handleChatSubmit}
            className="absolute -bottom-14 bg-white dark:bg-slate-800 p-1.5 rounded-full shadow-lg flex items-center border border-gray-200 dark:border-slate-700 w-56 z-20"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="跟煤球说点啥喵..."
              className="bg-transparent border-none outline-none text-sm px-3 py-1 w-full dark:text-white placeholder-gray-400"
              disabled={isThinking}
              autoFocus
            />
            <button
              type="submit"
              disabled={isThinking || !inputValue.trim()}
              className={`rounded-full p-1.5 ml-1 flex items-center justify-center transition-colors ${
                isThinking || !inputValue.trim() ? 'bg-gray-300 text-gray-500' : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}