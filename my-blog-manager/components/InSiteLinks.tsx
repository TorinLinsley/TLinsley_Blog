"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';


const LINK_SELECTOR = '.prose a[href], .resource-preview a[href], .chatter-preview a[href]';
const SKIP_INSIDE = '.editor-content-area, .ProseMirror, [contenteditable="true"], [data-no-router]';

const isInSitePath = (raw: string) => raw.startsWith('/') && !raw.startsWith('//');

export default function InSiteLinks() {
  const router = useRouter();

  useEffect(() => {
    const stamp = () => {
      document.querySelectorAll<HTMLAnchorElement>(LINK_SELECTOR).forEach((a) => {
        if (a.closest(SKIP_INSIDE)) return;
        if (a.hasAttribute('download')) return;
        if (a.hasAttribute('target')) return;
        const raw = a.getAttribute('href') || '';
        if (!raw || raw.startsWith('#')) return;
        if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) return;
        if (isInSitePath(raw)) {
          router.prefetch(raw);
          return;
        }
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || !a.matches(LINK_SELECTOR)) return;
      if (a.closest(SKIP_INSIDE)) return;
      if (a.hasAttribute('download') || a.hasAttribute('target')) return;
      const raw = a.getAttribute('href') || '';
      if (!isInSitePath(raw)) return;
      e.preventDefault();
      router.push(raw);
    };
    document.addEventListener('click', onClick);

    stamp();

    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => { timer = null; stamp(); }, 200);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('click', onClick);
      mo.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [router]);

  return null;
}