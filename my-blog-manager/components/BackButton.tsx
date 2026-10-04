"use client";
import { useRouter } from 'next/navigation';

export default function BackButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      /* 📱 小屏：按钮本身收紧凑一点，下面的内容（标题/工具栏那块）紧贴着它的底边 ——
         原来 mb-8 在小屏会空出一大截。大屏保持原样。 */
      className="inline-flex items-center gap-2 text-sm max-lg:text-[11px] font-bold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-all duration-300 group mb-8 max-lg:mb-3 max-lg:px-3 max-lg:py-1.5 bg-white/50 dark:bg-slate-800/50 px-4 py-2 rounded-full w-max shadow-sm cursor-pointer outline-none"
    >
      <svg className="w-4 h-4 transform transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      返回上一级
    </button>
  );
}