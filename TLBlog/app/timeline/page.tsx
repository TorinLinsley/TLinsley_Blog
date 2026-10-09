import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageTransition from '../../components/PageTransition';
import { siteConfig } from '../../siteConfig';
import TimelineClient from '../../components/TimelineClient';
// 🌟 1. 引入 ToastProvider 喵！
import { ToastProvider } from '../../components/ToastProvider';

// 内容会随时变化（控制台改完自动同步过来），按请求实时读取，别在构建时定死
// ⚡ 改成 ISR（静态化 + 定时刷新）：
//   以前是 force-dynamic → 每次点击都要等服务端现渲染（首字节约 1 秒 ✗）而且**无法被预取** ✗
//   现在页面是静态的 → <Link> 的预取生效 ✓ 悬停就取好 ✓ 点下去几乎瞬开 ✓
//   内容更新最多延迟 30 秒 ✓（文章/相册这类"偶尔变一次"的数据完全够 ✓）
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

        const fileContents = fs.readFileSync(fullPath, 'utf8');
        const { data } = matter(fileContents);

        const postTags = data.tags && Array.isArray(data.tags) ? data.tags : ['未分类'];

        postTags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });

        posts.push({
          slug,
          title: data.title || '无标题',
          date: data.date || '1970-01-01',
          description: data.description || '',
          tags: postTags,
          cover: data.cover || siteConfig.defaultPostCover,
        });
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
    // 🌟 2. 在最外层用 ToastProvider 包裹整个页面
    <ToastProvider>
      <div className="min-h-screen relative pb-32">
        <PageTransition>
          <TimelineClient posts={posts} tags={tagsArray} />
        </PageTransition>
      </div>
    </ToastProvider>
  );
}