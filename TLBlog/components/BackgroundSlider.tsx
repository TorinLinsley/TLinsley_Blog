"use client";
import { useState, useEffect } from 'react';
import { siteConfig } from '../siteConfig';

const isRemote = (u: string) => /^https?:\/\//i.test(u);

const CACHE_NAME = 'bg-origin-v1';
const blobCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

async function loadOriginal(url: string): Promise<string | null> {
  const hit = blobCache.get(url);
  if (hit) return hit;
  const running = inflight.get(url);
  if (running) return running;

  const task = (async () => {
    try {
      let res: Response | null = null;

      if (typeof caches !== 'undefined') {
        const cache = await caches.open(CACHE_NAME);
        const stored = await cache.match(url);
        if (stored) {
          res = stored;
        } else {
          const net = await fetch(url);
          if (net.ok) {
            await cache.put(url, net.clone());
            res = net;
          }
        }
      } else {
        const net = await fetch(url, { cache: 'force-cache' });
        if (net.ok) res = net;
      }

      if (!res || !res.ok) return null;
      const objUrl = URL.createObjectURL(await res.blob());
      blobCache.set(url, objUrl);
      return objUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, task);
  return task;
}

export default function BackgroundSlider() {
  const [index, setIndex] = useState(0);
  const [loadedCount, setLoadedCount] = useState(1);
  const images = siteConfig.bgImages;

  const [resolved, setResolved] = useState<Record<string, { ok: boolean; src?: string }>>(() => {
    const init: Record<string, { ok: boolean; src?: string }> = {};
    siteConfig.bgImages.forEach((u) => {
      const cached = blobCache.get(u);
      if (cached) init[u] = { ok: true, src: cached };
    });
    return init;
  });

  useEffect(() => {
    if (images.length <= 1) return;
    const timers: number[] = [];
    images.slice(1).forEach((_, i) => {
      timers.push(window.setTimeout(() => {
        setLoadedCount((c) => Math.max(c, i + 2));
      }, 1500 + i * 2500));
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 10000);

    return () => clearInterval(timer);
  }, [images.length]);

  useEffect(() => {
    let alive = true;
    images.slice(0, loadedCount).forEach((url) => {
      if (!isRemote(url) || blobCache.has(url)) return;
      loadOriginal(url).then((src) => {
        if (!alive) return;
        setResolved((m) => (m[url] ? m : { ...m, [url]: src ? { ok: true, src } : { ok: false } }));
      });
    });
    return () => { alive = false; };
  }, [images, loadedCount]);

  return (
    <div className="absolute inset-0 z-[-10] overflow-hidden">
      {images.slice(0, loadedCount).map((img, i) => {
        const r = resolved[img];
        const backgroundImage = !isRemote(img)
          ? `url(${img})`
          : r?.ok && r.src
            ? `url(${r.src})`
            : r
              ? `url(${img})`
              : 'none';

        return (
          <div
            key={img}
            className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out transform-gpu"
            style={{
              backgroundImage,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: i === index ? 1 : 0,
              visibility: Math.abs(i - index) <= 1 || (i === images.length - 1 && index === 0) ? 'visible' : 'hidden'
            }}
          />
        );
      })}
    </div>
  );
}