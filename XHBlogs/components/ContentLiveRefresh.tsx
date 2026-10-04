"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 全站「内容变化 → 自动更新」。
 *
 * 控制台那边删/增/改名/改内容之后，会自动同步到博客项目；
 * 这里每隔一会儿问一次「内容变了没」，变了就软刷新一下当前页面。
 * 效果就是：控制台一改，正常访问的网页自己就更新了，不用手动按 F5。
 *
 * 用的是 router.refresh()：
 *   - 服务端重新读一遍磁盘，只把变化的部分换上去
 *   - 不白屏、不丢滚动位置、不重新加载整个页面
 */
export default function ContentLiveRefresh({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let lastRev = '';
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      // 页面在后台（切到别的标签页）时先不查，省点资源
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      try {
        const res = await fetch('/api/content-watch', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (stopped || !data?.rev) return;

        // 第一次只记基线，避免刚进页面就无意义地刷一次
        if (lastRev && data.rev !== lastRev) {
          router.refresh();
        }
        lastRev = data.rev;
      } catch {
        /* 网络抖一下无所谓，下一轮再看 */
      }
    };

    void tick();
    const timer = setInterval(tick, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
