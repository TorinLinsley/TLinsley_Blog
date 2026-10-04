import { siteConfig } from '../../siteConfig';

/**
 * 🏷️ 工具页的标签页标题（和资源分享/杂谈那些一样是「栏目名 | 站点名」）。
 *
 * 为什么单开 layout：这个路由的 page.tsx 是客户端组件（整页都在浏览器里管理工具），
 * 而 Next 规定客户端组件不能导出 metadata，所以标题写在这一层的服务端组件里。
 */
export const metadata = {
  title: "工具 | " + siteConfig.title,
  description: "管理本网站里的网页工具",
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
