"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 🔗 正文（markdown 渲染出来的）里的超链接怎么跳：
 *
 *   · 站内相对路径（`/posts/…`、`/resources/…` 这种「域名后面一段开头」的）
 *     → **接管这次点击，走客户端路由原地切页** —— 不整页刷新、瞬间完成 ✓
 *       —— 用户 2026-10-11："为什么现在点击是网站内的超链接又不是无感刷新了…
 *                          我要那种瞬间切换完成页面的"
 *   · 其它（外链、绝对 URL、协议相对链接）→ 盖 `target="_blank"`，新标签页打开 ✓
 *       —— 用户 2026-10-08 的要求，保持不变 ✓
 *
 * 为什么站内链接必须"接管"：正文是 markdown 渲染出来的**裸 `<a>`**，不是 Next 的 `<Link>` ✗
 *   浏览器拿到 `<a href="/posts/xxx">` 只会**整页重新请求**（就是那下看得见的刷新 ✗）。
 *   所以这里在 document 上挂一个委托点击：命中站内相对路径就 `preventDefault()` + `router.push()` ✓
 *   扫描时再顺手 `router.prefetch()` —— 目标页是 ISR 的，预取命中后切过去就是**瞬间**的 ✓
 *
 * 故意**不接管**的几种：
 *   · 按着 Ctrl / Cmd / Shift / Alt，或中键 → 那是"我要开新标签页"，交给浏览器 ✓
 *   · 页内锚点 `#…`、`mailto:` / `tel:` / `javascript:` / `data:` → 不是站内路由 ✓
 *   · 作者自己写了 `target` 的 → 尊重原文 ✓
 *   · 带 `download` 的 → 那是下载，别动 ✓
 *   · 编辑器正文（`.ProseMirror` / `.editor-content-area`）→ 控制台在编辑，别碰 ✓
 *   · `//example.com` 这种协议相对外链（也以 / 开头）✗
 *
 * 做法沿用原样：只做增强、不改渲染链路 —— 正文 HTML 一个字都不动 ✓
 * 正文会动态注入/切换（切文章、切分类、说说列表重渲染），所以再挂一个
 * MutationObserver 兜住后加进来的 ✓（节流 200ms，不是每帧都扫 ✓）
 */

/** 哪些容器里的链接要处理（都是渲染 markdown 的正文区） */
const LINK_SELECTOR = '.prose a[href], .resource-preview a[href], .chatter-preview a[href]';
/** 这些里面一律不碰（编辑器正文等） */
const SKIP_INSIDE = '.editor-content-area, .ProseMirror, [contenteditable="true"], [data-no-router]';

/** 站内相对路径？（`/posts/…` ✓、`//cdn.example.com/x` ✗、`https://…` ✗） */
const isInSitePath = (raw: string) => raw.startsWith('/') && !raw.startsWith('//');

export default function InSiteLinks() {
  const router = useRouter();

  useEffect(() => {
    /* ── ① 扫描正文：站内路径预取，其余盖新标签页 ── */
    const stamp = () => {
      document.querySelectorAll<HTMLAnchorElement>(LINK_SELECTOR).forEach((a) => {
        if (a.closest(SKIP_INSIDE)) return;                   // 编辑器正文不碰 ✓
        if (a.hasAttribute('download')) return;               // 下载链接不碰 ✓
        if (a.hasAttribute('target')) return;                 // 已经盖过 / 作者自己写了 → 不动 ✓
        const raw = a.getAttribute('href') || '';
        if (!raw || raw.startsWith('#')) return;              // 页内锚点留在原地 ✓
        if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) return;
        if (isInSitePath(raw)) {
          // 🏠 站内相对路径：预取一次 → 点下去瞬间切页 ✓（点击由下面的 onClick 接管）
          router.prefetch(raw);
          return;
        }
        a.setAttribute('target', '_blank');                   // 🌐 其余：新标签页 ✓
        a.setAttribute('rel', 'noopener noreferrer');
      });
    };

    /* ── ② 接管点击：站内相对路径改走客户端路由（无感刷新） ── */
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;  // 想开新标签页 → 交给浏览器 ✓
      const target = e.target as Element | null;
      const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || !a.matches(LINK_SELECTOR)) return;                   // 只管正文区的链接 ✓
      if (a.closest(SKIP_INSIDE)) return;
      if (a.hasAttribute('download') || a.hasAttribute('target')) return;
      const raw = a.getAttribute('href') || '';
      if (!isInSitePath(raw)) return;
      e.preventDefault();
      router.push(raw);
    };
    document.addEventListener('click', onClick);

    // 先扫一遍（首屏 SSR 出来的正文就在 DOM 里了）
    stamp();

    // 之后再变了就补扫（节流：内容更新没那么频繁，没必要每帧扫）
    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => { timer = null; stamp(); }, 200);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('click', onClick);
      mo.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [router]);

  return null;
}
