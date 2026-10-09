"use client";

import { useEffect } from 'react';

/**
 * 🔗 正文（markdown 渲染出来的）里的超链接：**站内路径原地跳，其他一律新标签页** ✓
 *    —— 用户 2026-10-09 追加：/chatter/…、/resources/… 这种「域名后面一段开头」的，只在本标签页跳 ✓
 *    —— 用户 2026-10-08 明确要求："帮我把网站markdown超链接的跳转方式全部改成新建标签页"
 *
 * ⚠️ 文件名是历史原因：这个组件原来是"**站内**链接走客户端路由"（点一下 SPA 切页），
 *    现在职责正好反过来 —— **正文里的站内链接也不再原地跳了，统一开新标签页** ✓
 *    所以原来那套 `router.push` 接管已删除，别再加回来 ✗
 *    （真要恢复"站内链接原地瞬间切页"，就是把下面盖 target 那几行去掉、把 router.push 加回来 ✓）
 *
 * 做法：和 ImageZoom / TableScroll / CodeCopy / RepoCard **同一个路子 —— 只做增强、不改渲染链路** ✓
 *   正文 HTML 一个字都不动：挂载后扫一遍，给里面的 <a> 盖上 `target="_blank"` + `rel`，
 *   之后浏览器自己就会开新标签页 ✓（比 window.open 稳：不会被弹窗拦截器拦掉 ✗）
 *   正文是动态注入/切换的（切文章、切分类、说说列表重渲染），所以再挂一个
 *   MutationObserver 兜住后加进来的 ✓（节流 200ms，不是每帧都扫 ✓）
 *
 * 故意**不盖**的几种：
 *   · `#锚点`        → 页内跳转，本来就该留在原地 ✓
 *   · `mailto:` / `tel:` / `javascript:` / `data:` → 不是网页 ✓
 *   · 作者自己写了 `target` 的 → 尊重原文（比如故意 `_self`）✓
 *   · 带 `download` 的 → 那是下载，别动 ✓
 *   · 编辑器正文（`.ProseMirror` 等）→ 控制台在编辑，别碰 ✓
 */

/** 哪些容器里的链接要处理（都是渲染 markdown 的正文区） */
const LINK_SELECTOR = '.prose a[href], .resource-preview a[href], .chatter-preview a[href]';
/** 这些里面一律不碰（编辑器正文等） */
const SKIP_INSIDE = '.editor-content-area, .ProseMirror, [contenteditable="true"], [data-no-router]';

export default function InSiteLinks() {
  useEffect(() => {
    const stamp = () => {
      document.querySelectorAll<HTMLAnchorElement>(LINK_SELECTOR).forEach((a) => {
        if (a.hasAttribute('target')) return;                 // 已经盖过 / 作者自己写了 → 不动 ✓
        if (a.closest(SKIP_INSIDE)) return;                   // 编辑器正文不碰 ✓
        if (a.hasAttribute('download')) return;               // 下载链接不碰 ✓
        const raw = a.getAttribute('href') || '';
        if (!raw || raw.startsWith('#')) return;              // 页内锚点留在原地 ✓
        if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) return;
        // 🏠 站内相对路径（/chatter/… /resources/… 这种）→ **本标签页**跳转 ✓
        //    ⚠️ 必须排掉 //example.com（协议相对外链，它也以 / 开头）✗
        if (raw.startsWith('/') && !raw.startsWith('//')) return;
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
    };

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
      mo.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
