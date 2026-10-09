import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// 引入前台客户端组件
import CreativeWorkshopClient from './CreativeWorkshopClient';
// 🩹 灵境这边是**纯文本**显示正文（试管气泡 / 详情卡片），markdown 标记会连着符号露出来 —— 先去标记
import { stripInlineMarkdown } from '../../lib/repairMarkdown';
import { siteConfig } from '../../siteConfig';

/**
 * ⚠️ 这行不能少（和首页 app/page.tsx 同一套写法）：内容按**请求**实时读盘。
 *
 * 以前这里漏了它，于是 /tree（灵境）在构建时就把 posts/chatters/moments 定死成静态页了 ——
 * 说说删了它还显示、杂谈写了它还是 0，而且 rebuild-if-needed.sh 的代码指纹**故意排除了**
 * posts/chatters/moments（它们本来就该免重建），所以永远等不到自动重建。
 * 现象就是：点了「更新本地」也没用，控制台和前台一个样。
 */
// ⚡ 改成 ISR（静态化 + 定时刷新）：
//   以前是 force-dynamic → 每次点击都要等服务端现渲染（首字节约 1 秒 ✗）而且**无法被预取** ✗
//   现在页面是静态的 → <Link> 的预取生效 ✓ 悬停就取好 ✓ 点下去几乎瞬开 ✓
//   内容更新最多延迟 30 秒 ✓（文章/相册这类"偶尔变一次"的数据完全够 ✓）
export const revalidate = 30;

// 🏷️ 标签页标题：栏目页 = 「栏目名 | 站点名」（和导航栏、其它栏目页同一套规则）
export const metadata = {
  title: "灵境 | " + siteConfig.title,
};

function getLocalItems(directoryName: string, typeName: string) {
  const dirPath = path.join(process.cwd(), directoryName);
  let items: any[] = [];
  try {
    if (fs.existsSync(dirPath)) {
      const fileNames = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
      items = fileNames.map(fileName => {
        const fullPath = path.join(dirPath, fileName);
        // 🌟 核心：把 content（正文内容）和 data（头部参数）解构出来！
        const { data, content } = matter(fs.readFileSync(fullPath, 'utf8'));

        // 提取真正的文件名作为路由 slug
        const realSlug = fileName.replace(/\.md$/, '');

        return {
          id: data.id || realSlug,
          slug: realSlug, // 🌟 强制保留真实的 slug 供路由跳转使用
          title: data.title || '',
          type: typeName,
          date: data.date || '2026-05-01',
          // 🌟 核心修复：把 cover（封面图）提取出来传给前台！如果写的是 image 也兼容
          cover: data.cover || data.image || null,
          // 把正文传给前台，去掉可能存在的换行符，限制长度防止卡片撑爆
          content: stripInlineMarkdown(content.trim())
        };
      });
    }
  } catch (error) {
    console.error(`读取 ${directoryName} 失败:`, error);
  }
  return items;
}

export default function CreativeWorkshopPage() {
  const posts = getLocalItems('posts', 'post');
  const chatters = getLocalItems('chatters', 'chatter');
  const moments = getLocalItems('moments', 'moment');

  return (
    <CreativeWorkshopClient
      posts={posts}
      chatters={chatters}
      moments={moments}
    />
  );
}