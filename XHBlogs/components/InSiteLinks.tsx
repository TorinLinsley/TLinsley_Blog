"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 🔗 正文里的「站内链接」交给 Next 的客户端路由 —— 点一下直接切页，不再整篇文档重载。
 *
 * 背景：正文是构建期/接口渲染好的 HTML（dangerouslySetInnerHTML），里面的 <a> 是普通链接，
 * Next 的 <Link> 管不到它们。点一下浏览器就整页跳转 —— 整个站点要重新加载
 * （背景图、字体、Provider、播放器…全部重来一遍，再重播页面入场动画），
 * 而左边文章树里点一篇是 Next 客户端跳转、瞬间就到 —— 两边手感差得很明显。
 * 这里把正文里的站内链接也改成 router.push（SPA 跳转）就好。
 *
 * 和 ImageZoom / TableScroll / CodeCopy 一个路子：**只做增强**，正文 HTML 一个字都不动，
 * 在 document 上做事件委托（捕获阶段，尽量早拿到）。
 *
 * 接管范围：
 *   · `.prose` —— 文章页 / 关于页正文
 *   · `.resource-preview` —— 资源分享页正文
 *     （前台资源页是服务端组件、没有"就地切换"那套，所以这里连 /resources/* 也一并接管，
 *       统一走 router.push；导航到某篇时资源页自己的 PageTransition disabled 已经关掉入场动画）
 *
 * 一律不碰：
 *   · 编辑器正文（.editor-content-area / .ProseMirror / contenteditable）
 *   · 外链（不同源）、#锚点、空 href
 *   · Ctrl/⌘/Shift/Alt + 点击、鼠标中键（用户要的是新标签页）、target="_blank"、download
 *   · 静态资源与接口：/_next、/api、/uploads、/iconify，以及 .png/.svg/.zip… 这类文件
 *     （推给路由会变成 404，而这些本来就该让浏览器自己打开或下载）
 */

/** 哪些容器里的链接要接管（正文） */
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

      e.preventDefault();
      router.push(url.pathname + url.search + url.hash);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [router]);

  return null;
}
