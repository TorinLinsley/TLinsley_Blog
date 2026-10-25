"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ContentLiveRefresh({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let lastRev = '';
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      try {
        const res = await fetch('/api/content-watch', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (stopped || !data?.rev) return;

        if (lastRev && data.rev !== lastRev) {
          router.refresh();
        }
        lastRev = data.rev;
      } catch {
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