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
// 🎨 代码块的配色主题（和文章页/资源页同一个 atom-one-dark，别处有的颜色这里也必须有）
import 'highlight.js/styles/atom-one-dark.css';

// 内容会随时变化（控制台改完自动同步过来），按请求实时读取，别在构建时定死
// ⚠️ 这里**故意不做 ISR 缓存**（用户 2026-10-22 反馈："发完说说要刷好几次才看见"）：
// 之前 revalidate = 30 → 页面缓存 30 秒，发布完刷新看到的还是旧快照 ✗
// ⚠️ 又要"立即最新"，又不想给服务器加带宽/渲染负担 → 用**很短的 ISR**（3 秒）：
//    · 页面仍然是静态结果 ✓ 命中缓存时**不渲染**、和原来一样省 ✓（带宽一点没多）
//    · 最坏情况旧 3 秒 ✓ 刷新一下基本就是新的 ✓
//    · 比 force-dynamic 好在：没人看的时候完全不渲染，冷启动也不会每次都跑一遍 remark ✓
export const revalidate = 3;

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