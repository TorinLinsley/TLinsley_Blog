"use client";

import { useEffect, useRef, useState } from 'react';
import { siteConfig } from '../siteConfig';
import { useToast } from './ToastProvider';
import Tooltip from './Tooltip';

const SYNC_INTERVAL_MS = 10 * 60 * 1000;

export default function SiteDashboard() {
  const [timeStr, setTimeStr] = useState('');
  const [uptimeStr, setUptimeStr] = useState('');
  const offsetRef = useRef(0);

  const START_DATE = new Date(siteConfig.buildDate || '2026-03-23T00:00:00').getTime();

  const { showToast } = useToast();

  const copyIcp = () => {
    const cfg = siteConfig.icpConfig as { name?: string; link?: string; copyText?: string } | undefined;
    const text = (cfg?.copyText || cfg?.name || '').trim();
    if (!text) return;

    const okTip = () => showToast('备案号已复制 ✓ 在新页面粘贴即可查询', 'success');
    const failTip = () => showToast(`复制失败，请手动复制：${text}`, 'warning');

    const syncCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    };

    if (syncCopy()) {
      okTip();
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(okTip).catch(failTip);
    } else {
      failTip();
    }
  };

  useEffect(() => {
    let stopped = false;

    const syncTime = async () => {
      const samples: { offset: number; rtt: number }[] = [];

      for (let i = 0; i < 2; i += 1) {
        const t0 = Date.now();
        try {
          const res = await fetch('/api/time', { cache: 'no-store' });
          if (!res.ok) continue;
          const data = await res.json();
          const t1 = Date.now();
          if (stopped) return;
          if (!data?.success || typeof data?.epochMs !== 'number') continue;
          samples.push({ offset: data.epochMs + (t1 - t0) / 2 - t1, rtt: t1 - t0 });
        } catch {
        }
      }

      if (samples.length) {
        samples.sort((a, b) => a.rtt - b.rtt);
        offsetRef.current = samples[0].offset;
      }
    };

    const updateTime = () => {
      const now = new Date(Date.now() + offsetRef.current);
      setTimeStr(now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      const diff = now.getTime() - START_DATE;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      setUptimeStr(`${days}天 ${hours}小时`);
    };

    void syncTime();
    const syncTimer = setInterval(syncTime, SYNC_INTERVAL_MS);
    updateTime();
    const timer = setInterval(updateTime, 1000);

    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(syncTimer);
    };
  }, [START_DATE]);

  return (
    <div className="md:col-span-12 rounded-3xl bg-white dark:bg-slate-800 border border-white/40 dark:border-white/10 shadow-xl overflow-hidden flex flex-col md:flex-row items-stretch transition-colors duration-700 h-auto md:h-20 group">

      <div className="bg-slate-900 dark:bg-black text-white px-8 py-4 md:py-0 flex items-center justify-center font-mono text-2xl md:text-3xl font-black tracking-widest shadow-inner relative overflow-hidden group-hover:text-indigo-400 transition-colors">
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
        {timeStr || '00:00:00'}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-black/50"></div>
      </div>

      <div className="flex-1 px-6 py-4 md:py-0 flex flex-wrap items-center justify-between gap-4 text-xs md:text-sm font-bold text-slate-600 dark:text-slate-300">

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span>系统已稳定运行：<span className="text-indigo-600 dark:text-indigo-400 font-black">{uptimeStr}</span></span>
        </div>

        <div className="flex gap-2">
          {siteConfig.footerBadges?.map((badge, index) => (
            <span
              key={index}
              className="px-2 py-1 bg-white/50 dark:bg-slate-700/50 rounded-md shadow-sm flex items-center gap-1 border border-white/40 dark:border-slate-600"
            >
              <svg className={`w-3.5 h-3.5 ${badge.color}`} fill="currentColor" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: badge.svg }} />
              {badge.name}
            </span>
          ))}
        </div>

        {
}
        {siteConfig.icpConfig && (siteConfig.icpConfig.name || siteConfig.icpConfig.link) && (
          <Tooltip label="点一下：复制备案号并打开查询页（粘贴即可查）">
            {siteConfig.icpConfig.link ? (
              <a
                href={siteConfig.icpConfig.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={copyIcp}
                className="hover:text-indigo-500 transition-colors border-b border-dashed border-slate-400 dark:border-slate-500 pb-0.5 cursor-pointer"
              >
                {siteConfig.icpConfig.name || siteConfig.icpConfig.link}
              </a>
            ) : (
              <button
                type="button"
                onClick={copyIcp}
                className="hover:text-indigo-500 transition-colors border-b border-dashed border-slate-400 dark:border-slate-500 pb-0.5 cursor-pointer"
              >
                {siteConfig.icpConfig.name}
              </button>
            )}
          </Tooltip>
        )}

      </div>
    </div>
  );
}