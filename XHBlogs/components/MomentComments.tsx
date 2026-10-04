"use client";

import Comments from './Comments';

/**
 * 💬 说说的评论区 —— 直接用全站统一的那套「游客评论」组件。
 *
 * 以前这里是单独一份 Gitalk：必须登录 GitHub 才能发、还要额外拉 Gitalk 的 JS/CSS（慢）。
 * 现在换成同一套自建评论（`/api/comments` + 本地 JSON）✓
 *   · 不用登录、不碰 GitHub ✓ 谁都能发 ✓
 *   · 评论按传入的 id 归档（调用方传的是 `/moments/<说说id>`）✓
 *   · 和文章页/关于页/灵境用的是**同一个组件**，样式与行为完全一致 ✓
 */
export default function MomentComments({ id }: { id: string }) {
  return <Comments page={id} />;
}
