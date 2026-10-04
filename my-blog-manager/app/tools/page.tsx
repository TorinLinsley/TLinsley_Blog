import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import ToolsAdmin from './ToolsAdmin';

/**
 * 🧰 控制台的「工具」页：管理 <博客>/tools 下那些独立的小网页工具。
 *
 * 数据只有一份（博客项目里的 tools/tools.json），控制台这边不复制，
 * 所以前台 /tools 页刷新就是最新的，不需要重建、也不需要"更新本地"。
 */
export default function ToolsPage() {
  return (
    <div className="min-h-screen relative pb-20">
      <Navbar />
      <PageTransition>
        <ToolsAdmin />
      </PageTransition>
    </div>
  );
}
