"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Bot, Sparkles, Sliders, MessageSquareText, Cpu } from 'lucide-react';

export default function AICatSection({ formData, handleUpdate, pushToQueue }: any) {
  const config = formData.geminiConfig || {
    modelId: 'gemini-2.5-flash-lite',
    systemPrompt: '',
    maxOutputTokens: 150,
    temperature: 0.85
  };

  const [localPrompt, setLocalPrompt] = useState('');

  useEffect(() => {
    if (config.systemPrompt) {
      setLocalPrompt(config.systemPrompt.replace(/\\n/g, '\n'));
    }
  }, []);

  const updateConfig = (key: string, value: any) => {
    handleUpdate('geminiConfig', { ...config, [key]: value });
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const realText = e.target.value;
    setLocalPrompt(realText);

    const safeTextForBackend = realText.replace(/\n/g, '\\n');
    updateConfig('systemPrompt', safeTextForBackend);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, type: 'spring', stiffness: 100 }}
      className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-8 shadow-xl"
    >
      <div className="flex justify-between items-center mb-8 pb-6 border-b border-white/40 dark:border-slate-700/50">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3 tracking-tight">
            <Bot className="text-indigo-500" size={28} /> AI 煤球性格调度中心
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-2 flex items-center gap-1.5">
            <Sparkles size={14} className="text-indigo-400" /> 实时重塑你的专属 AI 助理灵魂
          </p>
        </div>
        <button
          onClick={() => pushToQueue('AI 小猫配置')}
          className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2 text-sm"
        >
          <Save size={16} /> 暂存至队列
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="group">
          <label className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-300 mb-3">
            <Cpu size={16} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" /> 模型核心引擎 (Model ID)
          </label>
          <input
            type="text"
            value={config.modelId}
            onChange={(e) => updateConfig('modelId', e.target.value)}
            className="w-full bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl py-3.5 px-5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium"
            placeholder="例如: gemini-2.5-flash-lite"
          />
          <p className="text-[11px] text-slate-400 mt-2 ml-1">推荐使用默认的轻量级模型，响应速度最快。</p>
        </div>

        <div className="group">
          <label className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-300 mb-3">
            <MessageSquareText size={16} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" /> 灵魂 Prompt (性格设定)
          </label>
          <textarea
            value={localPrompt}
            onChange={handlePromptChange}
            className="w-full bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl py-4 px-5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[200px] resize-y font-medium text-sm leading-relaxed custom-scrollbar"
            placeholder="输入 AI 的性格、行为模式和约束..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="group">
            <div className="flex justify-between items-center mb-3">
              <label className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-300">
                <Sliders size={16} className="text-slate-400" /> 最大回复字数 (Tokens)
              </label>
              <span className="text-xs font-black text-indigo-500 bg-indigo-500/10 px-2 py-1 rounded-md">{config.maxOutputTokens}</span>
            </div>
            <input
              type="range"
              min="50"
              max="1000"
              step="10"
              value={config.maxOutputTokens}
              onChange={(e) => updateConfig('maxOutputTokens', Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="group">
            <div className="flex justify-between items-center mb-3">
              <label className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-300">
                <Sparkles size={16} className="text-slate-400" /> 模型发散度 (Temperature)
              </label>
              <span className="text-xs font-black text-indigo-500 bg-indigo-500/10 px-2 py-1 rounded-md">{config.temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={config.temperature}
              onChange={(e) => updateConfig('temperature', Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <p className="text-[11px] text-slate-400 mt-2">数值越大，猫咪说话越随机、越具创意；数值越小越严谨。</p>
          </div>
        </div>

      </div>
    </motion.div>
  );
}