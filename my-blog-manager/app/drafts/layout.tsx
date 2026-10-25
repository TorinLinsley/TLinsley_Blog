import { siteConfig } from '../../siteConfig';

export const metadata = {
  title: "草稿箱 | " + siteConfig.title,
};

export default function DraftsLayout({ children }: { children: React.ReactNode }) {
  return children;
}