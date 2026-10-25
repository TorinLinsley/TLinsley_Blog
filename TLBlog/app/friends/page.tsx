import PageTransition from '../../components/PageTransition';
import FriendsBoard from './FriendsBoard';
import { readFriends } from '../../lib/readFriends';
import {siteConfig} from "@/siteConfig";

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