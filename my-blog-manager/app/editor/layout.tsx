import { siteConfig } from '../../siteConfig';

export const metadata = {
  title: "编辑器 | " + siteConfig.title,
};

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return children;
}