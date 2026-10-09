import PageTransition from '../../components/PageTransition';
import FriendsBoard from './FriendsBoard';
import { readFriends } from '../../lib/readFriends';
import {siteConfig} from "@/siteConfig";

// 🤝 友链按请求读 data/friends.ts，别在构建时定死 ——
// 这样控制台【同步Blog】推完友链（删的也算），刷新一下页面就有了，不用重新 build。
// ⚡ 改成 ISR（静态化 + 定时刷新）：
//   以前是 force-dynamic → 每次点击都要等服务端现渲染（首字节约 1 秒 ✗）而且**无法被预取** ✗
//   现在页面是静态的 → <Link> 的预取生效 ✓ 悬停就取好 ✓ 点下去几乎瞬开 ✓
//   内容更新最多延迟 30 秒 ✓（文章/相册这类"偶尔变一次"的数据完全够 ✓）
export const revalidate = 30;

export const metadata = {
  title: "友链 | " + siteConfig.title,
  description: "赛博空间里的有趣灵魂",
};

export default function FriendsPage() {
  return (
    <div className="min-h-screen relative pb-20">
      <PageTransition>
        <div className="mt-28">
          <FriendsBoard friends={readFriends()} />
        </div>
      </PageTransition>
    </div>
  );
}
