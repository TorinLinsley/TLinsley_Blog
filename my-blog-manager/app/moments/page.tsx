import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageTransition from '../../components/PageTransition';
import MomentList from './MomentList';
import { siteConfig } from '../../siteConfig';
// 🩹 说说卡片是**纯文本**显示正文，markdown 标记（**加粗** 等）会连着符号露出来 —— 这里先去标记
import { stripInlineMarkdown } from '../../lib/repairMarkdown';

// 内容会随时变化（控制台里写完就落盘），按请求实时读取，别在构建时定死 —— 和博客前台那一份保持一致
// ⚡ 改成 ISR（静态化 + 30 秒刷新）——只对**只读**页面这么干 ✓
//   以前 force-dynamic → 每次切页都要服务端现渲染（实测首字节 1.155 秒 ✗）而且无法预取 ✗
//   现在静态化 → 悬停预取 ✓ 切页几乎瞬开 ✓
//   内容更新最多延迟 30 秒 ✓（看数据够用 ✓）
//   ⚠️ 编辑页（posts/[slug]、chatter/[slug]）**故意保持动态** ✗ 那里必须永远看到最新数据 ✓
export const revalidate = 30;

export const metadata = {
  title: "说说 | " + siteConfig.title,
  description: "生活动态与瞬间记录",
};

export default function MomentsPage() {
  let allMoments: any[] = [];

  try {
    // 🌟 终极防漏绝招：同时扫描两个可能的文件夹，把所有的说说都抓出来！
    const possibleDirs = [
      path.join(process.cwd(), 'posts', 'moments'),
      path.join(process.cwd(), 'moments')
    ];

    possibleDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        const fileNames = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        fileNames.forEach(fileName => {
          const fullPath = path.join(dir, fileName);
          const { data, content } = matter(fs.readFileSync(fullPath, 'utf8'));

          allMoments.push({
            id: fileName.replace(/\.md$/, ''),
            date: data.date || '1970-01-01',
            location: data.location || '',
            images: data.images || [],
            content: stripInlineMarkdown(content.trim())
          });
        });
      }
    });

    // 去重，防止你在两个文件夹放了同名文件
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