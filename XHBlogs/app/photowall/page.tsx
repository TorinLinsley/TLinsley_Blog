import { siteConfig } from "../../siteConfig";
import { readAlbums } from "../../lib/readAlbums";
import PhotoWallClient from "./PhotoWallClient";

// 🖼️ 相册按请求读 data/albums.ts，别在构建时定死 ——
// 这样控制台【同步Blog】推完相册，刷新一下页面就有了，不用重新 build。
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "照片墙 | " + siteConfig.title,
};

export default function PhotoWallPage() {
  return <PhotoWallClient albums={readAlbums()} />;
}
