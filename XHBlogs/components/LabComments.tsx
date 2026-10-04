"use client";

import Comments from './Comments';

/**
 * 💬 灵境（炼金实验室 / 地藏模型）的评论区 —— 和全站同一套「游客评论」组件。
 *
 * 以前是单独一份 Gitalk（要登录 GitHub、还要拉它的 JS/CSS）。
 * 现在统一成自建评论 ✓ 谁都能发、不用登录 ✓
 *
 * ⚠️ pageId 可能是不带 `/` 的短标识（如 `workshop-2026-05`），
 *    这里补成 `/tree/<pageId>` 再交给评论接口 —— 接口只接受本站的绝对路径（安全）✓
 */
export default function LabComments({ pageId }: { pageId?: string }) {
  const key = pageId && pageId.trim() ? pageId.trim() : 'index';
  return <Comments page={key.startsWith('/') ? key : `/tree/${key}`} />;
}
