"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 🔗 正文里的「站内链接」交给 Next 的客户端路由 —— 点一下直接切页，不再整篇文档重载。
 *
 * 背景：正文是构建期/接口渲染好的 HTML（dangerouslySetInnerHTML），里面的 <a> 是普通链接，
 * Next 的 <Link> 管不到它们。点一下浏览器就整页跳转 —— 整个控制台要从头 Boot
 * （重新拉 /backend_config.json、重建所有 Provider、再重播一遍页面入场动画），
 * 看起来就像"刷新进来 / 首次进来"。这里把它们改成 router.push（SPA 跳转）就好。
 *
 * 和 ImageZoom / TableScroll 一个路子：**只做增强**，正文 HTML 一个字都不动，
 * 在 document 上做事件委托（捕获阶段，尽量早拿到）。
 *
 * 接管范围：
 *   · `.prose` —— 文章页 / 关于页正文
 *   · `.resource-preview` —— 资源分享页正文，但**同源 /resources 的链接要让开**：
 *     那一页自己会把它们就地 openArticle()（连路由跳转都不用，和左边列表点文章完全一样）；
 *     这里要是抢过来，反而会变成"整页重挂 + 重跑取端口/拉目录/读文章" ✗
 *
 * 一律不碰：
 *   · 编辑器正文（.editor-content-area / .ProseMirror / contenteditable）
 *   · 外链（不同源）、#锚点、空 href
 *   · Ctrl/⌘/Shift/Alt + 点击、鼠标中键（用户要的是新标签页）、target="_blank"、download
 *   · 静态资源与接口：/_next、/api、/uploads、/iconify，以及 .png/.svg/.zip… 这类文件
 *     （推给路由会变成 404，而这些本来就该让浏览器自己打开或下载）
 */

/** 哪些容器里的链接要接管（正文；资源分享页正文单独再判一次） */
const LINK_SELECTOR = '.prose, .resource-preview';
/** 这些里面一律不碰（编辑器正文等） */
const SKIP_INSIDE = '.editor-content-area, .ProseMirror, [contenteditable="true"], [data-no-router]';
/** Next 内部 / 后端接口 / 静态资源目录：不推路由 */
const SKIP_PREFIX = /^\/(_next|api|uploads|iconify)(\/|$)/;
/**
 * 带这些后缀的基本都是"文件"而不是"页面"，交给浏览器自己打开/下载。
 * ⚠️ 故意**不含 .md** —— 资源分享的文章路径就是 `xxx/工具.md`，那是页面（要推路由的）。
 */
const FILE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg|css|js|mjs|json|txt|pdf|zip|rar|7z|gz|tar|mp3|mp4|webm|wav|woff2?|ttf|otf|eot|xml|csv|xlsx?|apk|exe)([?#]|$)/i;
/** 资源分享页自己的地盘：/resources/某篇文章 的站内链接留给那一页就地打开（连路由跳转都省了） */
const RESOURCE_PATH = /^\/resources\/.+/;

export default function InSiteLinks() {
  const router = useRouter();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // 别人已经处理过这一下了（比如 ImageZoom 吞掉的图片点击）就不重复接管
      if (e.defaultPrevented) return;
      // 只认左键单击；按了修饰键 / 中键 = 用户想要新标签页，别抢
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const el = e.target as HTMLElement | null;
      const anchor = el?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (!anchor.closest(LINK_SELECTOR)) return;   // 只管正文里的链接
      if (anchor.closest(SKIP_INSIDE)) return;      // 编辑器正文不碰
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const raw = anchor.getAttribute('href') || '';
      if (!raw || raw.startsWith('#')) return;      // 锚点：浏览器自己跳，本来就是瞬间的

      let url: URL;
      try {
        url = new URL(raw, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;        // 外链：交给浏览器 / 系统
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (SKIP_PREFIX.test(url.pathname)) return;
      if (FILE_EXT.test(url.pathname)) return;

      // 资源分享页正文里的 /resources 链接：让给那一页的 openArticle（比路由跳转更"无感"）
      if (anchor.closest('.resource-preview') && RESOURCE_PATH.test(url.pathname)) return;

      e.preventDefault();
      router.push(url.pathname + url.search + url.hash);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [router]);

  return null;
}
