import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageTransition from '../../components/PageTransition';
import ChatterBoard from './ChatterBoard';
import { siteConfig } from '@/siteConfig';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkHardBreaks from '../../lib/remarkHardBreaks';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import { hljsLanguages } from '../../lib/hljsLanguages';
import rehypeCodeLang from '../../lib/rehypeCodeLang';
import rehypeTaskReadonly from '../../lib/rehypeTaskReadonly';
import rehypeCallout from '../../lib/rehypeCallout';
import { repairMarkdown } from '../../lib/repairMarkdown';
import rehypeStringify from 'rehype-stringify';
import rehypeRepoCard from '../../lib/rehypeRepoCard';
import rehypeKatex from 'rehype-katex';
import 'highlight.js/styles/atom-one-dark.css';

export const revalidate = 30;


export const metadata = {
  title: "杂谈 | "+ siteConfig.title,
  description: "日常碎片与灵感记录",
};

async function renderChatterPreview(raw: string) {
  let content = raw.replace(/\r\n/g, '\n');
  content = content.replace(/[\u200B-\u200D\uFEFF]/g, '');
  content = content.replace(/^[ \t]+$/gm, '');
  content = content.replace(/^(\s*\d+)\.([^ \n\d])/gm, '$1. $2');
  const blocks = content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  content = blocks
    .map((block, index) => (index % 2 === 1 ? block : block.replace(/\n{3,}/g, (m) => '\n\n' + '<br>'.repeat(m.length - 2) + '\n\n')))
    .join('');

  const processed = await unified()
    .use(remarkParse)
    .use(remarkHardBreaks)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeCodeLang)
    .use(rehypeCallout)
    .use(rehypeTaskReadonly)
    // @ts-ignore
    .use(rehypeHighlight, {
      detect: false,
      ignoreMissing: true,
      languages: hljsLanguages,
    })
    .use(rehypeKatex)
    .use(rehypeRepoCard)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(repairMarkdown(content));

  return processed.toString();
}

export default async function ChatterPage() {
  const chattersDirectory = path.join(process.cwd(), 'chatters');
  let chatters = [];

  try {
    if (!fs.existsSync(chattersDirectory)) {
      fs.mkdirSync(chattersDirectory);
    }

    const fileNames = fs.readdirSync(chattersDirectory).filter(fileName => fileName.endsWith('.md'));

    const parsed = await Promise.all(fileNames.map(async (fileName) => {
      const slug = fileName.replace(/\.md$/, '');
      const fileContents = fs.readFileSync(path.join(chattersDirectory, fileName), 'utf8');
      const { data, content } = matter(fileContents);
      const plain = content.replace(/^#+ .*\n/m, '');

      return {
        slug,
        title: data.title || '',
        date: data.date || '未知时间',
        tags: data.tags || [],
        mood: data.mood || '',
        cover: data.cover || '',
        content: plain,
        contentHtml: await renderChatterPreview(plain),
      };
    }));

    chatters = parsed.sort((a, b) => (new Date(b.date).getTime() - new Date(a.date).getTime()));
  } catch (e) {
    console.error("读取杂谈文件失败:", e);
  }

  return (
    <div className="min-h-screen relative pb-10">
      <PageTransition>
        <ChatterBoard chatters={chatters} />
      </PageTransition>
    </div>
  );
}