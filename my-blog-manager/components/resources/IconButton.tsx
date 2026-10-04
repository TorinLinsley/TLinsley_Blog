"use client";

import React from 'react';

/**
 * 🎨 图标按钮
 *
 * 用 CSS mask 实现「不管 SVG 原本什么颜色都能换成主题色」：
 * mask 只取 SVG 的形状（alpha 通道），颜色完全由 background-color 决定。
 *
 * 配色规则（按需求）：
 *   浅色模式 黑色  hover #4f39f6
 *   深色模式 白色  hover #4f39f6
 *   过渡 0.2s（Tailwind 的 duration-200）
 */
export default function IconButton({
  icon,
  title,
  onClick,
  size = 18,
}: {
  icon: string;
  title: string;
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="shrink-0 cursor-pointer bg-black transition-colors duration-200 hover:bg-[#4f39f6] dark:bg-white dark:hover:bg-[#4f39f6]"
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${icon})`,
        maskImage: `url(${icon})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}
