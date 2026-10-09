import PageTransition from '../../components/PageTransition';
import ProjectsBoard from './ProjectsBoard';
import { readProjects } from '../../lib/readProjects';
import {siteConfig} from "@/siteConfig";

export const metadata = {
  title: "项目矩阵 | " + siteConfig.title,
  description: "开源项目与代码仓库展示",
};

// 项目数据由控制台同步过来，按请求实时读文件，别在构建时定死（改完刷新就生效）
// ⚡ 改成 ISR（静态化 + 定时刷新）：
//   以前是 force-dynamic → 每次点击都要等服务端现渲染（首字节约 1 秒 ✗）而且**无法被预取** ✗
//   现在页面是静态的 → <Link> 的预取生效 ✓ 悬停就取好 ✓ 点下去几乎瞬开 ✓
//   内容更新最多延迟 30 秒 ✓（文章/相册这类"偶尔变一次"的数据完全够 ✓）
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