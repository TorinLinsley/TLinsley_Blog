/**
 * 🔗 服务端把「独占一段」的 GitHub / Gitee 仓库或主页链接**直接渲染成卡片**。
 *
 * ── 为什么要在服务端做 ──────────────────────────────────────────
 * 只靠浏览器端补卡（components/RepoCard.tsx）的话，访客第一眼看到的是**光秃秃的链接**，
 * 等 JS 跑完、接口回来才变成卡片 —— 网慢的时候这个过程很明显。
 * 放进服务端管线里，卡片就在**第一屏 HTML** 里，没有任何"变身"过程，
 * 而且不依赖 JS（SEO、禁用 JS 的浏览器一样能看到卡片）。
 *
 * ── 和浏览器端怎么配合 ──────────────────────────────────────────
 * 两边**不冲突**，是互补：
 *   · 服务端这里只处理"抓得到"的链接，卡片带 data-repo-card 标记；
 *   · 抓不到 / 超时 / 服务端没接上这个插件的地方，浏览器端那份扫 DOM 的会补上，
 *     它看到带标记的卡片会直接跳过。
 * 卡片 HTML 两边共用 lib/repoCardHtml.ts 的同一个函数，长相必然一致。
 *
 * ⚠️ 每条链接都有**独立超时**（默认 1.2s）：GitHub/Gitee 慢或者挂着的时候，
 *    宁可这条留成普通链接（浏览器端之后会补），也绝不拖着整页渲染。
 *    命中 lib/repoCardServer.ts 那个 6 小时缓存时是瞬时的，正常情况根本碰不到超时。
 */

import { parseRepoLink } from './repoCard';
import { loadRepoCard } from './repoCardServer';
import { cardHtml } from './repoCardHtml';

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** 可以当卡片容器的块级元素（和浏览器端 isStandaloneLink 的判断保持一致） */
const BLOCKS = new Set(['p', 'li', 'div', 'td', 'blockquote']);

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value || '';
  return (node.children || []).map(textOf).join('');
}

/** 这一段是不是"只有这一个链接"（夹在句子里的行内链接不该变卡片） */
function isStandalone(node: HastNode, parent: HastNode | null): boolean {
  if (!parent || !parent.tagName || !BLOCKS.has(parent.tagName)) return false;
  const kids = parent.children || [];
  const elems = kids.filter((c) => c.type === 'element');
  if (elems.length !== 1 || elems[0] !== node) return false;
  return kids.map(textOf).join('').trim() === textOf(node).trim();
}

export default function rehypeRepoCard(options?: { perLinkMs?: number }) {
  const perLinkMs = options?.perLinkMs ?? 1200;

  return async (tree: HastNode) => {
    const jobs: { parent: HastNode; index: number; href: string }[] = [];

    const walk = (node: HastNode) => {
      const kids = node.children;
      if (!kids) return;
      kids.forEach((child, index) => {
        if (
          child.type === 'element' &&
          child.tagName === 'a' &&
          typeof child.properties?.href === 'string' &&
          isStandalone(child, node)
        ) {
          jobs.push({ parent: node, index, href: String(child.properties.href) });
          return;   // 链接里面不用再往里找
        }
        walk(child);
      });
    };
    walk(tree);

    if (!jobs.length) return;

    await Promise.all(
      jobs.map(async (job) => {
        const link = parseRepoLink(job.href);
        if (!link) return;                       // 不是仓库/主页链接：原样留着
        try {
          // 超时就当没抓到 —— 保持普通链接，浏览器端那份会补
          const data = await Promise.race([
            loadRepoCard(link.url).catch(() => null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), perLinkMs)),
          ]);
          if (!data) return;
          // 插一个 raw 节点：rehype-stringify 配 allowDangerousHtml 会原样输出
          job.parent.children![job.index] = { type: 'raw', value: cardHtml(data) };
        } catch {
          /* 单条失败绝不影响整页渲染 */
        }
      }),
    );
  };
}
