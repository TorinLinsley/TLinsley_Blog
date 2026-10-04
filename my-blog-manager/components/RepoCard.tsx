"use client";

/**
 * 🔗 把「独占一段」的 GitHub / Gitee 仓库或主页链接，渲染成卡片。
 *
 * 为什么走「挂一个客户端组件 + 自己扫 DOM」这条路（和 CodeCopy 同一个套路）：
 *   前台的文章正文是**服务端组件**用 dangerouslySetInnerHTML 注入的，
 *   控制台预览则是把后端吐的 contentHtml 注入 —— 两边的渲染链路完全不同。
 *   在这条链路之外扫一遍 DOM，就只有这一份实现，不用去改任何一个页面。
 *   挂载点也只需要一行：app/layout.tsx 里紧跟 <CodeCopy />。
 *
 * 认哪些链接、哪些不认：见 lib/repoCard.ts（只认「用户」和「用户/仓库」，
 * issue/blob/releases 这些一律保持普通链接）。
 *
 * ⚠️ 只在正文容器里生效（.prose / .resource-preview / .chatter-preview），
 *    而且要求**整段就只有这一个链接** —— 免得把导航、页脚、正文中间的行内链接
 *    也变成大卡片。
 * ⚠️ 编辑器（.editor-content-area）这一轮不碰：那边要走 ProseMirror 的 NodeView，
 *    单独一轮做。
 */

import { useEffect } from 'react';
import { parseRepoLink, type RepoCardData } from '../lib/repoCard';
import { cardHtml, CARD_MARK } from '../lib/repoCardHtml';

/**
 * 只在正文容器里找链接（导航/页脚不碰）。
 * ⚠️ 这个常量必须是**完整选择器列表**，别写成 `容器列表 + ' a[href]'` 再拼 ——
 *    那样 `a[href]` 只会挂在最后一个容器上，前面几个退化成匹配容器本身
 *    （症状：永远只扫到容器元素、卡片一张都不出，实测踩过）。
 */
const IN_CONTENT = '.prose a[href], .resource-preview a[href], .chatter-preview a[href]';
/** 这些里面一律不碰 */
const SKIP_INSIDE = '.editor-content-area, [data-no-repo-card]';
/**
 * 处理过的打个标记，别重复处理。
 * ⚠️ 用**共用常量**（lib/repoCardHtml.ts）：服务端渲染出来的卡片也带这个属性，
 *    浏览器端扫到就跳过，不会把已经渲染好的卡片再换一次。
 */
const MARK = CARD_MARK;

/* ── 数据抓取（同一个链接只请求一次）。导出是给编辑器的「浮层卡片」复用 ────── */
const inflight = new Map<string, Promise<RepoCardData | null>>();

/**
 * 已经拿到的数据（成功才存）。
 *
 * 存在的意义**不是**省一次请求，而是**重渲染时能同步把卡片补回去**：
 * 页面上任何一次 React 重渲染（比如右键弹出上下文菜单）都会把 previewHtml 整块重设，
 * 我们打的卡片会被换回原始链接。如果这时还走 await 再取数据，就要**跨一帧**才能补回来，
 * 眼睛看到的就是"卡片闪了一下"（实测）。命中这个缓存就同步 replaceWith，
 * 整个过程在同一个任务内结束，浏览器根本来不及画中间那一帧。
 */
const dataCache = new Map<string, RepoCardData>();

export function fetchCard(url: string): Promise<RepoCardData | null> {
  const hit = dataCache.get(url);
  if (hit) return Promise.resolve(hit);

  let p = inflight.get(url);
  if (!p) {
    p = fetch(`/api/repo-card?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const data = j && j.ok ? (j as RepoCardData) : null;
        if (data) dataCache.set(url, data);
        return data;
      })
      .catch(() => null);
    inflight.set(url, p);
  }
  return p;
}

/**
 * 造卡片 DOM。导出给编辑器的浮层复用 —— 读态和编态**必须是同一个长相**。
 *
 * ⚠️ 这里刻意**不再手写一遍结构**：直接解析服务端同款的那份 HTML（lib/repoCardHtml.ts）。
 *    否则"服务端渲染的卡片"和"浏览器补的卡片"迟早会长得不一样。
 */
export function buildCard(d: RepoCardData): HTMLAnchorElement {
  const box = document.createElement('div');
  box.innerHTML = cardHtml(d);
  return box.firstElementChild as HTMLAnchorElement;
}

/** 整段就只有这一个链接吗（是的话才值得变成卡片） */
function isStandaloneLink(a: HTMLAnchorElement): boolean {
  const p = a.parentElement;
  if (!p) return false;
  if (!['P', 'LI', 'DIV', 'TD', 'BLOCKQUOTE'].includes(p.tagName)) return false;
  if ((p.textContent || '').trim() !== (a.textContent || '').trim()) return false;
  // 段里不能还夹着别的元素（图标、图片…）
  return [...p.children].every((el) => el === a);
}

async function enhance(a: HTMLAnchorElement) {
  if (a.hasAttribute(MARK)) return;
  if (a.closest(SKIP_INSIDE)) return;
  a.setAttribute(MARK, '1');                       // 先占位，避免并发重复处理

  const link = parseRepoLink(a.getAttribute('href') || '');
  if (!link) return;
  if (!isStandaloneLink(a)) return;

  // ⚡ 数据已在手上 → **同步**换卡：重渲染把卡片冲掉之后，这一步在同一个任务里补回来，
  //    不会跨帧，所以看不到闪（右键那一下就是这么闪的）。
  const cached = dataCache.get(link.url);
  if (cached) {
    if (a.isConnected) a.replaceWith(buildCard(cached));
    return;
  }

  const data = await fetchCard(link.url);
  if (!data || !a.isConnected) return;             // 抓不到就保持普通链接
  a.replaceWith(buildCard(data));
}

/** 卡片样式。导出给编辑器的浮层复用（读态/编态同一套配色和圆角） */
export const CARD_STYLE = `
  /* ⚠️ 选择器必须带上作用域前缀、关键属性必须 !important ——
     ① 站内原本就有 .resource-preview a { color: … !important; border-bottom: … !important }
        这类规则，光写 .repo-card 会被它盖掉（实测：浅色下卡片文字变成靛蓝、还多出一条虚线底边）。
     ② [data-repo-card-scope] 是给**编辑器浮层**用的：那张卡片挂在 body 下（在编辑器外面，
        免得被 ProseMirror 当成文档内容），不在 .prose/.resource-preview 里，所以要单独给个作用域。 */
  :is(.prose, .resource-preview, .chatter-preview, [data-repo-card-scope]) .repo-card {
    display: flex !important; align-items: flex-start; gap: 14px;
    margin: 1.1rem 0 !important; padding: 14px 18px !important;
    border-radius: 14px !important;
    /* 🪟 半透明毛玻璃，和站内面板同一套观感（bg-white/30 · dark:bg-slate-800/40 · backdrop-blur）——
       纯实心白/黑在站内这种玻璃背景上太"硬"，看着突兀。 */
    background: rgba(255, 255, 255, 0.55) !important;
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    backdrop-filter: blur(18px) saturate(140%);
    color: #0f172a !important;
    border: 1px solid rgba(255, 255, 255, 0.62) !important;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
    text-decoration: none !important;
    transition: color .2s ease, border-color .2s ease, background-color .2s ease, box-shadow .2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  [data-repo-card-scope] .repo-card { margin: 0 !important; cursor: pointer; }
  :is(.prose, .resource-preview, .chatter-preview, [data-repo-card-scope]) .repo-card * { text-decoration: none !important; }
  /* 深色 = 玻璃黑（不是纯黑），浅色 = 玻璃白（不是纯白） */
  .dark :is(.prose, .resource-preview, .chatter-preview, [data-repo-card-scope]) .repo-card {
    background: rgba(30, 41, 59, 0.55) !important; color: #ffffff !important;
    border-color: rgba(255, 255, 255, 0.14) !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }
  /* 悬停：底色换成「淡淡的紫」，文字同时转紫。
     ⚠️ 这里必须**重申一遍 border-radius**：站内原本有
        .resource-preview a:hover { … border-radius: 0.2rem !important; } 这条，
        不重申的话鼠标一放上去卡片圆角就被改成接近直角（实测踩过）。 */
  :is(.prose, .resource-preview, .chatter-preview, [data-repo-card-scope]) .repo-card:hover {
    background: rgba(124, 58, 237, 0.13) !important; color: #6d28d9 !important;
    border-color: rgba(124, 58, 237, 0.45) !important;
    border-radius: 14px !important;
  }
  .dark :is(.prose, .resource-preview, .chatter-preview, [data-repo-card-scope]) .repo-card:hover {
    background: rgba(124, 58, 237, 0.3) !important; color: #c4b5fd !important;
    border-color: rgba(167, 139, 250, 0.5) !important;
    border-radius: 14px !important;
  }

  .repo-card-avatar {
    width: 38px; height: 38px; border-radius: 50%; flex: 0 0 auto;
    object-fit: cover; background: rgba(148, 163, 184, 0.25);
  }
  .repo-card-avatar-empty { visibility: hidden; }

  .repo-card-main { flex: 1 1 auto; min-width: 0; }
  .repo-card-title {
    display: flex; align-items: baseline; gap: .3rem;
    font-weight: 800; font-size: .95rem; line-height: 1.35; min-width: 0;
  }
  .repo-card-owner, .repo-card-repo { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .repo-card-sep { flex: 0 0 auto; opacity: .5; }
  .repo-card-desc {
    margin-top: .3rem; font-size: .82rem; line-height: 1.5; opacity: .72;
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .repo-card-stats { display: flex; flex-wrap: wrap; align-items: center; gap: .8rem; margin-top: .55rem; font-size: .75rem; opacity: .8; }
  .repo-card-stat { display: inline-flex; align-items: center; gap: .3rem; white-space: nowrap; }

  .repo-card-brand { flex: 0 0 auto; display: inline-flex; align-items: center; opacity: .9; }

  /* 📱 手机：卡片小一圈，用户名/仓库名过长就省略号，一行放得下 */
  @media (max-width: 640px) {
    :is(.prose, .resource-preview, .chatter-preview, [data-repo-card-scope]) .repo-card { gap: 10px; padding: 11px 12px !important; border-radius: 12px !important; margin: .9rem 0 !important; }
    :is(.prose, .resource-preview, .chatter-preview, [data-repo-card-scope]) .repo-card:hover { border-radius: 12px !important; }
    [data-repo-card-scope] .repo-card { margin: 0 !important; }
    .repo-card-avatar { width: 30px; height: 30px; }
    .repo-card-title { font-size: .86rem; }
    .repo-card-desc { font-size: .76rem; -webkit-line-clamp: 2; }
    .repo-card-stats { font-size: .68rem; gap: .55rem; }
    .repo-card-brand svg { width: 17px; height: 17px; }
  }
`;

export default function RepoCard() {
  useEffect(() => {
    let sweeping = false;

    const sweep = () => {
      sweeping = true;
      try {
        document.querySelectorAll<HTMLAnchorElement>(IN_CONTENT).forEach((a) => { void enhance(a); });
      } finally {
        sweeping = false;
      }
    };

    /**
     * ⚠️ 必须**同步**扫，不能 setTimeout / rAF 去抖：
     *    页面上任何一次 React 重渲染（控制台资源列表上右键弹菜单就是）都会把 previewHtml
     *    整块重设一遍，我们打完的卡片会被换回原始链接。如果这时去抖 80ms 才补回来，
     *    中间会画好几帧"光秃秃的链接" —— 眼睛看到的就是「卡片闪了一下」（实测确认）。
     *    同步扫发生在 MutationObserver 的微任务里，和 React 那次提交在同一个任务内，
     *    浏览器根本来不及画中间那一帧。
     *    一遍扫描很便宜：带标记的链接直接 return；我们自己的改动不会再次触发扫描（没有循环）。
     */
    const onMutate = () => {
      if (sweeping) return;   // 防止自己的改动递归
      sweep();
    };

    sweep();
    const observer = new MutationObserver(onMutate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => { observer.disconnect(); };
  }, []);

  return <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: CARD_STYLE }} />;
}
