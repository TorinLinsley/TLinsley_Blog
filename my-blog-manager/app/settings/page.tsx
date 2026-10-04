"use client";

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOperations } from '../../context/OperationContext';
import { siteConfig } from '../../siteConfig';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { ToastProvider, useToast } from '../../components/ToastProvider';
import { registerLayer } from '../../components/layerStack';

import ProfileSection from '../../components/settings/ProfileSection';
import BackgroundSection from '../../components/settings/BackgroundSection';
import MusicSection from '../../components/settings/MusicSection';
import GallerySection from '../../components/settings/GallerySection';
import RepoSection from '../../components/settings/RepoSection';
import DisplaySection from '../../components/settings/DisplaySection';
import CommentSection from '../../components/settings/CommentSection';
import DanmakuSection from '../../components/settings/DanmakuSection';
import FooterSection from '../../components/settings/FooterSection';
// 👇 🌟 引入刚写的 AI 配置组件
import AICatSection from '../../components/settings/AICatSection';

/** 小屏导航栏高度 / 按钮行高度：和 Navbar、MobileToc 用同一套值 */
const NAV_H = '3.25rem';
const TOOL_ROW_H = '2.75rem';

/** 两张图标常驻、只切换显隐（和博客「大纲」那个小按钮同款：切换是瞬间的，不会先闪一下空白） */
function MenuIcon({ open }: { open: boolean }) {
  const mask = (src: string) => ({
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  });
  return (
    <>
      <span aria-hidden className={`absolute inset-0 m-auto w-4 h-4 bg-slate-800 dark:bg-slate-100 ${open ? 'opacity-0' : 'opacity-100'}`} style={mask('/menu.svg')} />
      <span aria-hidden className={`absolute inset-0 m-auto w-4 h-4 bg-slate-800 dark:bg-slate-100 ${open ? 'opacity-100' : 'opacity-0'}`} style={mask('/close.svg')} />
    </>
  );
}

function SettingsContent() {
  const { operations, addOperation } = useOperations();
  const [activeTab, setActiveTab] = useState('profile');
  // 📱 手机端专用：设置菜单是否展开（桌面端用不到它，侧栏一直挂着）
  const [menuOpen, setMenuOpen] = useState(false);
  /** 抽屉本体 / 展开按钮：交给 layerStack 判断"这一下该不该收"，顺带挡住"点空白穿透到正文" ✓ */
  const menuDrawerRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  // 抽屉打开时锁住背景滚动（和大纲那边一样）
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // 抽屉开着就登记成一层：点空白只收最上面那层（和资源页/导航栏那套完全一致 ✓）
  useEffect(() => {
    if (!menuOpen) return;
    return registerLayer({
      panel: () => menuDrawerRef.current,
      close: () => setMenuOpen(false),
    });
  }, [menuOpen]);

  const { showToast } = useToast();

  const [formData, setFormData] = useState<any>({
    authorName: siteConfig.authorName || "",
    bio: siteConfig.bio || "",
    avatarUrl: siteConfig.avatarUrl || "",
    social: siteConfig.social || {},
    cloudMusicIds: [...(siteConfig.cloudMusicIds || [])],
    bgImages: [...(siteConfig.bgImages || [])],
    gitalkConfig: siteConfig.gitalkConfig || {
      clientID: '',
      clientSecret: '',
      repo: '',
      owner: '',
      admin: []
    },
    newMusicId: '',
    danmakuList: [...(siteConfig.danmakuList || [])],
    buildDate: siteConfig.buildDate || "2026-03-23T00:00:00",
    icpConfig: siteConfig.icpConfig || { name: "", link: "" },
    footerBadges: [...(siteConfig.footerBadges || [])],
    // 👇 🌟 初始化小猫 AI 配置数据
    geminiConfig: siteConfig.geminiConfig || {
      modelId: 'gemini-2.5-flash-lite',
      systemPrompt: '',
      maxOutputTokens: 150,
      temperature: 0.85
    }
  });

  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<any>(null);
  const [musicDetails, setMusicDetails] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchRealConfig = async () => {
      try {
        const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
        const configData = await configRes.json();

        const res = await fetch(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${configData.api_port}/api/config/get`, { cache: 'no-store' });
        const data = await res.json();

        if (data.success && data.data) {
          console.log("✅ 成功从后端拉取到真实配置:", data.data);
          setFormData((prev: any) => ({
            ...prev,
            ...data.data,
            social: { ...(prev.social || {}), ...(data.data.social || {}) },
            gitalkConfig: { ...(prev.gitalkConfig || {}), ...(data.data.gitalkConfig || {}) },
            danmakuList: data.data.danmakuList ? [...data.data.danmakuList] : prev.danmakuList,
            buildDate: data.data.buildDate || prev.buildDate,
            icpConfig: data.data.icpConfig || prev.icpConfig,
            footerBadges: data.data.footerBadges ? [...data.data.footerBadges] : prev.footerBadges,
            // 👇 🌟 合并后端发来的小猫配置
            geminiConfig: { ...(prev.geminiConfig || {}), ...(data.data.geminiConfig || {}) }
          }));
        } else {
          console.error("❌ 后端返回失败:", data.message);
          showToast("读取后端配置失败，当前显示为本地静态数据", "warning");
        }
      } catch (error) {
        console.error("❌ 请求后端配置通道断开:", error);
        showToast("无法连接到 Python 后端服务", "error");
      }
    };

    fetchRealConfig();
  }, []);

  const handleUpdate = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const fetchMusicDetail = async (id: string) => {
    try {
      const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
      const configData = await configRes.json();
      const res = await fetch(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${configData.api_port}/api/music/query/${id}`, { cache: 'no-store' });
      const data = await res.json();
      return data.success ? data.data : { error: true, id, name: "查询失败或无版权" };
    } catch (error) {
      return { error: true, id, name: "后端通信通道断开" };
    }
  };

  useEffect(() => {
    const loadInitialMusicDetails = async () => {
      const details: Record<string, any> = { ...musicDetails };
      let hasUpdate = false;
      for (const id of formData.cloudMusicIds || []) {
        if (!details[id]) {
          const info = await fetchMusicDetail(id);
          if (info) {
            details[id] = info;
            hasUpdate = true;
          }
        }
      }
      if (hasUpdate) setMusicDetails(details);
    };
    if (formData.cloudMusicIds?.length > 0) {
      loadInitialMusicDetails();
    }
  }, [formData.cloudMusicIds]);

  const queryMusic = async () => {
    if (!formData.newMusicId) {
      showToast("ID不能为空哦", "warning");
      return;
    }
    setQueryLoading(true);
    setQueryResult(null);

    const info = await fetchMusicDetail(formData.newMusicId);
    if (info && !info.error) {
      setQueryResult(info);
      showToast("获取成功！", "success");
    } else {
      showToast(info?.name || "未找到该歌曲", "error");
    }
    setQueryLoading(false);
  };

  const removeSong = (index: number) => {
    const newList = [...formData.cloudMusicIds];
    newList.splice(index, 1);
    handleUpdate('cloudMusicIds', newList);
    showToast("已移除一首歌曲", "success");
  };

  const confirmAddMusic = () => {
    if (!queryResult) return;
    const targetId = String(queryResult.id);
    const exists = formData.cloudMusicIds.some((id: string | number) => String(id) === targetId);

    if (exists) {
      showToast(`⚠️ 《${queryResult.name}》已经在列表里啦，不要重复添加！`, "warning");
    } else {
      handleUpdate('cloudMusicIds', [...formData.cloudMusicIds, targetId]);
      setMusicDetails(prev => ({ ...prev, [targetId]: queryResult }));
      setQueryResult(null);
      handleUpdate('newMusicId', '');
      showToast("✅ 成功存入播放列表！", "success");
    }
  };

  const pushToQueue = (label: string, key?: string, value?: any) => {
    addOperation({
      id: Date.now().toString(),
      type: 'CONFIG',
      label: `配置暂存：${label}`,
      description: `修改了系统的 ${label}，等待同步至 my-blog`,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
      payload: formData,
      key: key,
      value: value
    });
    showToast(`🎉 【${label}】已加入右上角操作队列！`, "success");
  };

  // 👇 🌟 在菜单里增加 AI 猫咪入口
  const menuItems = [
    { id: 'profile', name: '个人名片设置', icon: '👤' },
    { id: 'display', name: '视窗画面设置', icon: '🪟' },
    { id: 'background', name: '视觉背景配置', icon: '🌌' },
    { id: 'music', name: '音乐播放设置', icon: '🎵' },
    { id: 'gallery', name: '图库配置管理', icon: '🖼️' },
    { id: 'footer', name: '首页底部设置', icon: '🧩' },
    { id: 'danmaku', name: '全站弹幕设置', icon: '⚡' },
    { id: 'comment', name: '评论系统配置', icon: '💬' },
    { id: 'aicat', name: 'AI 煤球配置', icon: '🐾' }, // 👈 新增的小猫设置
    { id: 'repo', name: '项目仓库设置', icon: '🚀' },
  ];

  return (
    <div className="min-h-screen relative pb-10">
      <Navbar />

      <PageTransition>
        <main className="w-[95%] max-w-7xl mx-auto mt-[7rem] lg:mt-24 flex flex-col lg:flex-row gap-4 lg:gap-8 items-start relative z-10">

          {/* ═══════════ 📱 手机端菜单（<768px）：和「大纲」那套一模一样 ═══════════
              导航栏正下方一行放一个方形小按钮（靠左）；点它从**左侧**滑出抽屉，
              点遮罩收回。桌面端不渲染这一块，桌面走下面那栏常驻侧栏。 */}
          <div
            className="lg:hidden fixed left-0 right-0 z-40 flex items-center justify-start px-3"
            style={{ top: NAV_H, height: TOOL_ROW_H }}
          >
            <button
              type="button"
              ref={menuButtonRef}
              aria-label={menuOpen ? '收起设置菜单' : '展开设置菜单'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg"
            >
              <MenuIcon open={menuOpen} />
            </button>
          </div>

          <AnimatePresence mode="wait">
            {menuOpen && (
              <>
                <motion.div
                  key="settings-mask"
                  onClick={() => setMenuOpen(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, pointerEvents: 'none' }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="lg:hidden fixed left-0 right-0 bottom-0 z-[45] bg-slate-900/50 dark:bg-black/65 backdrop-blur-[2px]"
                  style={{ top: NAV_H }}
                />

                <motion.aside
                  key="settings-drawer"
                  ref={menuDrawerRef}
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%', pointerEvents: 'none' }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.6 }}
                  className="lg:hidden fixed left-0 bottom-0 z-50 w-[77.9%] max-w-[323px] flex flex-col bg-white/90 dark:bg-slate-900/95 backdrop-blur-2xl shadow-2xl border-r border-white/40 dark:border-white/10"
                  style={{ top: NAV_H }}
                >
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1 ml-2 tracking-widest">系统管理维度</p>

                    {menuItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id); setMenuOpen(false); }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-left font-bold text-[15px] transition-colors duration-200 ${activeTab === item.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70'}`}
                      >
                        <span className="shrink-0">{item.icon}</span>{item.name}
                      </button>
                    ))}
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>

          {/* ═══════════ 💻 桌面端侧栏（≥768px）：原来那一套，原样保留 ═══════════ */}
          <div className="hidden lg:flex lg:w-72 shrink-0 flex-col gap-4">
            <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 rounded-3xl p-4 shadow-xl">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-4 ml-2 tracking-widest">系统管理维度</p>
              <nav className="flex flex-col gap-2">
                {menuItems.map((item) => (
                  <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 font-bold text-sm ${activeTab === item.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 translate-x-1' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>
                    <span>{item.icon}</span>{item.name}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="flex-1 w-full">
            <AnimatePresence mode="wait">
              {activeTab === 'profile' && <ProfileSection key="profile" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'display' && <DisplaySection key="display" />}
              {activeTab === 'background' && <BackgroundSection key="background" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'music' && <MusicSection key="music" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} musicDetails={musicDetails} queryMusic={queryMusic} queryLoading={queryLoading} queryResult={queryResult} confirmAddMusic={confirmAddMusic} removeSong={removeSong} />}
              {activeTab === 'gallery' && <GallerySection key="gallery" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'footer' && <FooterSection key="footer" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'danmaku' && <DanmakuSection key="danmaku" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'comment' && <CommentSection key="comment" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {/* 👇 🌟 挂载 AI 猫咪面板 */}
              {activeTab === 'aicat' && <AICatSection key="aicat" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}

              {activeTab === 'repo' && <RepoSection key="repo" />}
            </AnimatePresence>
          </div>

        </main>
      </PageTransition>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ToastProvider>
      <SettingsContent />
    </ToastProvider>
  );
}