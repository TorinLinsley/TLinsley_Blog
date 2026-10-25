"use client";

import React from 'react';

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