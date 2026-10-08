"use client";
import { useState, useEffect } from 'react';
import { siteConfig } from '../siteConfig';

/** 站外的图床链接才需要特殊处理；站内路径（/uploads/…）本来就有正常缓存，原样用 */
const isRemote = (u: string) => /^https?:\/\//i.test(u);

/**
 * 🔁 图床原图的本地缓存（**不改图、不压画质、不换图床**）
 *
 * 病因（实测出来的）：图床 bu.dusays.com 给的是 `Cache-Control: no-cache`
 * （偶尔回 max-age=3600，节点不一样头也不一样），但**从不返回 304** ——
 * 带 If-None-Match 重问一次，它照样回 200 + 整张图。
 * 于是浏览器每次刷新都得回源"确认一下"，而源每次把 3.34 MB 重传一遍；
 * 手机上就表现为"背景图一行行往下重画"（图本身还是基线 JPEG，绘制方式正是逐行）。
 *
 * 解法：让**页面自己**把原图字节取回来，存进浏览器的 Cache Storage
 * （这块存储归页面管，HTTP 缓存头说什么都不影响它），再转成 blob 地址交给 CSS。
 * 拿到的还是**一模一样的原图字节**，只是从第二次开始彻底不联网。
 */
const CACHE_NAME = 'bg-origin-v1';
const blobCache = new Map<string, string>();                 // 会话内直接命中，省一次异步等待
const inflight = new Map<string, Promise<string | null>>();  // 同一个链接只取一次

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
          res = stored;                              // 命中本地原图，一个字节都不联网
        } else {
          const net = await fetch(url);
          if (net.ok) {
            await cache.put(url, net.clone());       // 存进去的就是原图字节
            res = net;
          }
        }
      } else {
        // 非安全上下文（比如用局域网 IP + http 打开）没有 Cache Storage，
        // 退回 HTTP 缓存：force-cache = 有缓存就直接用，不做重新验证。
        const net = await fetch(url, { cache: 'force-cache' });
        if (net.ok) res = net;
      }

      if (!res || !res.ok) return null;
      const objUrl = URL.createObjectURL(await res.blob());
      blobCache.set(url, objUrl);
      return objUrl;
    } catch {
      return null;                                   // 跨域被拒 / 离线 → 外面退回原始链接
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, task);
  return task;
}

export default function BackgroundSlider() {
  const [index, setIndex] = useState(0);
  /**
   * 🚀 首屏只挂第 1 张，其余延后加载 —— **不碰图片本身、画质零损失**。
   * 原来三张一起挂，浏览器首屏就得下满 3.34 MB（2.1 + 0.24 + 1.06）；
   * 现在首屏只下第 1 张，第 2/3 张等首屏画完再补，而轮播 10 秒才切，补得及。
   */
  const [loadedCount, setLoadedCount] = useState(1);
  const images = siteConfig.bgImages;

  /** url → 原图去向：{ok:true, src:blob地址} 已拿到 / {ok:false} 取不到（退回原始链接） */
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
    }, 10000); // 10秒切换一次

    return () => clearInterval(timer);
  }, [images.length]);

  /** 只取"已经挂上去"的那几张，保持第 2/3 张延后加载的老策略不变 */
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

  /**
   * 🧱 给「没有毛玻璃的浏览器」用：把**当前显示的那张图**写成 CSS 变量 `--bg-now` ✓
   *
   * 为什么要它：OPPO 自带浏览器那种内核不做 backdrop-filter ✗
   * 于是 app/globals.css 里的 `.no-glass` 规则会在玻璃卡片里叠一层
   * "同一张图 + filter: blur()" 来**伪造毛玻璃** ✓ —— 那一层要image地址，就是从这儿拿 ✓
   *
   * ⚠️ 用的一定是"**真正画在背景上的那个地址**" ✓：
   *    站外图床有时会被换成 blob 地址（见上面 loadOriginal 的说明 ✓），
   *    这里沿用它 → 伪造层和真背景取的是同一份字节 ✓ 不会一张模糊前一张模糊后 ✓
   */
  useEffect(() => {
    const img = images[index];
    if (!img) return;
    const r = resolved[img];
    const url = !isRemote(img) ? img : r?.ok && r.src ? r.src : r ? img : '';
    if (!url) return;
    document.documentElement.style.setProperty('--bg-now', `url(${url})`);
  }, [index, resolved, images]);

  return (
    <div className="absolute inset-0 z-[-10] overflow-hidden">
      {images.slice(0, loadedCount).map((img, i) => {
        const r = resolved[img];
        // 站外图床：等原图字节到手才画 —— 否则 CSS 会自己发一次"必然要回源确认"的请求，
        // 那正是要避免的浪费。真取不到（跨域被拒/离线）就退回原始链接，行为与以前一致。
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
              // 当前显示的图片 opacity 为 1，其他的为 0
              opacity: i === index ? 1 : 0,
              // 解决层级重叠导致的渲染压力
              visibility: Math.abs(i - index) <= 1 || (i === images.length - 1 && index === 0) ? 'visible' : 'hidden'
            }}
          />
        );
      })}
    </div>
  );
}
