/**
 * 🔗 卡片的 HTML 生成（**服务端渲染和浏览器端共用同一份**，绝不写两套）。
 *
 * 为什么要共用一个字符串生成函数：
 *   · 浏览器端（components/RepoCard.tsx 的扫 DOM 补色）需要 DOM；
 *   · 前台是**服务端**渲染的，插件（lib/rehypeRepoCard.ts）要在第一屏 HTML 里就把卡片放进去，
 *     否则慢网下访客会先看到一条光秃秃的链接、过一会儿才变成卡片。
 *   两边必须是同一个长相，所以 HTML 只在这里生成一次。
 *
 * ⚠️ 所有字段都要转义：仓库简介、协议名这些来自 GitHub/Gitee，属于外部数据。
 *    owner / repo 本身在 lib/repoCard.ts 里已经用 [A-Za-z0-9._-] 校验过了，但这里一并转义。
 */

import type { RepoCardData } from './repoCard';

/* ── 小图标 ─────────────────────────────────────────────────────────── */
const ICON_STAR = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>';
const ICON_FORK = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>';
/** 协议图标：GitHub 官方同款**天平秤**（Octicon `law`），和 GitHub 仓库列表里那个一致。
 *  注意它是**实心路径**（fill），不要再加 stroke，否则会糊成一团。 */
const ICON_LICENSE = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8.75.75V2h.985c.304 0 .603.08.867.231l1.29.736c.038.022.08.033.124.033h2.234a.75.75 0 0 1 0 1.5h-.427l2.111 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.006.006-.006.005-.01.01-.045.04c-.21.176-.441.327-.686.45C14.556 10.78 13.88 11 13 11a4.498 4.498 0 0 1-2.023-.454 3.544 3.544 0 0 1-.686-.45l-.045-.04-.016-.015-.006-.006-.004-.004v-.001a.75.75 0 0 1-.154-.838L12.178 4.5h-.162c-.305 0-.604-.079-.868-.231l-1.29-.736a.245.245 0 0 0-.124-.033H8.75V13h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5V3.5h-.984a.245.245 0 0 0-.124.033l-1.289.737c-.265.15-.564.23-.869.23h-.162l2.112 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.006.006-.016.015-.045.04c-.21.176-.441.327-.686.45C4.556 10.78 3.88 11 3 11a4.498 4.498 0 0 1-2.023-.454 3.544 3.544 0 0 1-.686-.45l-.045-.04-.016-.015-.006-.006-.004-.004v-.001a.75.75 0 0 1-.154-.838L2.178 4.5H1.75a.75.75 0 0 1 0-1.5h2.234a.249.249 0 0 0 .125-.033l1.288-.737c.265-.15.564-.23.869-.23h.984V.75a.75.75 0 0 1 1.5 0Zm2.945 8.477c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L13 6.327Zm-10 0c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L3 6.327Z"/></svg>';
const ICON_REPO = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>';
const ICON_PEOPLE = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a1.5 1.5 0 0 0-1.5-1.5.75.75 0 1 1 0-1.5 3.001 3.001 0 0 1 1.25-2.356V4Z"/></svg>';
const ICON_GITHUB = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>';
/** Gitee 官方 logo（Simple Icons 的 gitee，24×24）。currentColor → 跟着主题/悬停变色 */
const ICON_GITEE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296Z"/></svg>';

/** 处理过的标记（浏览器端的扫描器靠它跳过服务端已经渲染好的卡片） */
export const CARD_MARK = 'data-repo-card';

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const stat = (icon: string, text: string) =>
  `<span class="repo-card-stat">${icon}<span>${esc(text)}</span></span>`;

/** 生成卡片 HTML。服务端插件直接把它塞进正文，浏览器端用同一个串造 DOM。
 *
 * ⚠️ 内部一律用 <span>，**不能用 <div>**：
 *    服务端这条路上卡片是插在 <p> 里的（替换掉原来那个链接），而 HTML 规范里
 *    <p> 不能包含块级元素 —— 浏览器一遇到 <div> 就自动闭合 </p>，
 *    整张卡片会被撕成"头像一段、标题一段、图标一段"（实测：前台就是这个散架的样子）。
 *    <span> 放进去合法；布局全靠 CSS 的 display，视觉上没有任何区别。
 */
export function cardHtml(d: RepoCardData): string {
  const title =
    `<span class="repo-card-title"><span class="repo-card-owner">${esc(d.owner)}</span>` +
    (d.kind === 'repo' && d.repo
      ? `<span class="repo-card-sep">/</span><span class="repo-card-repo">${esc(d.repo)}</span>`
      : '') +
    `</span>`;

  const desc = d.description ? `<span class="repo-card-desc">${esc(d.description)}</span>` : '';

  let stats = '';
  if (d.kind === 'repo') {
    stats =
      `<span class="repo-card-stats">` +
      stat(ICON_STAR, String(d.stars ?? 0)) +
      stat(ICON_FORK, String(d.forks ?? 0)) +
      stat(ICON_LICENSE, d.license || 'no-license') +
      `</span>`;
  } else if (d.repos != null || d.followers != null) {
    // Gitee 的组织接口不给这两个数，那就整行不显示（别写 0/0 骗人）
    stats =
      `<span class="repo-card-stats">` +
      stat(ICON_REPO, `${d.repos ?? 0} repos`) +
      stat(ICON_PEOPLE, `${d.followers ?? 0} followers`) +
      `</span>`;
  }

  const avatar = d.avatar
    ? `<img class="repo-card-avatar" src="${esc(d.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : `<img class="repo-card-avatar repo-card-avatar-empty" alt="" aria-hidden="true">`;

  const brand = `<span class="repo-card-brand">${d.host === 'gitee' ? ICON_GITEE : ICON_GITHUB}</span>`;

  return `<a class="repo-card" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer" ${CARD_MARK}="1">${avatar}<span class="repo-card-main">${title}${desc}${stats}</span>${brand}</a>`;
}
