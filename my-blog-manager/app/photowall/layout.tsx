import { siteConfig } from '../../siteConfig';

export const metadata = {
  title: "照片墙 | " + siteConfig.title,
};

export default function PhotoWallLayout({ children }: { children: React.ReactNode }) {
  return children;
}