import { siteConfig } from '../../../siteConfig';

/**
 * 🏷️ 资源分享页的标签页标题：和其它非首页界面一个写法（友链 / 项目矩阵 / 说说… 都是「栏目名 | 站点名」）。
 *
 * 为什么单开一个 layout 而不是写在 page.tsx 里：
 *   这个路由的 page.tsx 是 "use client"（整页都在浏览器里编辑），
 *   而 Next.js 规定**客户端组件不能导出 metadata** —— 写了不生效。
 *   所以标题放在这一层的 layout（服务端组件）里，效果完全一样。
 *
 * 覆盖范围：/resources（资源分享首页）和 /resources/xxx（打开的某篇文章）都会用这个标题。
 */
export const metadata = {
  title: "资源分享 | " + siteConfig.title,
};

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
