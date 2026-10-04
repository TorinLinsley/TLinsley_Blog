"use client";

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import 'gitalk/dist/gitalk.css';
import Gitalk from 'gitalk';
import { siteConfig } from '../siteConfig';

/**
 * 🅖 「GitHub 登录发表」发布框。
 *
 * ⚠️ 这里**只保留发布框，Gitalk 自带的评论列表整个藏掉** ✓
 *    为什么：列表必须只有一份、两种发布方式长得一样（外层 `Comments.tsx` 渲染的那份 ✓）——
 *    如果留着 Gitalk 自己的列表，就成了"GitHub 方式一套样式、游客方式另一套" ✗
 *
 * · 登录换 token 走我们自己的同源代理 `/api/github`（绕开跨域/第三方拦截）✓
 * · issue 标识沿用页面 pathname 截断到 49 字符（和以前一样，老评论不会丢）✓
 * · 发完之后回调外层刷新列表（Gitalk 是自己发请求的，我们拿不到它的结果 ✗ 只能等几秒再看 ✓）
 */
export default function GitalkBox({
  page,
  onPosted,
}: {
  page?: string;
  /** GitHub 那边发成功后 → 外层重新拉一次列表 ✓ */
  onPosted?: () => void;
} = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const postedRef = useRef(onPosted);
  postedRef.current = onPosted;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = '';

    const id = ((page || pathname || '/').replace(/\/$/, '') || '/').substring(0, 49);

    const gitalk = new Gitalk({
      clientID: siteConfig.gitalkConfig.clientID,
      clientSecret: siteConfig.gitalkConfig.clientSecret,
      repo: siteConfig.gitalkConfig.repo,
      owner: siteConfig.gitalkConfig.owner,
      admin: siteConfig.gitalkConfig.admin,
      proxy: '/api/github',
      id,
      distractionFreeMode: false,
    });

    gitalk.render(el);

    /*
     * 🔄 点「提交」之后 Gitalk 自己跟 GitHub 通信，成功与否它不告诉我们 ✗
     *    所以这里盯着那个按钮：点过就在几秒后重新拉一次列表（多试几次，早晚刷出来 ✓）
     *
     * ⚠️ 按钮类名必须是 `.gt-btn-public` —— Gitalk 1.8 里那个「发表」按钮就是它
     *    （node_modules/gitalk/src/gitalk.jsx: `className="gt-btn-public"` → handleCommentCreate）✓
     *    这里以前写的是 `.gt-btn-issue`，而 Gitalk 里**根本没有这个类名**（整个 dist 里 0 次命中）
     *    ⇒ 监听从来没命中过：用 GitHub 方式发完评论，列表死活不刷新，得手动 F5 才看得到 ✗
     *    （游客那条是发完直接把新评论插进列表，不走这里，所以一直是好的 ✓）
     *    `.gt-btn-issue` 留在后面只是防旧版本/改过类名的主题，命中不到也无害 ✓
     */
    const timers: number[] = [];
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest('.gt-btn-public, .gt-btn-issue')) return;
      [2500, 5000, 9000].forEach((ms) =>
        timers.push(window.setTimeout(() => postedRef.current?.(), ms))
      );
    };
    el.addEventListener('click', onClick);

    // 擦掉地址栏里 OAuth 回调带的 code，避免二次登录失败
    const url = new URL(window.location.href);
    if (url.searchParams.has('code')) {
      url.searchParams.delete('code');
      window.history.replaceState({}, document.title, url.toString());
    }

    return () => {
      el.removeEventListener('click', onClick);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [page, pathname]);

  return (
    <div className="relative z-10 custom-gitalk-composer pt-2">
      <div ref={containerRef} />

      {/* 🎨 Gitalk 的原生白底样式改成站点这套毛玻璃风格（和游客那个发布框观感一致） */}
      <style jsx global>{`
        /* 🚫 藏掉 Gitalk 自带的列表和条数（列表统一由外层渲染 ✓） */
        .custom-gitalk-composer .gt-container .gt-comments,
        .custom-gitalk-composer .gt-container .gt-counts {
          display: none !important;
        }

        .custom-gitalk-composer .gt-container .gt-header-textarea {
          background: rgba(255, 255, 255, 0.1) !important;
          backdrop-filter: blur(12px) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          border-radius: 16px !important;
          color: inherit !important;
          transition: all 0.3s ease;
        }
        .custom-gitalk-composer .gt-container .gt-header-textarea:focus {
          background: rgba(255, 255, 255, 0.2) !important;
          border-color: #6366f1 !important;
          box-shadow: 0 0 15px rgba(99, 102, 241, 0.3) !important;
        }
        .custom-gitalk-composer .gt-container .gt-header-preview {
          background: rgba(255, 255, 255, 0.1) !important;
          backdrop-filter: blur(12px) !important;
          border-radius: 16px !important;
        }
        .custom-gitalk-composer .gt-container .gt-btn {
          background: #6366f1 !important;
          border: none !important;
          border-radius: 12px !important;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4) !important;
          transition: transform 0.2s, box-shadow 0.2s;
          color: white !important;
        }
        .custom-gitalk-composer .gt-container .gt-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6) !important;
        }
        .custom-gitalk-composer .gt-container .gt-comment-content {
          background: rgba(255, 255, 255, 0.05) !important;
          backdrop-filter: blur(8px) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 16px !important;
        }
        .custom-gitalk-composer .gt-container .gt-avatar {
          border-radius: 50% !important;
          overflow: hidden;
        }
        .custom-gitalk-composer .gt-container .gt-comment-body {
          color: inherit !important;
        }
        .custom-gitalk-composer .gt-container a {
          color: #6366f1 !important;
        }

        /* ── 文字与卡片颜色跟随主题：浅色=深灰字/白玻璃，深色=浅字/暗玻璃 ── */
        .custom-gitalk-composer .gt-container {
          color: #334155 !important;            /* slate-700 */
        }
        .custom-gitalk-composer .gt-container .gt-comment-content,
        .custom-gitalk-composer .gt-container .gt-header-preview {
          background: rgba(255, 255, 255, 0.55) !important;
          border-color: rgba(148, 163, 184, 0.25) !important;
        }
        .custom-gitalk-composer .gt-container .gt-header-textarea {
          background: rgba(255, 255, 255, 0.6) !important;
          border-color: rgba(148, 163, 184, 0.35) !important;
          color: #334155 !important;
        }
        .custom-gitalk-composer .gt-container .gt-comment-body,
        .custom-gitalk-composer .gt-container .gt-comment-username,
        .custom-gitalk-composer .gt-container .gt-issues,
        .custom-gitalk-composer .gt-container .gt-header-controls-tip,
        .custom-gitalk-composer .gt-container .gt-comment-date,
        .custom-gitalk-composer .gt-container .gt-comment-like,
        .custom-gitalk-composer .gt-container .gt-comment-edit,
        .custom-gitalk-composer .gt-container .gt-comment-reply,
        .custom-gitalk-composer .gt-container .gt-counts,
        .custom-gitalk-composer .gt-container .gt-user {
          color: inherit !important;
        }

        .dark .custom-gitalk-composer .gt-container {
          color: #e2e8f0 !important;            /* slate-200 */
        }
        .dark .custom-gitalk-composer .gt-container .gt-comment-content,
        .dark .custom-gitalk-composer .gt-container .gt-header-preview {
          background: rgba(255, 255, 255, 0.06) !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
        }
        .dark .custom-gitalk-composer .gt-container .gt-header-textarea {
          background: rgba(255, 255, 255, 0.08) !important;
          border-color: rgba(255, 255, 255, 0.16) !important;
          color: #e2e8f0 !important;
        }
        .dark .custom-gitalk-composer .gt-container .gt-comment-body,
        .dark .custom-gitalk-composer .gt-container .gt-comment-username,
        .dark .custom-gitalk-composer .gt-container .gt-issues {
          color: #cbd5e1 !important;            /* slate-300 */
        }
        .dark .custom-gitalk-composer .gt-container .gt-comment-date,
        .dark .custom-gitalk-composer .gt-container .gt-header-controls-tip,
        .dark .custom-gitalk-composer .gt-container .gt-counts {
          color: #94a3b8 !important;            /* slate-400 */
        }
      `}</style>
    </div>
  );
}
