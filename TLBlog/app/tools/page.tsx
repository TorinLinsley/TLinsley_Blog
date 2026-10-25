import fs from 'fs';
import path from 'path';

import PageTransition from '../../components/PageTransition';
import ToolsBoard from './ToolsBoard';
import { siteConfig } from '../../siteConfig';

export const revalidate = 30;

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
    return [];
  }
}

export default function ToolsPage() {
  const tools = readTools();

  return (
    <div className="min-h-screen relative pb-10">
      <PageTransition>
        <ToolsBoard
          tools={tools}
          title="工具"
          subtitle="🔧 本网站里的网页工具，点开就能用"
        />
      </PageTransition>
    </div>
  );
}