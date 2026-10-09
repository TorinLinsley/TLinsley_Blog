import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeCodeLang from '../../../lib/rehypeCodeLang';
import rehypeCallout from '../../../lib/rehypeCallout';
// 🩹 修「中文加粗」被 CommonMark 判非法导致星号漏出来的写法（详见 lib/repairMarkdown.ts）
import { repairMarkdown } from '../../../lib/repairMarkdown';
import rehypeStringify from 'rehype-stringify';
import rehypeRepoCard from '../../../lib/rehypeRepoCard';
import remarkMath from 'remark-math';
import remarkHardBreaks from '../../../lib/remarkHardBreaks';
import rehypeKatex from 'rehype-katex';

import 'highlight.js/styles/atom-one-dark.css';

import PageTransition from '../../../components/PageTransition';
import ResourceTreeView, { ResourceNode } from '../../../components/ResourceTreeView';
import ResourceToc from '../../../components/ResourceToc';
import ResourcePanels from '../../../components/ResourcePanels';
import { siteConfig } from '../../../siteConfig';

// 🏷️ 标签页标题：和其它非首页界面一个写法（友链 / 项目矩阵 / 说说… 都是「栏目名 | 站点名」）
export const metadata = {
  title: "资源分享 | " + siteConfig.title,
  description: "资源分享与收藏整理",
};

// 资源目录会随时增删，按请求实时读取
// ⚡ 改成 ISR（静态化 + 定时刷新）：
//   以前是 force-dynamic → 每次点击都要等服务端现渲染（首字节约 1 秒 ✗）而且**无法被预取** ✗
//   现在页面是静态的 → <Link> 的预取生效 ✓ 悬停就取好 ✓ 点下去几乎瞬开 ✓
//   内容更新最多延迟 30 秒 ✓（文章/相册这类"偶尔变一次"的数据完全够 ✓）
export const revalidate = 30;

const RES_DIR = path.join(process.cwd(), 'resources');
const CONTENT_ID = 'resource-content';

function readTitle(file: string): string {
  try {
    const { data } = matter(fs.readFileSync(file, 'utf8'));
    return String(data.title || '');
  } catch {
    return '';
  }
}

function buildTree(dir: string = RES_DIR, prefix = ''): ResourceNode[] {
  if (!fs.existsSync(dir)) return [];
  const folders: ResourceNode[] = [];
  const articles: ResourceNode[] = [];

  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  names.sort((a, b) => a.localeCompare(b, 'zh'));

  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    let isDir = false;
    try {
      isDir = fs.statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      folders.push({ type: 'folder', name, path: rel, children: buildTree(full, rel) });
    } else if (name.toLowerCase().endsWith('.md')) {
      articles.push({
        type: 'article',
        name: readTitle(full) || name.replace(/\.md$/i, ''),
        fileName: name,
        path: rel,
      });
    }
  }
  return [...folders, ...articles];
}

/** 判断一段 HTML 是不是「没有任何实际内容」 */
function isEmptyHtml(html: string) {
  if (!html) return true;
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#12288;|&zwj;/g, '')
    .trim() === '';
}

/** 深度优先取第一篇文章，作为默认打开的那篇 */
function firstArticle(nodes: ResourceNode[]): string {
  for (const n of nodes) {
    if (n.type === 'article') return n.path;
    if (n.children) {
      const found = firstArticle(n.children);
      if (found) return found;
    }
  }
  return '';
}

function findArticle(nodes: ResourceNode[], target: string): boolean {
  for (const n of nodes) {
    if (n.type === 'article' && n.path === target) return true;
    if (n.children && findArticle(n.children, target)) return true;
  }
  return false;
}

async function getResourceData(rel: string) {
  const full = path.join(RES_DIR, ...rel.split('/'));
  const raw = fs.readFileSync(full, 'utf8');
  const { data, content: rawContent } = matter(raw);

  let content = rawContent;

  // === 与 posts/[slug] 完全一致的正文清洗，保证阅读观感相同 ===
  content = content.replace(/^(\s*\d+)\.([^ \n\d])/gm, '$1. $2');
  content = content.replace(/\r\n/g, '\n').replace(/^[ \t]+$/gm, '');
  const blocks = content.split(/(```[\s\S]*?```)/g);
  content = blocks
    .map((block, index) => {
      if (index % 2 === 1) return block;
      return block.replace(/\n{3,}/g, (match) => '\n\n' + '<br/>'.repeat(match.length - 2) + '\n\n');
    })
    .join('');

  const processedContent = await unified()
    .use(remarkParse)
    .use(remarkHardBreaks)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeCodeLang)
    .use(rehypeCallout)
    // @ts-ignore
    .use(rehypeHighlight, {
      detect: false, // 没写语言就保持纯文本：不猜语言、不着色（猜错比不亮更糟）
      ignoreMissing: true,
      subset: ['cpp', 'c', 'python', 'java', 'javascript', 'typescript', 'go', 'rust', 'bash', 'json', 'html', 'css', 'sql', 'xml'],
    })
    .use(rehypeKatex)
    .use(rehypeRepoCard)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(repairMarkdown(content));

  return {
    title: String(data.title || path.basename(rel).replace(/\.md$/i, '')),
    contentHtml: processedContent.toString(),
  };
}

export default async function ResourcesPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path: segments } = await params;

  // ⚠️ Next.js 传给动态路由的参数是「未解码」的，中文会变成 %E6%AC%A2... 形式，
  // 必须自己解码，否则和磁盘上的真实文件名匹配不上，会一直兜底成第一篇文章。
  const requested = (segments || [])
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .join('/');

  const tree = buildTree();
  // 地址栏指定的文章不存在时（链接过期、文章被删或改名），明确提示，
  // 而不是悄悄显示成别的文章
  const notFound = Boolean(requested) && !findArticle(tree, requested);
  const targetPath = notFound ? '' : requested || firstArticle(tree);
  const doc = targetPath ? await getResourceData(targetPath) : null;

  return (
    <div className="min-h-screen relative pb-8" data-res-page>
      {/* 📊 画面顶部那条细线（阅读进度条）**已按用户要求去掉** ✗
          用户原话："我没说要加这个 用不着" —— 那是之前那批动效里自作主张加的，别再恢复 ✓ */}
      {/* 从导航栏进来（/resources）时播入场动画；
          从左侧列表切换文章（/resources/xxx）时跳过，内容瞬间出现 */}
      {/* ⚠️ fadeOnly：这一页里有 **fixed 的「按钮行」**（左右两个展开按钮，见 ResourcePanels）——
          入场动画只要动 transform，那个 div 就成了 fixed 的定位参照物：
          按钮会跟着动画往下飘，动画播完才"啪"地跳回导航栏正下方 ✗
          （用户反馈："进界面后按钮先在下面一段距离，过了一会才变到顶部"）
          → 这一页改成只淡入、不做 20px 上滑 ✓ 详见 components/PageTransition.tsx */}
      <PageTransition disabled={Boolean(requested)} fadeOnly>
        {/* 大屏三栏常驻；小屏只留正文 + 左右两个展开抽屉，都交给这个客户端容器 */}
        <ResourcePanels
          left={<ResourceTreeView tree={tree} selectedPath={targetPath} />}
          right={<ResourceToc contentId={CONTENT_ID} contentKey={targetPath} />}
        >
            {notFound ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 px-8 text-center">
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">这篇文章不存在</p>
                <p className="text-[11px]">它可能已经被删除或改名了，请从左侧列表里选择</p>
              </div>
            ) : !doc ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 px-8 text-center">
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">当前还没有文章</p>
                <p className="text-[11px]">敬请期待</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <style>{`
                  .resource-preview h1 { font-size: 2.2rem !important; font-weight: 900 !important; margin: 2rem 0 1.2rem !important; line-height: 1.25 !important; color: inherit !important; }
                  .resource-preview h2 { font-size: 1.6rem !important; font-weight: 800 !important; margin: 1.6rem 0 1rem !important; color: inherit !important; }
                  .resource-preview h3 { font-size: 1.25rem !important; font-weight: 700 !important; margin: 1.2rem 0 0.8rem !important; color: inherit !important; }
                  .resource-preview p, .resource-preview hr { font-size: 1rem !important; line-height: 1.8 !important; margin-bottom: 1rem !important; color: inherit !important; }
                  .resource-preview ul { list-style-type: disc !important; padding-left: 1.5rem !important; }
                  .resource-preview ol { list-style-type: decimal !important; padding-left: 1.5rem !important; }
                  .resource-preview li { display: list-item !important; margin-bottom: 0.4rem !important; }
                  .resource-preview a { color: #6366f1 !important; font-weight: 600 !important; border-bottom: 1px dashed #6366f1 !important; transition: all 0.3s ease !important; }
                  .resource-preview a:hover { color: #4f46e5 !important; border-bottom-style: solid !important; background-color: rgba(99,102,241,0.1) !important; border-radius: 0.2rem !important; }
                  .dark .resource-preview a { color: #a5b4fc !important; border-bottom-color: #a5b4fc !important; }
                  .dark .resource-preview a:hover { color: #c7d2fe !important; border-bottom-color: #c7d2fe !important; background-color: rgba(165,180,252,0.16) !important; }
                  .resource-preview blockquote {
                    border-left: 4px solid #6366f1 !important; background-color: rgba(99,102,241,0.05) !important;
                    padding: 1rem 1.5rem !important; margin: 1.5rem 0 !important;
                    border-radius: 0 1.25rem 1.25rem 0 !important; font-style: normal !important; color: #64748b !important;
                  }
                  .resource-preview blockquote p { margin: 0 !important; color: inherit !important; }
                  .dark .resource-preview blockquote { border-left-color: #818cf8 !important; background-color: rgba(129,140,248,0.1) !important; color: #94a3b8 !important; }
                  .resource-preview pre { background-color: #282c34 !important; color: #abb2bf !important; padding: 1.25rem !important; border-radius: 0.75rem !important; overflow-x: auto !important; margin: 1.5rem 0 !important; box-shadow: inset 0 0 10px rgba(0,0,0,0.3) !important; }
                  .resource-preview pre code { background-color: transparent !important; color: inherit !important; font-size: 0.9em !important; padding: 0 !important; }
                  .resource-preview code { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, ui-monospace, monospace !important; }
                  .resource-preview code::before, .resource-preview code::after { content: none !important; }
                  .resource-preview p code, .resource-preview li code { background-color: rgba(99,102,241,0.1) !important; color: #6366f1 !important; padding: 0.15rem 0.35rem !important; border-radius: 0.3rem !important; font-weight: 600 !important; font-size: 0.9em !important; }
                  .dark .resource-preview p code, .dark .resource-preview li code { background-color: rgba(99,102,241,0.2) !important; color: #818cf8 !important; }
                  .resource-preview img { display: block !important; margin: 2rem 0 !important; border-radius: 1.5rem !important; box-shadow: 0 20px 50px rgba(0,0,0,0.15) !important; max-width: 100% !important; height: auto !important; }
                  .resource-preview table { width: 100% !important; border-collapse: collapse !important; margin: 1.5rem 0 !important; }
                  .resource-preview th, .resource-preview td { border: 1px solid rgba(148,163,184,0.35) !important; padding: 0.6rem 0.9rem !important; }

                  /* 顶部留白收掉：.resource-preview 的 py-10（40px）
                     + 首个标题自身的 2rem 上外边距（32px）≈ 72px 空一截。
                     现在顶部只留 14px，并把首元素上外边距清零（它会叠在 padding 外面）。
                     小屏那份 2% 的规则写在下面的媒体查询里，优先级更高、不受影响。 */
                  .resource-preview { padding-top: 2rem !important; /* 博客没有预览/编辑按钮，就保持这个适中的 32px */ }
                  .resource-preview > :first-child { margin-top: 0 !important; }

                  /* 📱 小屏：整站的等比缩小交给 globals.css 里的 html{font-size:74%}（导航栏、图标、字号一起缩）。
                     这里调正文自己的留白：
                       · 左右 1.5rem —— 字不再贴着卡片边缘
                       · 顶部只留 2% —— 默认那 2.5rem 在手机上显得空一大截
                       · 顺带干掉第一个元素的 2rem 上外边距（它会叠在 padding 外面再加一截空白）
                     只影响小屏，桌面完全不变 */
                  @media (max-width: 1023.98px) {
                    .resource-preview {
                      padding-left: 1.5rem !important;
                      padding-right: 1.5rem !important;
                      padding-top: 2% !important;
                      padding-bottom: 2rem !important;
                    }
                    .resource-preview > :first-child { margin-top: 0 !important; }
                  }
                `}</style>
                {isEmptyHtml(doc.contentHtml) ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400 px-8 text-center">
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400">这篇文章还没有内容</p>
                    <p className="text-[11px]">敬请期待</p>
                  </div>
                ) : (
                  <article
                    id={CONTENT_ID}
                    className="resource-preview px-10 py-10 max-w-none text-slate-800 dark:text-slate-200 transition-colors duration-700"
                    dangerouslySetInnerHTML={{ __html: doc.contentHtml }}
                  />
                )}
              </div>
            )}
        </ResourcePanels>
      </PageTransition>
    </div>
  );
}


