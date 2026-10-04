/**
 * 🧩 Callout 的「HTML 壳」和「Markdown 引用块」之间的桥。
 *
 * 起因（线上实测的根因）：
 *   后端给的 contentHtml 里，callout 已经渲染成了
 *       <div class="callout callout-info"><div class="callout-title">…</div><div class="callout-body">…</div></div>
 *   而编辑器（ProseMirror）的 schema 里**没有 div** —— 它会把这两层 div 直接拆掉、
 *   把里面的段落/列表提到顶层。结果：
 *     · 编辑器里 callout「散架」成一堆普通段落（预览里却是个整整齐齐的框）→ 对不上；
 *     · 一保存，callout 就彻底没了（.md 里连 > [!info] 都不剩）✗
 *   所以进编辑器之前先把它还原成引用块；编辑器里 callout 本来就是
 *   「引用块 + 首段以 [!type] 开头」这个形态（CalloutDecoration 会给它套壳）。
 *
 * 预览那边反过来：编辑器导出的 HTML 里 callout 是引用块，直接丢给预览就只是个普通引用，
 * 于是又和「后端渲染的预览」长得不一样 —— 用 calloutBlockquotesToHtml 再套回 div。
 */

/** 支持的 callout 类型（和 Obsidian 一致，前端 rehypeCallout.ts 里那份图标表是同一批） */
export const CALLOUT_TYPES = [
  'note', 'info', 'tip', 'hint', 'success', 'check', 'done',
  'warning', 'caution', 'attention', 'danger', 'error', 'failure', 'bug',
  'question', 'help', 'faq', 'quote', 'cite', 'example', 'abstract', 'summary', 'todo',
];

/** 首段开头的 `[!type]` 标记（末尾的 - / + 是 Obsidian 的折叠标记） */
export const CALLOUT_MARKER = /^\s*\[!\s*([A-Za-z0-9_-]+)\s*\]\s*[-+]?/;

const kindOf = (el: Element): string => {
  const explicit = (el.getAttribute('data-callout') || '').toLowerCase();
  if (explicit) return explicit;
  const cls = (el.getAttribute('class') || '').match(/callout-([A-Za-z0-9_-]+)/);
  return cls ? cls[1].toLowerCase() : 'note';
};

/**
 * 把 HTML 里 callout 的 div 壳还原成引用块（**就地**改传进来的 DOM，不返回字符串）。
 * 只吃「.callout」这一类 div，其它内容一格都不碰。
 */
export function calloutDivsToBlockquotes(root: ParentNode): void {
  const doc = (root as Element).ownerDocument || document;
  // 嵌套的 callout 也要处理，所以循环到没有为止（每轮都从当前的 DOM 里重新找）
  for (let round = 0; round < 5; round += 1) {
    const divs = Array.from(root.querySelectorAll('div.callout'));
    if (!divs.length) return;
    divs.forEach((div) => {
      if (!div.isConnected && !root.contains(div)) return;
      const kind = kindOf(div);
      // 标题：优先取 .callout-title-text（后端和前台都是这个），退回整个标题行的文字
      const titleEl = div.querySelector('.callout-title');
      const title = (titleEl?.querySelector('.callout-title-text')?.textContent
        || titleEl?.textContent
        || '').replace(/\s+/g, ' ').trim();

      const bq = doc.createElement('blockquote');
      const first = doc.createElement('p');
      first.textContent = title ? `[!${kind}] ${title}` : `[!${kind}]`;
      bq.appendChild(first);

      const body = div.querySelector('.callout-body');
      const nodes = body ? Array.from(body.children) : Array.from(div.children).filter((c) => !c.classList.contains('callout-title'));
      nodes.forEach((child) => bq.appendChild(child));   // 搬家（child 会从原父节点上摘下来）

      div.replaceWith(bq);
    });
  }
}

/**
 * 反过来：把编辑器 HTML 里「引用块 + 首段 [!type]」的 callout 套回 div 壳，
 * 让预览和「后端渲染的预览 / 博客前台」长得一模一样（含图标）。
 * icons 由调用方传（前台那份 rehypeCallout 里的图标表，SVG 字符串）。
 */
export function calloutBlockquotesToHtml(html: string, icons: Record<string, string>, fallbackIcon: string): string {
  return html.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (whole, inner: string) => {
    const pMatch = inner.match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>/i);
    if (!pMatch) return whole;
    const firstText = pMatch[1].replace(/<[^>]+>/g, '');
    const marker = firstText.match(CALLOUT_MARKER);
    if (!marker) return whole;
    const kind = marker[1].toLowerCase();
    if (!CALLOUT_TYPES.includes(kind)) return whole;

    // 首段里去掉标记之后剩下的（标题 + 可能跟在后面的正文）
    const restHtml = pMatch[1].replace(/^\s*\[!\s*[A-Za-z0-9_-]+\s*\]\s*[-+]?\s*/, '');
    const titleLine = restHtml.split(/<br\s*\/?>/i)[0].replace(/<[^>]+>/g, '').trim() || kind;
    // 首段里标题行之后还有没有正文（<br> 后面的部分）
    const afterBr = restHtml.split(/<br\s*\/?>/i).slice(1).join('<br>').trim();
    const restBlocks = inner.slice(pMatch[0].length);
    const body = (afterBr ? `<p>${afterBr}</p>` : '') + restBlocks;

    const icon = icons[kind] || fallbackIcon;
    return `<div class="callout callout-${kind} not-prose" data-callout="${kind}">`
      + `<div class="callout-title"><span class="callout-icon">${icon}</span>`
      + `<span class="callout-title-text">${titleLine}</span></div>`
      + `<div class="callout-body">${body}</div>`
      + '</div>';
  });
}
