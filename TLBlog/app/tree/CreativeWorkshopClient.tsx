"use client";

import { useState, useEffect } from 'react';
import PageTransition from '../../components/PageTransition';
import { motion, AnimatePresence } from 'framer-motion';
import {Beaker, Rocket, Trees, Wrench} from 'lucide-react';
import { siteConfig } from '../../siteConfig';

import AlchemyLab from './AlchemyLab';
import DijiangModel from './DijiangModel';

export default function CreativeWorkshopClient({ posts = [], chatters = [], moments = [] }: any) {
  const [currentMode, setCurrentMode] = useState<'alchemy' | 'model'>('alchemy');

  useEffect(() => {
    if (!siteConfig.enableLevelSystem) return;

    try {
      const postsExp = posts.length * 50;
      const chattersExp = chatters.length * 20;
      const momentsExp = moments.length * 10;
      const contentExp = postsExp + chattersExp + momentsExp;

      const allActivities = [...posts, ...chatters, ...moments];
      const uniqueDays = new Set();

      allActivities.forEach(item => {
        if (item.date) {
          const dayString = new Date(item.date).toISOString().split('T')[0];
          uniqueDays.add(dayString);
        }
      });

      const checkInDays = uniqueDays.size;
      const checkInExp = checkInDays * 100;

      const totalExp = contentExp + checkInExp;

      const getExpNeededForLevel = (lvl: number) => {
        if (lvl <= 1) return 150;
        return 150 + Math.floor((2000 * (lvl - 1)) / ((lvl - 1) + 10));
      };

      let level = 1;
      let remainingExp = totalExp;
      let expNeededForNextLevel = getExpNeededForLevel(level);

      while (remainingExp >= expNeededForNextLevel) {
        remainingExp -= expNeededForNextLevel;
        level++;
        expNeededForNextLevel = getExpNeededForLevel(level);
      }

      const progressPercent = ((remainingExp / expNeededForNextLevel) * 100).toFixed(1);

      console.groupCollapsed(`🛡️ [罗德岛数据终端] 站长个人综合档案同步...`);
      console.log(`%c[当前等级] Lv.${level}`, 'color: #6366f1; font-weight: 900; font-size: 16px; text-shadow: 0 0 4px rgba(99,102,241,0.3);');
      console.log(`%c[升级进度] ${remainingExp} / ${expNeededForNextLevel} EXP (${progressPercent}%)`, 'color: #10b981; font-weight: bold;');
      console.log(`[总计累计] ${totalExp} EXP`);
      console.log(`%c[渐近公式] EXP_Next = 150 + Math.floor((2000 * (L-1)) / ((L-1) + 10)) [极限上限: 2150]`, 'color: #8b5cf6; font-style: italic;');
      console.table({
        '文章发布 (50 EXP)': { '结算数量': posts.length, '贡献经验': postsExp },
        '杂谈记录 (20 EXP)': { '结算数量': chatters.length, '贡献经验': chattersExp },
        '每日说说 (10 EXP)': { '结算数量': moments.length, '贡献经验': momentsExp },
        '日历打卡 (100 EXP)': { '活跃天数': checkInDays, '贡献经验': checkInExp },
      });
      console.groupEnd();

    } catch (error) {
      console.error("经验系统计算流走火入魔：", error);
    }
  }, [posts, chatters, moments]);

  return (
    <div className="min-h-screen relative pb-32 overflow-x-hidden">

      <PageTransition>
        <div className="w-full max-w-7xl mx-auto mt-24 px-4 sm:px-10 relative z-10 flex flex-col items-center">

          <div className="w-full flex flex-col items-center mb-16 animate-fade-in-up text-center">
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-widest mb-3 flex items-center justify-center gap-3 transition-colors duration-700">
              <Trees className="text-indigo-500" size={40} /> 灵境
            </h1>
            <p className="text-slate-600 dark:text-slate-400 font-medium tracking-wider mb-8 transition-colors duration-700">
              从神秘的记忆试管到深邃的星际巨舰，在这里封存所有的灵感与奇迹
            </p>

            <div className="flex bg-white/40 dark:bg-slate-800/40 backdrop-blur-md p-1.5 rounded-full border border-white/50 dark:border-white/10 shadow-sm relative">
              <button
                onClick={() => setCurrentMode('alchemy')}
                className={`relative px-6 py-2.5 rounded-full text-sm font-bold transition-all z-10 flex items-center gap-2 ${currentMode === 'alchemy' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <Beaker size={16} /> 记忆炼金室
              </button>
              <button
                onClick={() => setCurrentMode('model')}
                className={`relative px-6 py-2.5 rounded-full text-sm font-bold transition-all z-10 flex items-center gap-2 ${currentMode === 'model' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <Rocket size={16} /> 帝江号舰船
              </button>


              <motion.div
                layout
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="absolute top-1.5 bottom-1.5 bg-white dark:bg-slate-700 rounded-full z-0 shadow-sm border border-slate-100 dark:border-slate-600"
                style={{
                  width: 'calc(50% - 6px)',
                  left: currentMode === 'alchemy' ? '6px' : 'calc(50% + 2px)'
                }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {currentMode === 'alchemy' && (
              <AlchemyLab key="alchemy-view" posts={posts} chatters={chatters} moments={moments} />
            )}
            {currentMode === 'model' && (
              <DijiangModel key="model-view" posts={posts} chatters={chatters} moments={moments} />
            )}
          </AnimatePresence>

        </div>
      </PageTransition>

      <style jsx global>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes potion-wave { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
        @keyframes bubble-rise { 0% { transform: translateY(0) scale(1); opacity: 0; } 20% { opacity: 0.8; } 100% { transform: translateY(-40px) scale(0.5); opacity: 0; } }
      `}</style>
    </div>
  );
}