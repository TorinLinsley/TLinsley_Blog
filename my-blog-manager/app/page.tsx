import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Link from 'next/link';

import PageTransition from '../components/PageTransition';
import SearchBar from '../components/SearchBar';
import { siteConfig } from '../siteConfig';
import CloudPlayer from '../components/CloudPlayer';
import ThemeToggleBlock from '../components/ThemeToggleBlock';
import ProfileCard from '../components/ProfileCard';
import SiteDashboard from '../components/SiteDashboard';
import { readAlbums } from '../lib/readAlbums';
import { stripInlineMarkdown } from '../lib/repairMarkdown';
import { HomeResourcesCard, HomeToolsCard, readHomeTools } from '../components/HomeQuickCards';
import { projectsData } from '../data/projects';
import LyricBar from '../components/LyricBar';
import { ToastProvider } from '../components/ToastProvider';

import LatestPostsCarousel from '../components/LatestPostsCarousel';
import LatestChatterCarousel from '../components/LatestChatterCarousel';
import DanmakuBackground from '../components/DanmakuBackground';

export const revalidate = 30;

function collectResourceFiles(dir: string, prefix = ''): { title: string; path: string; fileName: string; folder: string }[] {
  const out: { title: string; path: string; fileName: string; folder: string }[] = [];
  let names: string[] = [];
  try {
    if (!fs.existsSync(dir)) return out;
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    let isDir = false;
    try {
      isDir = fs.statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      out.push(...collectResourceFiles(full, rel));
    } else if (name.toLowerCase().endsWith('.md')) {
      let title = '';
      try {
        title = String(matter(fs.readFileSync(full, 'utf8')).data.title || '');
      } catch {  }
      out.push({ title: title || name.replace(/\.md$/i, ''), path: rel, fileName: name, folder: prefix });
    }
  }
  return out;
}

function formatUpdateTime(dateString: string) {
  if (!dateString || dateString === '1970-01-01') return '刚刚更新';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    if (hours === '00' && mins === '00') return `${year}.${month}.${day}`;
    return `${year}.${month}.${day} ${hours}:${mins}`;
  } catch { return dateString; }
}

export default function Home() {
  const postsDirectory = path.join(process.cwd(), 'posts');
  let allPosts: any[] = [];
  try {
    if (fs.existsSync(postsDirectory)) {
      const fileNames = fs.readdirSync(postsDirectory).filter(f => f.endsWith('.md'));
      allPosts = fileNames.map(fileName => {
        const fullPath = path.join(postsDirectory, fileName);
        const { data, content } = matter(fs.readFileSync(fullPath, 'utf8'));
        const rawDate = data.date || '1970-01-01';
        return {
          slug: fileName.replace(/\.md$/, ''),
          ...data,
          cover: data.cover || siteConfig.defaultPostCover,
          title: data.title || '',
          description: data.description || '',
          content: content || '',
          date: rawDate,
          formattedDate: formatUpdateTime(rawDate)
        };
      }).sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return b.slug.localeCompare(a.slug);
      });
    }
  } catch (e) {}
  const top5Posts = allPosts.length > 0 ? allPosts.slice(0, 5) : [{ slug: 'none', title: '暂无文章', description: '快去写第一篇吧！', cover: siteConfig.defaultPostCover, date: '', formattedDate: '' }];

  const chattersDirectory = path.join(process.cwd(), 'chatters');
  let allChatters: any[] = [];
  try {
    if (fs.existsSync(chattersDirectory)) {
      const chatterFiles = fs.readdirSync(chattersDirectory).filter(f => f.endsWith('.md'));
      allChatters = chatterFiles.map(fileName => {
        const fullPath = path.join(chattersDirectory, fileName);
        const { data, content } = matter(fs.readFileSync(fullPath, 'utf8'));
        const rawDate = data.date || '1970-01-01';
        const cover = data.cover || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1000&auto=format&fit=crop';
        return { slug: fileName.replace(/\.md$/, ''), title: data.title || '碎片记录', description: data.description || stripInlineMarkdown(content.substring(0, 60)), cover: cover, date: rawDate, formattedDate: formatUpdateTime(rawDate) };
      }).sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return b.slug.localeCompare(a.slug);
      });
    }
  } catch (e) {}
  const top5Chatters = allChatters.length > 0 ? allChatters.slice(0, 5) : [{ slug: 'none', title: '暂无记录', description: '记录一段思绪...', cover: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1000&auto=format&fit=crop', date: '', formattedDate: '' }];

  const chatterCount = allChatters.length;
  const albums = readAlbums();
  const realPhotoCount = albums.reduce((total, album) => total + album.photos.length, 0);
  const latestAlbum = albums.length > 0 ? albums[0] : { id: '', title: '照片墙', description: '查看摄影', cover: siteConfig.photoWallImage, date: '' };

  return (
    <ToastProvider>
      <div className="min-h-screen relative pb-10">
        <PageTransition>
          <div className="w-full max-w-6xl mx-auto mt-28 px-4 sm:px-10 relative z-10">
            <SearchBar
              posts={allPosts}
              resources={collectResourceFiles(path.join(process.cwd(), 'resources', 'ResShare'))}
              projects={projectsData}
            />

            {
}
            <style>{`
              @media (min-width: 1024px) {
                .home-right-col { display: flex !important; flex-direction: column; gap: 1.5rem; }
                .home-sub-grid { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; }
              }
              @media (max-width: 1023.98px) {
                .home-right-col, .home-sub-grid { display: contents !important; }
              }
            `}</style>

            <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">

              <div data-card="profile" className="order-1 lg:order-1 lg:col-span-7 flex flex-col">
                <ProfileCard postCount={allPosts.length} chatterCount={chatterCount} photoCount={realPhotoCount}/>
              </div>

              <div data-card="posts" className="order-4 lg:order-6 lg:col-span-4 flex flex-col min-h-[300px]">
                <LatestPostsCarousel posts={top5Posts} />
              </div>

              <div className="home-right-col lg:order-7 lg:col-span-8">

                <Link href="/photowall" data-card="wall" className="order-5 lg:order-1 block w-full rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden transition-all duration-700 hover:scale-[1.02] relative group min-h-[200px] sm:min-h-[220px] shrink-0">
                  <img src={latestAlbum.cover || undefined} className="w-full h-full absolute inset-0 object-cover transition-transform duration-700 group-hover:scale-105 opacity-90"/>
                  <div className="absolute inset-0 bg-black/20 dark:bg-black/50 group-hover:bg-transparent transition-colors duration-500"></div>
                  <div className="absolute bottom-6 left-6 right-6">
                    <h3 className="text-3xl font-bold text-white mb-2 underline decoration-pink-400">{latestAlbum.title}</h3>
                    <p className="text-white/90 text-lg line-clamp-1">{latestAlbum.description}</p>
                  </div>
                </Link>

                <div className="home-sub-grid lg:order-2 lg:flex-1">

                  <div data-card="chatter" className="order-6 lg:order-1 lg:col-span-2 flex flex-col min-h-[200px]">
                    <LatestChatterCarousel chatters={top5Chatters} />
                  </div>

                  <div data-card="theme" className="hidden lg:flex lg:order-2 lg:col-span-1 flex-col min-h-[120px]">
                    <ThemeToggleBlock />
                  </div>
                </div>
              </div>

              <div data-card="player" className="order-7 lg:order-2 lg:col-span-5 flex flex-col">
                <CloudPlayer/>
              </div>

              <div data-card="lyric" className="order-8 lg:order-3 lg:col-span-12 mt-[-10px] w-full"><LyricBar/></div>

              <div data-card="home-resources" className="order-2 lg:order-4 lg:col-span-6 flex flex-col">
                <HomeResourcesCard />
              </div>
              <div data-card="home-tools" className="order-3 lg:order-5 lg:col-span-6 flex flex-col">
                <HomeToolsCard tools={readHomeTools()} />
              </div>

              {
}
              <div data-card="dashboard" className="order-9 lg:order-8 lg:col-span-12 w-full mt-4 sticky bottom-0 z-30">
                <SiteDashboard/>
              </div>
            </main>
          </div>
        </PageTransition>
      </div>
    </ToastProvider>
  );
}