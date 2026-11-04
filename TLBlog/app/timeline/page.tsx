import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageTransition from '../../components/PageTransition';
import { siteConfig } from '../../siteConfig';
import TimelineClient from '../../components/TimelineClient';
import { ToastProvider } from '../../components/ToastProvider';
import { dateText } from '../../lib/postDate';

export const revalidate = 30;

export const metadata = {
  title: "归档与探索 | " + siteConfig.title,
};

export default function Timeline() {
  const postsDirectory = path.join(process.cwd(), 'posts');
  let posts: any[] = [];
  let tagCounts: Record<string, number> = {};

  try {
    if (fs.existsSync(postsDirectory)) {
      const fileNames = fs.readdirSync(postsDirectory).filter(f => f.endsWith('.md'));

      fileNames.forEach(fileName => {
        const slug = fileName.replace(/\.md$/, '');
        const fullPath = path.join(postsDirectory, fileName);

        try {
          const fileContents = fs.readFileSync(fullPath, 'utf8');
          const { data } = matter(fileContents);

          const postTags = data.tags && Array.isArray(data.tags) ? data.tags.map(t => String(t)) : ['未分类'];

          postTags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });

          posts.push({
            slug,
            title: typeof data.title === 'string' && data.title ? data.title : '无标题',
            date: dateText(data.date) || '1970-01-01',
            description: typeof data.description === 'string' ? data.description : '',
            tags: postTags,
            cover: typeof data.cover === 'string' && data.cover ? data.cover : siteConfig.defaultPostCover,
          });
        } catch (err) {
          console.error('跳过无法解析的文章', fileName, err);
        }
      });

      posts.sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        return dateDiff !== 0 ? dateDiff : b.slug.localeCompare(a.slug);
      });
    }
  } catch(e) {
    console.error("读取文章列表失败", e);
  }

  const tagsArray = Object.keys(tagCounts)
    .map(name => ({ name, count: tagCounts[name] }))
    .sort((a, b) => b.count - a.count);

  return (
    <ToastProvider>
      <div className="min-h-screen relative pb-32">
        <PageTransition>
          <TimelineClient posts={posts} tags={tagsArray} />
        </PageTransition>
      </div>
    </ToastProvider>
  );
}