import { siteConfig } from '../../../siteConfig';

export const metadata = {
  title: "资源分享 | " + siteConfig.title,
};

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return children;
}