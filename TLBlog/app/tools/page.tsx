import fs from 'fs';
import path from 'path';

import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import ToolsBoard from './ToolsBoard';
import { siteConfig } from '../../siteConfig';

/**
 * 🧰 工具页：把服务器 `tools/` 目录里那些「独立的小网页工具」列成一张导航表。
 *
 * · 列表读的是 `tools/tools.json`（控制台那边的管理界面写它），**按请求实时读盘**，
 *   所以在控制台加/改/删一个工具，刷新这一页就能看见，不用重建前台。
 * · 点卡片跳 `/tools/<项目目录名>/<主网页文件名>`，那个地址由 `app/tools/[...file]/route.ts`
 *   直接把文件吐出来（工具网页本身还是独立的 HTML，不受 Next 影响）。
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "工具 | " + siteConfig.title,
  description: "本网站里的网页工具集合",
};

const TOOLS_DIR = path.join(process.cwd(), 'tools');
const META_FILE = path.join(TOOLS_DIR, 'tools.json');

export type ToolItem = {
  name: string;
  dir: string;
  entry: string;
  description?: string;
  icon?: string;
  tags?: string[];
};

function readTools(): ToolItem[] {
  try {
    const data = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    const list = Array.isArray(data) ? data : (data?.tools ?? []);
    return (list as ToolItem[]).filter((t) => t && t.dir && t.entry);
  } catch {
    // 还没有 tools.json（或者坏了）就显示空列表，页面本身别崩
    return [];
  }
}

export default function ToolsPage() {
  const tools = readTools();

  return (
    <div className="min-h-screen relative pb-10">
      <Navbar />
      <PageTransition>
        {/* 标题和副标题先写在这里；想改文案直接改这两行即可 */}
        <ToolsBoard
          tools={tools}
          title="工具"
          subtitle="🔧 本网站里的网页工具，点开就能用"
        />
      </PageTransition>
    </div>
  );
}
