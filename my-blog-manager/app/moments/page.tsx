import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import PageTransition from '../../components/PageTransition';
import MomentList from './MomentList';
import { siteConfig } from '../../siteConfig';
// 🩹 说说卡片是**纯文本**显示正文，markdown 标记（**加粗** 等）会连着符号露出来 —— 这里先去标记
//    （只用来做搜索关键词匹配 ✓ 真正显示的那份走下面的 Markdown 渲染 ✓）
import { stripInlineMarkdown } from '../../lib/repairMarkdown';
// 📝 说说正文按 Markdown 渲染（用户 2026-10-22 要求：写的 `- 列表` 要真的显示成列表）
import { renderMomentHtml } from '../../lib/momentMarkdown';

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

export default async function MomentsPage() {
  let allMoments: any[] = [];

  try {
    // 🌟 终极防漏绝招：同时扫描两个可能的文件夹，把所有的说说都抓出来！
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
            // 🔎 搜索用：去掉 markdown 标记的纯文本
            content: stripInlineMarkdown(content.trim()),
            // 🖼️ 显示用：真正的 Markdown → HTML
            markdown: content.trim()
          });
        });
      }
    });

    // Markdown 渲染是异步的，统一渲染后再交给页面
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