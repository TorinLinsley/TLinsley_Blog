import PageTransition from '../../components/PageTransition';
import ProjectsBoard from './ProjectsBoard';
import { readProjects } from '../../lib/readProjects';
import {siteConfig} from "@/siteConfig";

export const metadata = {
  title: "项目矩阵 | " + siteConfig.title,
  description: "开源项目与代码仓库展示",
};

// 项目数据由控制台同步过来，按请求实时读文件，别在构建时定死（改完刷新就生效）
export const dynamic = 'force-dynamic';

export default function ProjectsPage() {
  return (
    <div className="min-h-screen relative pb-20">
      <PageTransition>
        <div className="mt-28">
          <ProjectsBoard projects={readProjects()} />
        </div>
      </PageTransition>
    </div>
  );
}