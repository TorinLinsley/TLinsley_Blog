"use client";


import { useEffect } from 'react';
import { parseRepoLink, type RepoCardData } from '../lib/repoCard';
import { cardHtml, CARD_MARK } from '../lib/repoCardHtml';

const IN_CONTENT = '.prose a[href], .resource-preview a[href], .chatter-preview a[href]';
const SKIP_INSIDE = '.editor-content-area, [data-no-repo-card]';
const MARK = CARD_MARK;

const inflight = new Map<string, Promise<RepoCardData | null>>();

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

export function buildCard(d: RepoCardData): HTMLAnchorElement {
  const box = document.createElement('div');
  box.innerHTML = cardHtml(d);
  return box.firstElementChild as HTMLAnchorElement;
}

function isStandaloneLink(a: HTMLAnchorElement): boolean {
  const p = a.parentElement;
  if (!p) return false;
  if (!['P', 'LI', 'DIV', 'TD', 'BLOCKQUOTE'].includes(p.tagName)) return false;
  if ((p.textContent || '').trim() !== (a.textContent || '').trim()) return false;
  return [...p.children].every((el) => el === a);
}

async function enhance(a: HTMLAnchorElement) {
  if (a.hasAttribute(MARK)) return;
  if (a.closest(SKIP_INSIDE)) return;
  a.setAttribute(MARK, '1');

  const link = parseRepoLink(a.getAttribute('href') || '');
  if (!link) return;
  if (!isStandaloneLink(a)) return;

  const cached = dataCache.get(link.url);
  if (cached) {
    if (a.isConnected) a.replaceWith(buildCard(cached));
    return;
  }

  const data = await fetchCard(link.url);
  if (!data || !a.isConnected) return;
  a.replaceWith(buildCard(data));
}

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
  /* 🖱️ 悬停效果**只给真的有鼠标的设备**（用户 2026-10-22 要求，和 globals.css 同一套规矩）
     ⚠️ 手机/平板没有 hover ✗ 这里若还给 :hover 样式，手指点一下卡片就会"卡"在紫色悬停态 ✗
     ⚠️ 桌面悬停时仍然要重申 border-radius（站内老规则会把它改成接近直角，实测踩过）*/
  @media (hover: hover) and (pointer: fine) {
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
    @media (hover: hover) and (pointer: fine) {
      :is(.prose, .resource-preview, .chatter-preview, [data-repo-card-scope]) .repo-card:hover { border-radius: 12px !important; }
    }
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

    const onMutate = () => {
      if (sweeping) return;
      sweep();
    };

    sweep();
    const observer = new MutationObserver(onMutate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => { observer.disconnect(); };
  }, []);

  return <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: CARD_STYLE }} />;
}