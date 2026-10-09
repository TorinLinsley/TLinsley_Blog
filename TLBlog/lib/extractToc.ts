/**
 * 📑 从 Markdown 正文里抽大纲条目。
 *
 * 博客前台的「归档文章 /posts」和「杂谈 /chatter」，以及控制台里对应的那两个页面，
 * 共用这一份实现 —— 四处必须完全一致，要改就改这里，一处生效。
 *
 * ⚠️ 必须**跳过代码块**。
 *    代码围栏里行首的 `#` 是注释，不是标题：
 *        ```bash
 *        # 在构建产物里搜一下，这段 CSS 究竟在不在
 *        grep -rl "@supports not" ...
 *        ```
 *    早先那版全文正则（/^(#{1,6})\s+(.+)$/gm）会把这种行当成一级标题塞进大纲 ——
 *    大纲里凭空多出几条条目，后面标题的序号层级也会被带歪。
 *    杂谈那篇讲毛玻璃的文章正好有这么一段 bash，所以这里按行扫、进出围栏都记着。
 */
export type TocItem = {
  level: number;
  text: string;
  /** 兜底 id；前端拿到真实 DOM 后会按 ClientTOC / ResourceToc 自己那套 getSafeId 重算 */
  id: string;
};

export function extractToc(content: string): TocItem[] {
  const toc: TocItem[] = [];
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');

  // 当前所处的代码围栏符号（` 或 ~）；null 表示在正文里
  let fence: string | null = null;

  for (const line of lines) {
    // 围栏行：``` 或 ~~~，允许前面有缩进
    const fenceHit = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceHit) {
      const marker = fenceHit[1][0];
      if (fence === null) fence = marker;          // 进代码块
      else if (fence === marker) fence = null;     // 出代码块（另一种围栏符号在块内不配对）
      continue;
    }
    if (fence !== null) continue;                  // 代码块内部一律不认标题

    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;

    // 行尾的 # 是「闭合式 ATX 标题」（## 标题 ##）的收尾符号，不属于标题文字
    const text = m[2].replace(/\s+#+\s*$/, '').trim();
    if (!text) continue;

    toc.push({
      level: m[1].length,
      text,
      id: text.toLowerCase().replace(/\s+/g, '-'),
    });
  }

  return toc;
}
