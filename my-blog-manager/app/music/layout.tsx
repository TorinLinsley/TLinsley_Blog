import { siteConfig } from '../../siteConfig';

export const metadata = {
  title: "音乐馆 | " + siteConfig.title,
};

export default function MusicLayout({ children }: { children: React.ReactNode }) {
  return children;
}