import { siteConfig } from '../../siteConfig';

/**
 * 🏷️ 音乐馆的标签页标题：和其它栏目页一个写法（「栏目名 | 站点名」）。
 *
 * 为什么单开一个 layout 而不是写在 page.tsx 里：
 *   这个路由的 page.tsx 是 "use client"（整页都在浏览器里交互），
 *   而 Next.js 规定**客户端组件不能导出 metadata** —— 写了不生效。
 *   所以标题放在这一层的 layout（服务端组件）里，效果完全一样。
 */
export const metadata = {
  title: "音乐馆 | " + siteConfig.title,
};

export default function MusicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
