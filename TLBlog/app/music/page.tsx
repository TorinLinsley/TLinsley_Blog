import { siteConfig } from "@/siteConfig";
import MusicClient from "./MusicClient";

export const metadata = {
  title: "音乐馆 | " + siteConfig.title,
};

export default function MusicPage() {
  return <MusicClient />;
}