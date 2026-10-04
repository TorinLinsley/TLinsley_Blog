import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Link from 'next/link';

import Navbar from '../components/Navbar';
import PageTransition from '../components/PageTransition';
import SearchBar from '../components/SearchBar';
import { siteConfig } from '../siteConfig';
import CloudPlayer from '../components/CloudPlayer';
import ThemeToggleBlock from '../components/ThemeToggleBlock';
import ProfileCard from '../components/ProfileCard';
import SiteDashboard from '../components/SiteDashboard';
import { readAlbums } from '../lib/readAlbums';
// 🩹 首页卡片摘要是**纯文本**，markdown 标记（**加粗** 等）会连着符号露出来 —— 先去标记
import { stripInlineMarkdown } from '../lib/repairMarkdown';
import { HomeResourcesCard, HomeToolsCard, readHomeTools } from '../components/HomeQuickCards';
import { projectsData } from '../data/projects';
import LyricBar from '../components/LyricBar';
import { ToastProvider } from '../components/ToastProvider';

import LatestPostsCarousel from '../components/LatestPostsCarousel';
import LatestChatterCarousel from '../components/LatestChatterCarousel';
import DanmakuBackground from '../components/DanmakuBackground';

// 内容会随时变化（控制台改完自动同步过来），按请求实时读取，别在构建时定死
export const dynamic = 'force-dynamic';

/**
 * 📁 递归收集「资源分享」里的文件，给首页搜索框用（要能按**文件名**搜到）。
 * 用 frontmatter 的 title 当标题，取不到就退回文件名（和资源页列表的显示规则一致）。
 */
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
    if (name.startsWith('.')) continue;   // .trash_log.json 这类隐藏文件跳过
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
      } catch { /* 读不动就当没标题 */ }
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
  // 🖼️ 相册按请求读文件（不是构建时 import 进来的那份），同步完刷新就生效
  const albums = readAlbums();
  const realPhotoCount = albums.reduce((total, album) => total + album.photos.length, 0);
  const latestAlbum = albums.length > 0 ? albums[0] : { id: '', title: '照片墙', description: '查看摄影', cover: siteConfig.photoWallImage, date: '' };

  return (
    <ToastProvider>
      <div className="min-h-screen relative pb-10">
        <Navbar />
        <PageTransition>
          {/* 🌟 调整整体容器的内边距，适应手机端更小的屏幕 */}
          <div className="w-full max-w-6xl mx-auto mt-24 sm:mt-28 px-4 sm:px-6 lg:px-10 relative z-10">
            <SearchBar
          posts={allPosts}
          resources={collectResourceFiles(path.join(process.cwd(), 'resources'))}
          projects={projectsData}
        />

            {/*
              🌟 一个网格管两套排布，两端都用「显式 order」写清楚，不靠 order-none 复位：
                 · 大屏（lg ≥1024px）＝ 原来的布局：
                   ① 个人名片  ② 音乐播放器  ③ 歌词栏  ④ 文章  ⑤ 照片墙  ⑥ 说说  ⑦ 底部数据
                 · 小屏 / 手机 ＝ 单列垂直，从上到下：
                   1 个人名片 → 2（待补的新卡片）→ 3 文章 → 4 照片墙
                   → 5 说说 → 6 音乐 → 7 歌词栏 → 8 底部数据
            */}
            {/*
              🌟 大屏保持原来的嵌套容器（照片墙 + 说说 竖排，说说按 2:1 分列），
                 小屏把容器打散成 display:contents，让照片墙/说说各自参与外层排序。
                 这里用内联 <style> + !important，避免被 Tailwind 的工具类顺序压掉。
            */}
            <style>{`
              @media (min-width: 1024px) {
                .home-right-col { display: flex !important; flex-direction: column; gap: 1.5rem; }
                .home-sub-grid { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; }
              }
              @media (max-width: 1023.98px) {
                .home-right-col, .home-sub-grid { display: contents !important; }
              }
            `}</style>

            <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mt-6">

              {/* ① 个人名片（手机第 1 位） */}
              <div data-card="profile" className="order-1 lg:order-1 lg:col-span-7 flex flex-col">
                <ProfileCard postCount={allPosts.length} chatterCount={chatterCount} photoCount={realPhotoCount}/>
              </div>

              {/* ② 这里是你说的「要单独加一个卡片」的位置（内容待定） */}

              {/* ③ 文章轮播（手机第 3 位、大屏第 4 位） */}
              <div data-card="posts" className="order-4 lg:order-6 lg:col-span-4 flex flex-col min-h-[300px]">
                <LatestPostsCarousel posts={top5Posts} />
              </div>

              {/*
                右侧那 8 列：大屏时是原来的「照片墙 + 说说（+主题）」竖排容器，
                小屏用 home-right-col 这个自定义类把它打散（display:contents），
                让照片墙、说说能各自参与外层排序。
              */}
              <div className="home-right-col lg:order-7 lg:col-span-8">

                {/* ④ 照片墙大海报（手机第 4 位）—— 固定矮个子，不跟着文章卡片拉伸 */}
                <Link href="/photowall" data-card="wall" className="order-5 lg:order-1 block w-full rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden transition-all duration-700 hover:scale-[1.02] relative group min-h-[200px] sm:min-h-[220px] shrink-0">
                  <img src={latestAlbum.cover || undefined} className="w-full h-full absolute inset-0 object-cover transition-transform duration-700 group-hover:scale-105 opacity-90"/>
                  <div className="absolute inset-0 bg-black/30 dark:bg-black/50 group-hover:bg-black/10 transition-colors duration-500"></div>
                  <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 right-6">
                    <h3 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2 underline decoration-pink-400">{latestAlbum.title}</h3>
                    <p className="text-white/90 text-sm sm:text-lg line-clamp-1">{latestAlbum.description}</p>
                  </div>
                </Link>

                {/* 说说 + 主题：大屏时按 2 : 1 分这 8 列 */}
                <div className="home-sub-grid lg:order-2 lg:flex-1">

                  {/* ⑤ 说说轮播（手机第 5 位） */}
                  <div data-card="chatter" className="order-6 lg:order-1 lg:col-span-2 flex flex-col min-h-[200px]">
                    <LatestChatterCarousel chatters={top5Chatters} />
                  </div>

                  {/* 主题切换卡片：大屏保留原来的位置（说说右边），小屏隐藏（在导航栏上） */}
                  <div data-card="theme" className="hidden lg:flex lg:order-2 lg:col-span-1 flex-col min-h-[120px]">
                    <ThemeToggleBlock />
                  </div>
                </div>
              </div>

              {/* ⑥ 音乐播放器（手机第 6 位、大屏第 2 位） */}
              <div data-card="player" className="order-7 lg:order-2 lg:col-span-5 flex flex-col">
                <CloudPlayer/>
              </div>

              {/* ⑦ 歌词栏（手机第 7 位、大屏第 3 位） */}
              <div data-card="lyric" className="order-8 lg:order-3 lg:col-span-12 mt-[-10px] w-full"><LyricBar/></div>

              {/* ⑨⑩ 资源分享 + 工具（大屏：各占一半，**紧跟歌词条下方**；手机：排在文章卡片上面）
                  手机顺序按要求是「资源分享 → 工具 → 归档(文章)」，所以下面几张卡片的
                  order 顺延了一档（文章 3→4、照片墙 4→5、说说 5→6、音乐 6→7、歌词 7→8、数据 8→9）。 */}
              <div data-card="home-resources" className="order-2 lg:order-4 lg:col-span-6 flex flex-col">
                <HomeResourcesCard />
              </div>
              <div data-card="home-tools" className="order-3 lg:order-5 lg:col-span-6 flex flex-col">
                <HomeToolsCard tools={readHomeTools()} />
              </div>

              {/* ⑧ 底部数据面板
                  小屏：stickyt 粘在视口底部悬浮（往上滑一直看得见），滑到页面最底时
                        自动回到它在文档流里的正常位置，不会一直挡着；
                  大屏：同样悬浮底部（1080p/4K 一屏装不下时也一直看得见）。 */}
              {/* ⑧ 底部数据面板（时间条）
                  全尺寸统一：**没滚到它的时候悬浮固定在视口底部**（sticky bottom-0），
                  滚到页面底部 / 一屏就能装下全部卡片时，它自然回到文档流里的正常位置。 */}
              <div
                data-card="dashboard"
                className="order-9 lg:order-8 lg:col-span-12 w-full mt-4 sticky bottom-0 z-30"
              >
                <SiteDashboard/>
              </div>
            </main>
          </div>
        </PageTransition>
      </div>
    </ToastProvider>
  );
}