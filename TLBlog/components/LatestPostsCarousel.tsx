"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import FadeInImage from './FadeInImage';

export default function LatestPostsCarousel({ posts }: { posts: any[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (posts.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % posts.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [posts.length]);

  if (!posts || posts.length === 0) return null;

  const currentPost = posts[currentIndex];

  return (
    <div className="md:col-span-4 rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden relative group min-h-[420px] h-full flex flex-col">

      <Link href={currentPost.slug === 'none' ? '#' : `/posts/${currentPost.slug}`} className="absolute inset-0 z-20" aria-label={`阅读 ${currentPost.title}`} />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentPost.slug}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 z-0"
        >
          <FadeInImage wrapperClassName="h-full w-full" src={currentPost.cover || undefined} className="w-full h-full object-cover opacity-90 transition-transform duration-1000 group-hover:scale-105" alt={currentPost.title} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"></div>
        </motion.div>
      </AnimatePresence>

      <div className="relative z-10 flex flex-col justify-end p-6 w-full mt-auto h-full pointer-events-none">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-3 py-1 bg-indigo-500/80 backdrop-blur-lg rounded-full text-[10px] text-white font-black uppercase tracking-widest shadow-lg">Latest Insight</span>
          {currentPost.formattedDate && (
            <span className="px-2 py-1 bg-black/40 backdrop-blur-md border border-white/20 rounded-full text-[10px] text-white/90 font-mono tracking-wider">
              <i className="ri-time-line mr-1"></i>{currentPost.formattedDate}
            </span>
          )}
        </div>
        <h2 className="text-2xl font-bold text-white mb-2 group-hover:-translate-y-1 transition-transform drop-shadow-md">{currentPost.title}</h2>
        <p className="text-sm text-gray-300 line-clamp-3 drop-shadow-sm mb-6">{currentPost.description}</p>
      </div>

      {posts.length > 1 && (
        <div className="absolute bottom-4 right-6 z-30 flex gap-2">
          {posts.map((_, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(i);
              }}
              className={`h-1.5 rounded-full transition-all duration-500 ${i === currentIndex ? 'w-6 bg-indigo-400' : 'w-2 bg-white/40 hover:bg-white/80'}`}
              aria-label={`切换到第 ${i + 1} 篇文章`}
            />
          ))}
        </div>
      )}
    </div>
  );
}