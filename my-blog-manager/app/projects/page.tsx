import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import ProjectsBoard from './ProjectsBoard';
import { siteConfig } from '../../siteConfig';

export const metadata = {
  title: "项目矩阵 | " + siteConfig.title,
  description: "开源项目与代码仓库展示",
};

export default function ProjectsPage() {
  return (
    <div className="min-h-screen relative pb-20">
      <Navbar />
      <PageTransition>
        {/* 📱 只动布局：小屏顶部留白收一档；lg（≥1024px）仍是原来的 mt-28 */}
        <div className="mt-20 lg:mt-28">
          <ProjectsBoard />
        </div>
      </PageTransition>
    </div>
  );
}