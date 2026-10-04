"use client";
import { useState, useEffect } from 'react';
import { siteConfig } from '../siteConfig';

export default function BackgroundSlider() {
  const [index, setIndex] = useState(0);
  /**
   * 🚀 首屏只挂第 1 张，其余延后加载 —— **不碰图片本身、画质零损失**。
   * 原来三张一起挂，浏览器首屏就得下满 3.34 MB（2.1 + 0.24 + 1.06）；
   * 现在首屏只下第 1 张，第 2/3 张等首屏画完再补，而轮播 10 秒才切，补得及。
   */
  const [loadedCount, setLoadedCount] = useState(1);
  const images = siteConfig.bgImages;

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

  return (
    <div className="absolute inset-0 z-[-10] overflow-hidden">
      {images.slice(0, loadedCount).map((img, i) => (
        <div
          key={img}
          className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out transform-gpu"
          style={{
            backgroundImage: `url(${img})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            // 当前显示的图片 opacity 为 1，其他的为 0
            opacity: i === index ? 1 : 0,
            // 解决层级重叠导致的渲染压力
            visibility: Math.abs(i - index) <= 1 || (i === images.length - 1 && index === 0) ? 'visible' : 'hidden'
          }}
        />
      ))}
    </div>
  );
}