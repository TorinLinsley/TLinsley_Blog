"use client";

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../ToastProvider';
import { siteConfig } from '../../siteConfig';
import Tooltip from '../Tooltip';

interface FloatingImageToolProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (url: string) => void;
}

export default function FloatingImageTool({ isOpen, onClose, onInsert }: FloatingImageToolProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'local' | 'gallery'>('upload'); // 🌟 新增：切换状态
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [externalUrl, setExternalUrl] = useState(''); // 🌟 新增：外链输入状态
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null); // 🖥️ 本地图片选择框
  // 🖼️ 「服务器图库」页签：列出博客 public/uploads 里**已经有**的图片，点一张就能插进正文
  const [galleryFiles, setGalleryFiles] = useState<{ name: string; url: string; size: number; mtime: number }[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryQuery, setGalleryQuery] = useState('');

  // 🖼️ 拉服务器图库列表（= 博客项目 public/uploads 目录）
  const loadGallery = async () => {
    setGalleryLoading(true);
    try {
      const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
      const configData = await configRes.json();
      const res = await fetch(
        `http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${configData.api_port}/api/picbed/local_list`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (data.success) {
        setGalleryFiles(data.files || []);
      } else {
        showToast(data.message || '读取图库失败', 'error');
      }
    } catch (e: any) {
      showToast(`读取图库失败: ${e.message}`, 'error');
    } finally {
      setGalleryLoading(false);
    }
  };

  // 每次切到「服务器图库」都重新拉一遍 —— 你刚传上去的图马上就能看到
  useEffect(() => {
    if (isOpen && activeTab === 'gallery') void loadGallery();
  }, [isOpen, activeTab]);

  // 处理文件上传逻辑 (保持不变)
  const handleFileUpload = async (file: File) => {
    const picUrl = (siteConfig as any).picBedUrl || "https://pic.dusays.com";
    const picToken = (siteConfig as any).picBedToken;

    if (!picToken) {
      showToast("未配置图床 Token！", "error");
      return;
    }

    setIsUploading(true);
    showToast("正在将图片传送至云端...", "success");

    try {
      const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
      const configData = await configRes.json();
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('url', picUrl);
      uploadData.append('token', picToken);

      const res = await fetch(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${configData.api_port}/api/picbed/upload`, {
        method: 'POST',
        body: uploadData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        setUploadedUrl(data.url);
        showToast("✅ 上传成功！", "success");
      } else {
        showToast(`上传失败: ${data.message || '未知错误'}`, "error");
      }
    } catch (error: any) {
      showToast(`连接异常: ${error.message}`, "error");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 🖥️ 本地图片：直接存进博客项目的 public/uploads，不需要图床
  const handleLocalUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast("只能上传图片文件哦！", "warning");
      return;
    }

    setIsUploading(true);
    showToast("正在保存到博客本地目录...", "success");

    try {
      const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
      const configData = await configRes.json();
      const uploadData = new FormData();
      uploadData.append('file', file);

      const res = await fetch(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${configData.api_port}/api/picbed/upload_local`, {
        method: 'POST',
        body: uploadData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        setUploadedUrl(data.url);
        showToast("✅ 已存入本地图库！", "success");
      } else {
        showToast(`保存失败: ${data.message || '未知错误'}`, "error");
      }
    } catch (error: any) {
      showToast(`连接异常: ${error.message}`, "error");
    } finally {
      setIsUploading(false);
      if (localFileInputRef.current) localFileInputRef.current.value = '';
    }
  };

  const handleLocalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleLocalUpload(e.dataTransfer.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
  };

  // 🌟 新增：验证并确认外链图片
  const handleConfirmExternalUrl = () => {
    if (!externalUrl.trim()) {
      showToast("请输入有效的图片 URL", "warning");
      return;
    }
    if (!externalUrl.match(/\.(jpeg|jpg|gif|png|webp|svg|avif)$|^data:image/i)) {
        showToast("这似乎不是一个标准的图片链接，但仍尝试预览", "warning");
    }
    setUploadedUrl(externalUrl);
    showToast("预览已生成", "success");
  };

  const copyUrlToClipboard = () => {
    if (uploadedUrl) {
      navigator.clipboard.writeText(uploadedUrl);
      showToast("链接已复制到剪贴板！", "success");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0}
          initial={{ opacity: 0, scale: 0.9, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          style={{ position: 'fixed', top: '15vh', right: '5vw', zIndex: 99999 }}
          className="w-80 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl rounded-[32px] shadow-2xl border border-white/50 dark:border-white/10 overflow-hidden flex flex-col cursor-move"
        >
          {/* 标题栏 */}
          <div className="flex justify-between items-center p-5 border-b border-white/30 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span className="text-emerald-500 text-lg">☁️</span> 图床工作台
            </h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/50 dark:bg-slate-700/50 flex items-center justify-center text-slate-500 hover:bg-red-500 hover:text-white transition-all cursor-pointer shadow-sm">✕</button>
          </div>

          <div className="p-6 cursor-default bg-white/20 dark:bg-slate-900/20">
            {/* 🌟 模式切换 Tab */}
            {!uploadedUrl && (
              <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-2xl mb-5 gap-0.5">
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`flex-1 min-w-0 py-2 text-[10px] font-bold rounded-xl transition-all ${activeTab === 'upload' ? 'bg-white dark:bg-slate-700 text-emerald-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  云端图床
                </button>
                <button
                  onClick={() => setActiveTab('url')}
                  className={`flex-1 min-w-0 py-2 text-[10px] font-bold rounded-xl transition-all ${activeTab === 'url' ? 'bg-white dark:bg-slate-700 text-emerald-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  外链
                </button>
                <button
                  onClick={() => setActiveTab('local')}
                  className={`flex-1 min-w-0 py-2 text-[10px] font-bold rounded-xl transition-all ${activeTab === 'local' ? 'bg-white dark:bg-slate-700 text-emerald-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  本地上传
                </button>
                <Tooltip label="挑一张服务器 public/uploads 里已有的图片" className="flex-1 min-w-0 inline-flex">
                  <button
                    onClick={() => setActiveTab('gallery')}
                    className={`flex-1 min-w-0 py-2 text-[10px] font-bold rounded-xl transition-all ${activeTab === 'gallery' ? 'bg-white dark:bg-slate-700 text-emerald-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    服务器图库
                  </button>
                </Tooltip>
              </div>
            )}

            {!uploadedUrl ? (
              activeTab === 'upload' ? (
                // 模式 A：上传拖拽区
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full h-36 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all shadow-inner ${isDragging ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-900/40' : 'border-slate-300/80 dark:border-slate-600/80 hover:bg-white/60 dark:hover:bg-slate-800/60'}`}
                >
                  <input type="file" ref={fileInputRef} onChange={e => e.target.files && handleFileUpload(e.target.files[0])} accept="image/*" className="hidden" />
                  <div className="text-4xl drop-shadow-sm">{isUploading ? '⏳' : '📥'}</div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{isUploading ? '正在极速上传...' : '点击或拖拽图片'}</p>
                  </div>
                </div>
              ) : activeTab === 'local' ? (
                // 🖥️ 模式 C：本地图片（存进博客 public/uploads，不用图床）
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleLocalDrop}
                  onClick={() => !isUploading && localFileInputRef.current?.click()}
                  className={`w-full h-36 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all shadow-inner ${isDragging ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-900/40' : 'border-slate-300/80 dark:border-slate-600/80 hover:bg-white/60 dark:hover:bg-slate-800/60'}`}
                >
                  <input type="file" ref={localFileInputRef} onChange={e => e.target.files && handleLocalUpload(e.target.files[0])} accept="image/*" className="hidden" />
                  <div className="text-4xl drop-shadow-sm">{isUploading ? '⏳' : '🖥️'}</div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{isUploading ? '正在保存到本地...' : '点击或拖拽图片'}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">存入博客 public/uploads</p>
                  </div>
                </div>
              ) : activeTab === 'gallery' ? (
                // 🖼️ 模式 D：服务器图库 —— 挑一张服务器 public/uploads 里已有的图片
                <div className="w-full flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      value={galleryQuery}
                      onChange={(e) => setGalleryQuery(e.target.value)}
                      placeholder="筛选文件名…"
                      className="flex-1 min-w-0 px-3 py-2 text-xs bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 dark:text-slate-200"
                    />
                    {/* ⚠️ 用页面自己的气泡，别用原生 title（延迟长、灰底方块，和主题不搭）。
                        className 交给外层锚点，shrink-0 这类布局类不能丢，否则会被挤变形 */}
                    <Tooltip label="刷新（刚传上去的图点这里就能看到）" className="shrink-0 inline-flex">
                      <button
                        onClick={() => void loadGallery()}
                        className="px-3 rounded-xl bg-white/60 dark:bg-slate-800/60 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-all shrink-0"
                      >
                        ⟳
                      </button>
                    </Tooltip>
                  </div>

                  {galleryLoading ? (
                    <p className="text-xs text-slate-400 text-center py-8">正在读取图库…</p>
                  ) : galleryFiles.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">图库里还没有图片</p>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        把图片放进服务器的<br />public/uploads 目录，再点上面的 ⟳
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="max-h-56 overflow-y-auto custom-scrollbar grid grid-cols-3 gap-2 pr-1">
                        {galleryFiles
                          .filter((f) => f.name.toLowerCase().includes(galleryQuery.trim().toLowerCase()))
                          .map((f) => (
                            /* 文件名提示也换成页面自己的气泡：网格子元素得靠 className 保持 aspect-square */
                            <Tooltip key={f.name} label={f.name} className="relative aspect-square">
                              <button
                                type="button"
                                onClick={() => setUploadedUrl(f.url)}
                                className="w-full h-full rounded-xl overflow-hidden border border-white/40 dark:border-slate-700/60 bg-white/40 dark:bg-slate-800/40 hover:ring-2 hover:ring-emerald-500 transition-all"
                              >
                                <img src={f.url || undefined} alt={f.name} loading="lazy" className="w-full h-full object-cover" />
                              </button>
                            </Tooltip>
                          ))}
                      </div>
                      <p className="text-[10px] text-slate-400 text-center">
                        共 {galleryFiles.length} 张 · 点缩略图选中
                      </p>
                    </>
                  )}
                </div>
              ) : (
                // 🌟 模式 B：外链输入区
                <div className="w-full space-y-4">
                  <div className="relative">
                    <textarea
                      value={externalUrl}
                      onChange={(e) => setExternalUrl(e.target.value)}
                      placeholder="粘贴图片链接 (http://...)"
                      className="w-full h-24 p-4 text-xs font-medium bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none text-slate-700 dark:text-slate-200"
                    />
                  </div>
                  <button
                    onClick={handleConfirmExternalUrl}
                    className="w-full py-3 bg-slate-800 dark:bg-white dark:text-slate-900 text-white rounded-xl text-xs font-black shadow-lg hover:opacity-90 transition-all active:scale-95"
                  >
                    确认图片链接
                  </button>
                </div>
              )
            ) : (
              // 预览与确认插入区
              <div className="flex flex-col gap-4">
                <div className="w-full h-36 rounded-2xl overflow-hidden bg-white/50 dark:bg-slate-950/50 border border-white/40 dark:border-slate-700/50 flex items-center justify-center p-2 shadow-inner group relative">
                  <img src={uploadedUrl || undefined} alt="preview" className="max-w-full max-h-full object-contain rounded-xl drop-shadow-md" />
                  {/* 🌟 重新选择按钮 */}
                  <button
                    onClick={() => { setUploadedUrl(''); setExternalUrl(''); }}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold"
                  >
                    重新选择
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={copyUrlToClipboard} className="py-2.5 rounded-xl bg-white/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm">🔗 复制链接</button>
                  <button onClick={() => { onInsert(uploadedUrl); setUploadedUrl(''); setExternalUrl(''); }} className="py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-teal-600 transition-all active:scale-95">✨ 嵌入正文</button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}