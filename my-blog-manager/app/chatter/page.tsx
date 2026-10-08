import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageTransition from '../../components/PageTransition';
import ChatterBoard from './ChatterBoard';
import { siteConfig } from '../../siteConfig';

// 🌟 卡片预览也走「和杂谈详情页同一套」渲染管线（带 callout / 代码语言标记）
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkHardBreaks from '../../lib/remarkHardBreaks';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeCodeLang from '../../lib/rehypeCodeLang';
import rehypeCallout from '../../lib/rehypeCallout';
// 🩹 修「中文加粗」被 CommonMark 判非法导致星号漏出来的写法（详见 lib/repairMarkdown.ts）
import { repairMarkdown } from '../../lib/repairMarkdown';
import rehypeStringify from 'rehype-stringify';
import rehypeKatex from 'rehype-katex';
import 'highlight.js/styles/atom-one-dark.css';

// 内容会随时变化（控制台里写完就落盘），按请求实时读取，别在构建时定死 —— 和博客前台那一份保持一致
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "杂谈 | " + siteConfig.title,
  description: "日常碎片与灵感记录",
};

/**
 * 卡片里的正文预览渲染。
 *
 * 以前卡片是直接把 Markdown 原文当纯文本显示，所以 `> [!info] 标题`
 * 会原样露出一串符号（前台和控制台都一样）；
 * 现在按详情页那套管线渲染成 HTML，标注块在卡片里也能显示成带图标的框。
 * 卡片窄，所以 .chatter-preview 里给引用块/callout 留了左右内边距（见 globals.css）。
 */
async function renderChatterPreview(raw: string) {
  let content = raw.replace(/\r\n/g, '\n');
  content = content.replace(/[\u200B-\u200D\uFEFF]/g, '');
  content = content.replace(/^[ \t]+$/gm, '');
  // 修复「1.百度」这种没空格导致渲染不成列表的写法
  content = content.replace(/^(\s*\d+)\.([^ \n\d])/gm, '$1. $2');
  // 连续 3 个以上换行 → 真正的空行（照抄详情页的做法，只是不碰代码块）
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
    // @ts-ignore
    .use(rehypeHighlight, {
      detect: false, // 没写语言就保持纯文本：不猜语言、不着色
      ignoreMissing: true,
      subset: ['cpp', 'c', 'python', 'java', 'javascript', 'typescript', 'go', 'rust', 'bash', 'json', 'html', 'css', 'sql', 'xml'],
    })
    .use(rehypeKatex)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(repairMarkdown(content));

  return processed.toString();
}

export default async function ChatterPage() {
  const chattersDirectory = path.join(process.cwd(), 'chatters');
  let chatters: any[] = [];

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
        date: data.date || '1970-01-01', // 👇 核心修复：加上日期兜底防崩溃
        tags: data.tags || [],
        mood: data.mood || '',
        cover: data.cover || '',
        content: plain,                                   // 纯文本：搜索用
        contentHtml: await renderChatterPreview(plain),    // 渲染好的 HTML：卡片预览用
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
