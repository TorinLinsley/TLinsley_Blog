import PageTransition from '../../components/PageTransition';
import ProjectsBoard from './ProjectsBoard';
import { readProjects } from '../../lib/readProjects';
import {siteConfig} from "@/siteConfig";

export const metadata = {
  title: "项目矩阵 | " + siteConfig.title,
  description: "开源项目与代码仓库展示",
};

export const revalidate = 30;

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