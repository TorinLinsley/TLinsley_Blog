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
// 🩹 首页卡片摘要是**纯文本**，markdown 标记（**加粗** 等）会连着符号露出来 —— 先去标记
import { stripInlineMarkdown } from '../lib/repairMarkdown';
import { HomeResourcesCard, HomeToolsCard, readHomeTools } from '../components/HomeQuickCards';
import { projectsData } from '../data/projects';
import LyricBar from '../components/LyricBar';
import { ToastProvider } from '../components/ToastProvider';

import LatestPostsCarousel from '../components/LatestPostsCarousel';
import LatestChatterCarousel from '../components/LatestChatterCarousel';
import DanmakuBackground from '../components/DanmakuBackground';

// 内容会随时变化（控制台里写完就落盘），按请求实时读取，别在构建时定死 —— 和博客前台那一份保持一致
// ⚡ 改成 ISR（静态化 + 30 秒刷新）——只对**只读**页面这么干 ✓
//   以前 force-dynamic → 每次切页都要服务端现渲染（实测首字节 1.155 秒 ✗）而且无法预取 ✗
//   现在静态化 → 悬停预取 ✓ 切页几乎瞬开 ✓
//   内容更新最多延迟 30 秒 ✓（看数据够用 ✓）
//   ⚠️ 编辑页（posts/[slug]、chatter/[slug]）**故意保持动态** ✗ 那里必须永远看到最新数据 ✓
export const revalidate = 30;

/**
 * 📁 递归收集「资源分享」里的文件，给首页搜索框用（要能按**文件名**搜到）。
 * 用 frontmatter 的 title 当标题，取不到就退回文件名（和资源页列表的显示规则一致）。
 *
 * ⚠️ 控制台的资源根目录是 `resources/ResShare`（博客前台那份同步出去时会把 ResShare 里的内容
 *    铺到 resources/ 下，所以两边算出来的相对路径是一样的，搜索结果的链接都能用）。
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
  // 🖼️ 相册按请求读文件（不是构建时 import 进来的那份），更新本地/同步完刷新就生效
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

            {/* 📱 卡片顺序和博客前台**完全一致**（手机端用 order-N 排）：
                名片 1 / 文章 3 / 照片墙 4 / 说说 5 / 播放器 6 / 歌词 7 / 数据面板 8；
                主题切换卡片小屏不显示（导航栏上已经有了）。
                大屏的嵌套布局原样保留：lg 以上走 home-right-col / home-sub-grid 这两层。 */}
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

              {/* ① 个人名片（手机 1 / 大屏 1） */}
              <div data-card="profile" className="order-1 lg:order-1 lg:col-span-7 flex flex-col">
                <ProfileCard postCount={allPosts.length} chatterCount={chatterCount} photoCount={realPhotoCount}/>
              </div>

              {/* ③ 文章轮播（手机 3 / 大屏 4） */}
              <div data-card="posts" className="order-4 lg:order-6 lg:col-span-4 flex flex-col min-h-[300px]">
                <LatestPostsCarousel posts={top5Posts} />
              </div>

              {/* 右侧那 8 列：大屏是「照片墙 + 说说(+主题)」竖排；小屏打散成 display:contents，让两张卡各自参与外层排序 */}
              <div className="home-right-col lg:order-7 lg:col-span-8">

                {/* ④ 照片墙大海报（手机 4） */}
                <Link href="/photowall" data-card="wall" className="order-5 lg:order-1 block w-full rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden transition-all duration-700 hover:scale-[1.02] relative group min-h-[200px] sm:min-h-[220px] shrink-0">
                  <img src={latestAlbum.cover || undefined} className="w-full h-full absolute inset-0 object-cover transition-transform duration-700 group-hover:scale-105 opacity-90"/>
                  <div className="absolute inset-0 bg-black/20 dark:bg-black/50 group-hover:bg-transparent transition-colors duration-500"></div>
                  <div className="absolute bottom-6 left-6 right-6">
                    <h3 className="text-3xl font-bold text-white mb-2 underline decoration-pink-400">{latestAlbum.title}</h3>
                    <p className="text-white/90 text-lg line-clamp-1">{latestAlbum.description}</p>
                  </div>
                </Link>

                <div className="home-sub-grid lg:order-2 lg:flex-1">

                  {/* ⑤ 说说轮播（手机 5） */}
                  <div data-card="chatter" className="order-6 lg:order-1 lg:col-span-2 flex flex-col min-h-[200px]">
                    <LatestChatterCarousel chatters={top5Chatters} />
                  </div>

                  {/* 主题切换卡片：大屏保留（说说右边），📱 小屏隐藏 —— 导航栏上已经有那个按钮了 */}
                  <div data-card="theme" className="hidden lg:flex lg:order-2 lg:col-span-1 flex-col min-h-[120px]">
                    <ThemeToggleBlock />
                  </div>
                </div>
              </div>

              {/* ⑥ 音乐播放器（手机 6 / 大屏 2） */}
              <div data-card="player" className="order-7 lg:order-2 lg:col-span-5 flex flex-col">
                <CloudPlayer/>
              </div>

              {/* ⑦ 歌词栏（手机 7 / 大屏 3） */}
              <div data-card="lyric" className="order-8 lg:order-3 lg:col-span-12 mt-[-10px] w-full"><LyricBar/></div>

              {/* 资源分享 + 工具（大屏各占一半，**紧跟歌词条下方**；手机顺序不变，排在文章卡片上面） */}
              <div data-card="home-resources" className="order-2 lg:order-4 lg:col-span-6 flex flex-col">
                <HomeResourcesCard />
              </div>
              <div data-card="home-tools" className="order-3 lg:order-5 lg:col-span-6 flex flex-col">
                <HomeToolsCard tools={readHomeTools()} />
              </div>

              {/* ⑧ 底部数据面板（手机 8 / 大屏 8）；
                  小屏粘在视口底部悬浮，滑到页面最底自动回到正常位置，大屏 lg:static 恢复普通流 */}
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