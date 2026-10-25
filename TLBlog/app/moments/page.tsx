import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageTransition from '../../components/PageTransition';
import MomentList from './MomentList';
import { siteConfig } from '../../siteConfig';
import { stripInlineMarkdown } from '../../lib/repairMarkdown';
import { renderMomentHtml } from '../../lib/momentMarkdown';
import 'highlight.js/styles/atom-one-dark.css';

export const revalidate = 3;

export const metadata = {
  title: "说说 | " + siteConfig.title,
  description: "生活动态与瞬间记录",
};

export default async function MomentsPage() {
  let allMoments: any[] = [];

  try {
    const possibleDirs = [
      path.join(process.cwd(), 'posts', 'moments'),
      path.join(process.cwd(), 'moments')
    ];

    const collected: any[] = [];

    possibleDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        const fileNames = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        fileNames.forEach(fileName => {
          const fullPath = path.join(dir, fileName);
          const { data, content } = matter(fs.readFileSync(fullPath, 'utf8'));

          collected.push({
            id: fileName.replace(/\.md$/, ''),
            date: data.date || '1970-01-01',
            location: data.location || '',
            images: data.images || [],
            content: stripInlineMarkdown(content.trim()),
            markdown: content.trim()
          });
        });
      }
    });

    allMoments = await Promise.all(
      collected.map(async (item) => {
        let contentHtml = '';
        try {
          contentHtml = await renderMomentHtml(item.markdown);
        } catch (e) {
          console.error('说说 Markdown 渲染失败:', item.id, e);
        }
        return { ...item, contentHtml };
      })
    );

    allMoments = Array.from(new Map(allMoments.map(item => [item.id, item])).values());

  } catch (e) {
    console.error("读取说说数据失败:", e);
  }

  return (
    <div className="min-h-screen relative pb-10 flex flex-col">
      <PageTransition className="flex-1 flex flex-col">
        <MomentList
          moments={allMoments}
          authorName={siteConfig.authorName}
          avatarUrl={siteConfig.avatarUrl}
        />
      </PageTransition>
    </div>
  );
}