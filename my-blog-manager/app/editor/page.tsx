"use client";

import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import RichTextEditor, { RichTextEditorHandle } from '../../components/editor/RichTextEditor';
import MetaMatrix from '../../components/editor/MetaMatrix';
import FloatingImageTool from '../../components/editor/FloatingImageTool';
import PageTransition from '../../components/PageTransition';
import { ArrowLeft, AlertTriangle, Save, LogOut } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { useOperations } from '../../context/OperationContext';
import { motion, AnimatePresence } from 'framer-motion';

// 🌟 核心修改 1：把原本暴露的主函数改名为 EditorContent（不带 export default）
function EditorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { addOperation } = useOperations();

  const [docType, setDocType] = useState<string>(searchParams.get('type') || 'post');
  const [currentDocId, setCurrentDocId] = useState(
    searchParams.get('type') === 'about' ? 'about' : (searchParams.get('id') || 'new')
  );

  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [cover, setCover] = useState('');
  const [summary, setSummary] = useState('');
  const [mood, setMood] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState('');

  const [historyPostTags, setHistoryPostTags] = useState<string[]>([]);
  const [historyChatterTags, setHistoryChatterTags] = useState<string[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(true);
  const historyMoods = ['开心', '疲惫', '平静', '激动', 'Emo'];

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isImgToolOpen, setIsImgToolOpen] = useState(false);
  const [imgToolTarget, setImgToolTarget] = useState<'editor' | 'cover'>('editor');

  const editorRef = useRef<RichTextEditorHandle>(null);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [exitModalOpen, setExitModalOpen] = useState(false);

  useEffect(() => {
    const fetchTags = async () => {
      setIsLoadingTags(true);
      try {
        const configRes = await fetch(`/backend_config.json`);
        const config = await configRes.json();
        const res = await fetch(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${config.api_port}/api/drafts/all_tags`);
        const data = await res.json();
        if (data.success) {
          setHistoryPostTags(data.postTags || []);
          setHistoryChatterTags(data.chatterTags || []);
        }
      } catch (e) { console.error(e); }
      finally { setIsLoadingTags(false); }
    };
    fetchTags();
  }, []);

  useEffect(() => {
    if (currentDocId !== 'new') {
      const loadDraft = async () => {
        try {
          const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
          const config = await configRes.json();

          const res = await fetch(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${config.api_port}/api/drafts/get`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentDocId, type: docType })
          });

          const data = await res.json();
          if (data.success) {
            if (data.draft.type) setDocType(data.draft.type);
            setDate(data.draft.date || '');
            setTitle(data.draft.type === 'about' ? '关于我' : (data.draft.title || ''));
            setTags(data.draft.tags || []);
            setCover(data.draft.cover || '');
            setSummary(data.draft.description || '');
            setMood(data.draft.mood || '');
            setContent(data.draft.content || '');

            setTimeout(() => setHasUnsavedChanges(false), 500);
            showToast("✅ 已读取本地源数据", "success");
          } else {
             showToast(data.message || "❌ 未找到草稿或原文件", "error");
          }
        } catch (e) { showToast("❌ 读取失败", "error"); }
      };
      loadDraft();
    }
  }, [currentDocId]);

  useEffect(() => {
    if (!isLoadingTags) {
      setHasUnsavedChanges(true);
    }
  }, [title, tags, cover, summary, mood]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setExitModalOpen(true);
    } else {
      router.back();
    }
  };

  const handleSave = async (isPublish: boolean, shouldExitAfterSave: boolean = false) => {
    if (!title.trim() && docType !== 'about') {
      showToast("⚠️ 请填写标题", "warning"); return;
    }
    const payload = {
      id: docType === 'about' ? 'about' : (currentDocId === 'new' ? null : currentDocId),
      type: docType, title, tags, cover, mood, description: summary,
      content: editorRef.current?.getContent() || '',
      date: date || new Date().toISOString().split('T')[0],
      published: isPublish
    };

    if (isPublish) {
      addOperation({
        id: `publish_${Date.now()}`,
        type: "publish_article",
        label: `发布: ${title || '无标题'}`,
        value: payload
      });
      setHasUnsavedChanges(false);
      showToast("🚀 已加入待处理队列！", "info");
      if (shouldExitAfterSave) router.back();
      return;
    }

    setIsSaving(true);
    try {
      const configRes = await fetch(`/backend_config.json`);
      const config = await configRes.json();
      const res = await fetch(`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${config.api_port}/api/drafts/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setLastSaved(new Date().toLocaleTimeString());
        setHasUnsavedChanges(false);
        showToast("💾 草稿已落盘", "success");
        if (shouldExitAfterSave) {
          setExitModalOpen(false);
          router.back();
        }
      }
    } catch (e) { showToast("❌ 保存失败", "error"); }
    finally { setIsSaving(false); }
  };

  // 📱 小屏（<1024px）：外层不再锁 100vh，整页可以纵向滚动（下面两栏各自有确定高度、内部滚动）；
  //    ≥1024px 保持原来的 h-screen + w-screen + overflow-hidden，大屏一个像素都不变
  return (
    <div className="h-screen w-screen overflow-hidden relative max-lg:h-auto max-lg:min-h-screen max-lg:w-full">

      <AnimatePresence>
        {exitModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setExitModalOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-[40px] shadow-2xl border border-white/50 dark:border-white/10 p-10 text-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-yellow-500 to-transparent opacity-50" />
              <div className="w-20 h-20 bg-yellow-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6"><AlertTriangle className="w-10 h-10 text-yellow-500" /></div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">存在未保存的数据</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-8 leading-relaxed">你的研究尚未记录，<br />直接离开将会导致这些数据消散在虚空中。</p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleSave(false, true)}
                  className="w-full py-4 bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 transition-all flex items-center justify-center gap-2"
                >
                  <Save size={16} /> 存为草稿并离开
                </button>
                <div className="flex gap-3">
                  <button onClick={() => setExitModalOpen(false)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">取消</button>
                  <button onClick={() => { setExitModalOpen(false); setHasUnsavedChanges(false); router.back(); }} className="flex-1 py-4 bg-red-500/10 text-red-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2">
                    <LogOut size={16} /> 强行抛弃
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className={hasUnsavedChanges ? "relative z-50 [&_a]:pointer-events-none" : "relative z-50"}>
        {hasUnsavedChanges && (
          <div className="absolute inset-0 z-50 cursor-pointer" onClick={() => setExitModalOpen(true)}></div>
        )}
      </div>

      <PageTransition>
        {/* 📱 只动布局：小屏两栏改竖排、放开固定高度；原来写在 style 里的
            marginTop:144px / height:calc(100vh - 176px) / marginBottom:32px 原样搬到类名上，
            lg（≥1024px）读到的还是这三个原值 */}
        <main className="mx-auto w-[96%] max-w-[1750px] flex flex-row max-lg:flex-col gap-6 relative mt-[144px] max-lg:mt-28 mb-8 max-lg:mb-2 h-[calc(100vh-176px)] max-lg:h-auto">

          {/* 📱 小屏把「返回」按钮做紧凑一点，让它正好卡在导航栏下沿、编辑卡片正上方 ——
              这样卡片顶部（标题 + 工具栏）就能一路顶到导航栏底下，中间不留空档 */}
          <button
            onClick={handleBackClick}
            className="absolute -top-14 left-2 px-5 py-2.5 max-lg:-top-11 max-lg:left-0 max-lg:px-3 max-lg:py-1.5 max-lg:text-[10px] bg-white/40 dark:bg-slate-800/60 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-2xl shadow-lg flex items-center gap-2 text-slate-700 dark:text-slate-200 font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all group z-50"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform text-indigo-500" />
            返回上一级
          </button>

          {/* 📱 小屏：编辑器内核是 h-full + 内部 flex-1 滚动，父级高度必须确定。
              这里给的高度是「可视区减去导航栏和上下留白」，也就是**正好铺满一屏**：
                · 用 dvh 不用 vh —— 键盘弹出时 dvh 会跟着可视区缩，不会把工具栏顶出屏幕
                  （配合 layout.tsx 里 viewport 的 interactiveWidget: 'resizes-content'）；
                · 铺满一屏还有个好处：打字时光标滚动走的是**编辑区内部**那个滚动容器，
                  整页不会被浏览器往上顶，工具栏就一直待在原位。
              lg（≥1024px）仍旧是原来的 flex-1 撑满，行为不变 */}
          <section className="flex-1 bg-white/30 dark:bg-slate-800/40 backdrop-blur-[60px] rounded-[50px] shadow-2xl border border-white/30 dark:border-white/10 flex flex-col overflow-hidden max-lg:flex-none max-lg:rounded-3xl max-lg:h-[calc(100dvh-7.5rem)]">
            <RichTextEditor
              ref={editorRef}
              title={title}
              setTitle={(val) => { setTitle(val); setHasUnsavedChanges(true); }}
              initialContent={content}
              isTitleLocked={docType === 'about'}
              onOpenImageTool={() => { setImgToolTarget('editor'); setIsImgToolOpen(true); }}
              onChange={() => setHasUnsavedChanges(true)}
            />
          </section>

          {/* 📱 小屏：侧栏跟着正文竖排、占满宽度并给确定高度（MetaMatrix 同样是 h-full + 内部滚动）；
              同样用 dvh 跟着键盘缩；lg（≥1024px）仍是原来的固定 360px 宽 */}
          <aside className="w-[360px] shrink-0 bg-white/30 dark:bg-slate-800/40 backdrop-blur-[60px] rounded-[50px] shadow-2xl border border-white/30 dark:border-white/10 flex flex-col overflow-hidden max-lg:w-full max-lg:h-[70vh] max-lg:h-[70dvh]">
            <MetaMatrix
              type={docType as any} tags={tags} setTags={setTags} cover={cover} setCover={setCover} summary={summary} setSummary={setSummary} mood={mood} setMood={setMood}
              allHistoryPostTags={historyPostTags} allHistoryChatterTags={historyChatterTags} isLoadingTags={isLoadingTags}
              allHistoryMoods={historyMoods} onSave={(isPublish) => handleSave(isPublish, false)} isSaving={isSaving} lastSaved={lastSaved} onOpenImageTool={() => { setImgToolTarget('cover'); setIsImgToolOpen(true); }}
            />
          </aside>
        </main>
      </PageTransition>
      <FloatingImageTool isOpen={isImgToolOpen} onClose={() => setIsImgToolOpen(false)} onInsert={(url) => {
        if (imgToolTarget === 'editor') { editorRef.current?.insertImage(url); if (!cover) setCover(url); }
        else { setCover(url); setIsImgToolOpen(false); }
        setHasUnsavedChanges(true);
      }} />
    </div>
  );
}

// 🌟 核心修改 2：在底部暴露真正的 EditorPage，并用 Suspense 把里面的内容套起来
export default function EditorPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold tracking-widest text-sm uppercase">加载编辑器内核中...</p>
        </div>
      </div>
    }>
      <EditorContent />
    </Suspense>
  );
}