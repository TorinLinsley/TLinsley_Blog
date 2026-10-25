import { siteConfig } from '../../siteConfig';

export const metadata = {
  title: "设置 | " + siteConfig.title,
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}