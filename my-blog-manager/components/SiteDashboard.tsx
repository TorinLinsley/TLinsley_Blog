"use client";

import { useEffect, useRef, useState } from 'react';
// 🌟 引入咱们的控制中心配置
import { siteConfig } from '../siteConfig';
import { useToast } from './ToastProvider';
import Tooltip from './Tooltip';

/** 校准间隔：10 分钟 */
const SYNC_INTERVAL_MS = 10 * 60 * 1000;

export default function SiteDashboard() {
  const [timeStr, setTimeStr] = useState('');
  const [uptimeStr, setUptimeStr] = useState('');
  /** 标准时间 − 本机时间（毫秒）；拿不到授时就一直是 0，退回本机时间 */
  const offsetRef = useRef(0);

  // 🌟 从配置中读取建站时间
  const START_DATE = new Date(siteConfig.buildDate || '2026-03-23T00:00:00').getTime();

  const { showToast } = useToast();

  /**
   * 🏷️ 点备案号 = **先把备案号复制到剪贴板**，再照常打开查询页。
   *
   * 为什么只能这么"土"：工信部那个查询页是个 SPA，网址里带不了查询条件
   * （而且它接口只允许自己的域名跨域调用、还有反爬），做不成"点一下就自动查到结果"。
   * 所以改成：帮访客把号码复制好 → 他们到打开的页面里粘贴一下就完事 ✓
   *
   * 复制的内容优先用 icpConfig.copyText（可留空），留空就是页面上显示的备案号本身。
   */
  const copyIcp = () => {
    const cfg = siteConfig.icpConfig as { name?: string; link?: string; copyText?: string } | undefined;
    const text = (cfg?.copyText || cfg?.name || '').trim();
    if (!text) return;

    const okTip = () => showToast('备案号已复制 ✓ 在新页面粘贴即可查询', 'success');
    const failTip = () => showToast(`复制失败，请手动复制：${text}`, 'warning');

    /**
     * ① 先走**同步**复制（execCommand），必须在"点击这一下、本页还聚焦"的瞬间做完。
     *
     * ⚠️ 这里踩过坑：一开始直接 await navigator.clipboard.writeText(...) —— 那个是异步的，
     *    而 <a target="_blank"> 会立刻打开新标签页，本页随即**失去焦点**，
     *    等 promise 落地时浏览器就以 "Document is not focused" 拒掉 ✗
     *    表现就是"只是跳转了网页，剪贴板里啥都没有"。
     *    所以顺序必须是：**先同步复制好，再让它跳转** ✓
     */
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
        ta.setSelectionRange(0, ta.value.length);   // iOS 上必须显式给选区
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

    /** ② 同步那条被浏览器禁掉时，再退到现代 API（异步，可能要等失焦前那一下运气） */
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(okTip).catch(failTip);
    } else {
      failTip();
    }
  };

  useEffect(() => {
    let stopped = false;

    /**
     * 跟标准时间（北京时间）对表。
     *
     * 浏览器里做不了 NTP，所以交给自己的 /api/time：由**服务端**去取标准时间
     * （毫秒级源优先，服务端还会把上游那一段网络延迟补掉），这里只补"我们到服务器"这半段往返：
     *     此刻标准时间 ≈ 服务端返回的 epochMs + 半个往返
     *     偏移量 = 此刻标准时间 − 本机现在
     * ⚠️ 连取 2 次、**挑往返最小的那一次**：偶发一次慢请求（DNS/TLS 抖一下）会把
     *    半个往返算大、偏移量偏出好几秒 —— 这正是"刷新一次快一点、慢一点"的来源。
     */
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
          /* 网络抖一下就算了 */
        }
      }

      if (samples.length) {
        samples.sort((a, b) => a.rtt - b.rtt);
        offsetRef.current = samples[0].offset; // 往返最小的那次最可信
      }
      // 一个都没取到：沿用上一次的偏移量（首次失败则退回本机时间）
    };

    const updateTime = () => {
      // 本机时间 + 偏移量 = 校准后的标准时间
      const now = new Date(Date.now() + offsetRef.current);
      // 格式化当前时间为 HH:MM:SS
      setTimeStr(now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      // 计算运行时间
      const diff = now.getTime() - START_DATE;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      setUptimeStr(`${days}天 ${hours}小时`);
    };

    void syncTime();                                            // 每次打开 / 刷新页面：先校准一次
    const syncTimer = setInterval(syncTime, SYNC_INTERVAL_MS);  // 之后每 10 分钟校准一次
    updateTime(); // 初始执行一次
    const timer = setInterval(updateTime, 1000);

    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(syncTimer);
    };
  }, [START_DATE]);

  return (
    // 横向铺满 12 列的长条矩阵
    <div className="md:col-span-12 rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden flex flex-col md:flex-row items-stretch transition-colors duration-700 h-auto md:h-20 group">

      {/* 左侧：翻页时钟特效 (使用等宽字体) */}
      <div className="bg-slate-900 dark:bg-black text-white px-8 py-4 md:py-0 flex items-center justify-center font-mono text-2xl md:text-3xl font-black tracking-widest shadow-inner relative overflow-hidden group-hover:text-indigo-400 transition-colors">
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
        {timeStr || '00:00:00'}
        {/* 模拟翻页中间的分割线 */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-black/50"></div>
      </div>

      {/* 中间与右侧：状态信息 */}
      <div className="flex-1 px-6 py-4 md:py-0 flex flex-wrap items-center justify-between gap-4 text-xs md:text-sm font-bold text-slate-600 dark:text-slate-300">

        {/* 运行时间 */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span>系统已稳定运行：<span className="text-indigo-600 dark:text-indigo-400 font-black">{uptimeStr}</span></span>
        </div>

        {/* 技术栈徽章 (🌟 动态映射 siteConfig 里的数组) */}
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

        {/* 备案信息：🌟 点一下会**自动复制备案号**，然后照常打开查询页（工信部页面得自己粘贴）
            · 复制内容 = icpConfig.copyText（留空就用显示的备案号）
            · 没配链接时就只复制、不跳转 */}
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
