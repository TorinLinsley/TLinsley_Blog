import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkHardBreaks from './remarkHardBreaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import rehypeCallout from './rehypeCallout';
import rehypeTaskReadonly from './rehypeTaskReadonly';
import { hljsLanguages } from './hljsLanguages';
import { repairMarkdown } from './repairMarkdown';

export async function renderMomentHtml(markdown: string): Promise<string> {
  const source = String(markdown || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .trim();
  if (!source) return '';

  const processed = await unified()
    .use(remarkParse)
    .use(remarkHardBreaks)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeCallout)
  .use(rehypeTaskReadonly)
    .use(rehypeHighlight, { detect: false, ignoreMissing: true, languages: hljsLanguages })
    .use(rehypeKatex)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(repairMarkdown(source));

  return String(processed);
}