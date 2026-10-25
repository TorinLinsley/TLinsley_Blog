import { siteConfig } from '../../siteConfig';

export const metadata = {
  title: "工具 | " + siteConfig.title,
  description: "管理本网站里的网页工具",
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}