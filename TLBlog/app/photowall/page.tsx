import { siteConfig } from "../../siteConfig";
import { readAlbums } from "../../lib/readAlbums";
import PhotoWallClient from "./PhotoWallClient";

export const revalidate = 30;

export const metadata = {
  title: "照片墙 | " + siteConfig.title,
};

export default function PhotoWallPage() {
  return <PhotoWallClient albums={readAlbums()} />;
}