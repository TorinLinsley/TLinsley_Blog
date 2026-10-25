import { siteConfig } from '../../siteConfig';

export const metadata = {
  title: "控制台 | " + siteConfig.title,
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}