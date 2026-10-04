import { siteConfig } from '../../siteConfig';

/**
 * 🏷️ 设置的标签页标题：控制台自有的界面，同样按「栏目名 | 站点名」写。
 *
 * 为什么单开一个 layout 而不是写在 page.tsx 里：
 *   这个路由的 page.tsx 是 "use client"（整页都在浏览器里交互），
 *   而 Next.js 规定**客户端组件不能导出 metadata** —— 写了不生效。
 *   所以标题放在这一层的 layout（服务端组件）里，效果完全一样。
 */
export const metadata = {
  title: "设置 | " + siteConfig.title,
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
