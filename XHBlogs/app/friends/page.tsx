import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import FriendsBoard from './FriendsBoard';
import { readFriends } from '../../lib/readFriends';
import {siteConfig} from "@/siteConfig";

// 🤝 友链按请求读 data/friends.ts，别在构建时定死 ——
// 这样控制台【同步Blog】推完友链（删的也算），刷新一下页面就有了，不用重新 build。
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "友链 | " + siteConfig.title,
  description: "赛博空间里的有趣灵魂",
};

export default function FriendsPage() {
  return (
    <div className="min-h-screen relative pb-20">
      <Navbar />
      <PageTransition>
        <div className="mt-28">
          <FriendsBoard friends={readFriends()} />
        </div>
      </PageTransition>
    </div>
  );
}
