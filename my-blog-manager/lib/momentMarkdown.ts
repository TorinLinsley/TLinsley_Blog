import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkHardBreaks from './remarkHardBreaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import rehypeCallout from './rehypeCallout';
import { repairMarkdown } from './repairMarkdown';

/**
 * 📝 说说正文的 Markdown 渲染（用户 2026-10-22 要求）
 *
 * 背景：说说卡片以前是**纯文本**显示，而且靠 lib/repairMarkdown 的 stripInlineMarkdown
 *      把 markdown 标记**连符号一起删掉** ✗ —— 所以你写 `- 站外链接…`，减号被删了，
 *      看着就像"不支持 markdown" ✗
 *
 * 现在：正文按 Markdown 渲染成 HTML 再放进卡片 ✓
 *   · 有序/无序列表、加粗、行内代码、链接、引用、表格、公式都正常 ✓
 *   · 单个换行仍然换行（remark-breaks）：老的纯文本说说看着和以前一样 ✓
 *   · repairMarkdown 那套修复（连续空行、表格等）和文章页共用同一份 ✓
 *
 * ⚠️ 只给说说用：文章页还有代码高亮、仓库卡片那些额外插件，这里用最小集合就够 ✓
 */
export async function renderMomentHtml(markdown: string): Promise<string> {
  /* ⚠️ 图片**不走正文**：说说的图片一直由 front-matter 的 images 数组 + 卡片里的九宫格渲染 ✓
        正文里就算写了 `![](…)` 也去掉，免得冒出第二套图片排版，把九宫格挤乱 ✗ */
  const source = String(markdown || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .trim();
  if (!source) return '';

  const processed = await unified()
    .use(remarkParse)
    .use(remarkHardBreaks)   // 单个换行 = 真换行（老说说的样子不变）
    .use(remarkGfm)      // 表格 / 删除线 / 任务列表
    .use(remarkMath)     // $…$ 公式
    .use(remarkRehype, { allowDangerousHtml: true })  // 允许正文里的原始 HTML（颜色、下划线、上下标等）
    .use(rehypeCallout)  // > [!info] 那种引用块
    .use(rehypeKatex)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(repairMarkdown(source));

  return String(processed);
}
