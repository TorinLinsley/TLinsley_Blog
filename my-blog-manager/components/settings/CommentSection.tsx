import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
// 🌟 核心修复：移除了报错的 Github，换成了自带的 GitBranch 图标
import { Save, Key, User, GitBranch, Shield, Bell } from 'lucide-react';
import { getApiBase } from '../../lib/apiBase';

interface CommentSectionProps {
  formData: any;
  handleUpdate: (field: string, value: any) => void;
  pushToQueue: (label: string, key?: string, value?: any) => void;
}

export default function CommentSection({ formData, handleUpdate, pushToQueue }: CommentSectionProps) {
  // 安全地获取 Gitalk 配置，防止一开始 undefined 报错
  const gitalk = formData.gitalkConfig || {
    clientID: '',
    clientSecret: '',
    repo: '',
    owner: '',
    admin: []
  };

  const updateGitalk = (key: string, value: any) => {
    handleUpdate('gitalkConfig', { ...gitalk, [key]: value });
  };

  const saveToQueue = () => {
    pushToQueue('Gitalk 评论系统', 'gitalkConfig', gitalk);
  };

  /**
   * 🐙 评论镜像 + 通知设置。
   * 故意不走 siteConfig（那会被打进前端产物、Token 会泄露）——
   * 直接存到博客项目的 data/comments-config.json，保存即生效，不用重建。
   */
  const [mirror, setMirror] = useState({ githubToken: '', notifyWebhook: '', notifyServerChan: '', notifyBark: '', hasToken: false });
  const [mirrorSaving, setMirrorSaving] = useState(false);
  const [mirrorMsg, setMirrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const base = await getApiBase();
        const res = await fetch(`${base}/api/config/comments_mirror`, { cache: 'no-store' });
        const data = await res.json();
        if (data?.success) {
          setMirror({
            githubToken: '',   // 后端不会把 Token 发回来（安全），只告诉我们填过没有
            notifyWebhook: data.notifyWebhook || '',
            notifyServerChan: data.notifyServerChan || '',
            notifyBark: data.notifyBark || '',
            hasToken: Boolean(data.hasToken),
          });
        }
      } catch {
        /* 后端没起来就静默，不影响其它设置 */
      }
    })();
  }, []);

  const saveMirror = async () => {
    setMirrorSaving(true);
    setMirrorMsg('');
    try {
      const base = await getApiBase();
      const body: Record<string, string> = {
        notifyWebhook: mirror.notifyWebhook.trim(),
        notifyServerChan: mirror.notifyServerChan.trim(),
        notifyBark: mirror.notifyBark.trim(),
      };
      // Token 框留空 = 保持原来那个不动（想删就点下面的清除）
      if (mirror.githubToken.trim()) body.githubToken = mirror.githubToken.trim();
      const res = await fetch(`${base}/api/config/comments_mirror`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data?.success) {
        setMirror((m) => ({ ...m, githubToken: '', hasToken: m.hasToken || Boolean(body.githubToken) }));
        setMirrorMsg('✅ 已保存，立刻生效（不用重建）');
      } else {
        setMirrorMsg(data?.message || '保存失败');
      }
    } catch {
      setMirrorMsg('连不上后端，保存失败');
    } finally {
      setMirrorSaving(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col gap-6"
    >
      <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-8 shadow-xl">
        <div className="flex justify-between items-center mb-8 border-b border-white/30 dark:border-slate-700/50 pb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <span>💬</span> 评论系统配置
            </h2>
            <p className="text-slate-500 text-sm mt-1 font-bold">对接 GitHub Issue 构建的全站评论系统</p>
          </div>
          <button
            onClick={saveToQueue}
            className="px-6 py-3 bg-indigo-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-500/30 flex items-center gap-2 hover:bg-indigo-600 transition-colors"
          >
            <Save size={16} /> 保存修改
          </button>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2"><Key size={14} className="text-indigo-400" /> Client ID</label>
              <input
                type="text"
                value={gitalk.clientID}
                onChange={(e) => updateGitalk('clientID', e.target.value)}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono dark:text-slate-200"
                placeholder="请输入 OAuth Apps 的 Client ID"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2"><Shield size={14} className="text-red-400" /> Client Secret</label>
              <input
                type="password"
                value={gitalk.clientSecret}
                onChange={(e) => updateGitalk('clientSecret', e.target.value)}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono dark:text-slate-200"
                placeholder="请输入 OAuth Apps 的 Client Secret"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              {/* 🌟 核心修复：这里换成了 GitBranch */}
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2"><GitBranch size={14} className="text-slate-600 dark:text-slate-300" /> GitHub 仓库名 (Repo)</label>
              <input
                type="text"
                value={gitalk.repo}
                onChange={(e) => updateGitalk('repo', e.target.value)}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono dark:text-slate-200"
                placeholder="例如: XHSBlogComment"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2"><User size={14} className="text-blue-400" /> 仓库拥有者 (Owner)</label>
              <input
                type="text"
                value={gitalk.owner}
                onChange={(e) => updateGitalk('owner', e.target.value)}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono dark:text-slate-200"
                placeholder="你的 GitHub 用户名"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2"><Shield size={14} className="text-purple-400" /> 管理员列表 (Admin)</label>
            <input
              type="text"
              value={gitalk.admin.join(', ')}
              onChange={(e) => {
                const adminArray = e.target.value.split(',').map(item => item.trim()).filter(item => item !== '');
                updateGitalk('admin', adminArray);
              }}
              className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono dark:text-slate-200"
              placeholder="管理员的 GitHub 用户名，多个请用英文逗号(,)分隔"
            />
            <p className="text-xs text-slate-400 mt-2 ml-1">拥有这些 GitHub 账号的人可以初始化和管理评论区。通常写你自己的账号即可。</p>
          </div>
        </div>

        {/* ─────────────────────────────────────────────
            🐙 新评论镜像到 GitHub + 手机通知（可选，留空就不启用）
            这些不写进 siteConfig（那会被打进前端产物，Token 就泄露了），
            而是存到博客项目的 data/comments-config.json（只有服务器读得到）。
            填完点保存立刻生效，不用重新构建。
        ───────────────────────────────────────────── */}
        <div className="mt-8 pt-6 border-t border-slate-300/40 dark:border-slate-700/50">
          <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-1">
            🐙 新评论镜像 & 手机通知
            <span className="text-[10px] font-bold text-slate-400">可选 · 留空就不启用</span>
          </h3>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            游客在前台发的评论除了存在本站，还能<b>同时写进对应的 GitHub Issue</b>（仓库里留档，Issue 不存在会自动创建）。
            想手机收到提醒就再填一个推送地址 —— 因为评论是用你的 Token 代发的，GitHub 不会给你发自己的操作邮件。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                <Shield size={14} className="text-slate-400" /> GitHub Token（镜像用）
              </label>
              <input
                type="password"
                value={mirror.githubToken}
                onChange={(e) => setMirror((m) => ({ ...m, githubToken: e.target.value }))}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono dark:text-slate-200"
                placeholder={mirror.hasToken ? '已保存 ✓ 想换新的就直接粘贴' : 'github_pat_... （可留空）'}
              />
              <p className="text-xs text-slate-400 mt-2 ml-1">
                GitHub → Settings → Developer settings → <b>Personal access tokens → Fine-grained</b> →
                只勾那个<b>评论仓库</b>的 <b>Issues: Read and write</b> → 复制粘这里，保存一次即可。
              </p>
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                <Bell size={14} className="text-amber-400" /> 新评论推送地址（可选）
              </label>
              <input
                type="text"
                value={mirror.notifyWebhook}
                onChange={(e) => setMirror((m) => ({ ...m, notifyWebhook: e.target.value }))}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200"
                placeholder="企业微信 / 钉钉 机器人的 Webhook 地址"
              />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <input
                  type="text"
                  value={mirror.notifyServerChan}
                  onChange={(e) => setMirror((m) => ({ ...m, notifyServerChan: e.target.value }))}
                  className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-xs dark:text-slate-200"
                  placeholder="Server酱 SendKey（可选）"
                />
                <input
                  type="text"
                  value={mirror.notifyBark}
                  onChange={(e) => setMirror((m) => ({ ...m, notifyBark: e.target.value }))}
                  className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-xs dark:text-slate-200"
                  placeholder="Bark URL（可选）"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={saveMirror}
              disabled={mirrorSaving}
              className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black shadow-lg active:scale-95 transition-all disabled:opacity-50"
            >
              {mirrorSaving ? '保存中…' : '💾 保存镜像设置（立即生效）'}
            </button>
            <span className={`text-xs font-bold ${mirrorMsg?.startsWith('✅') ? 'text-emerald-500' : 'text-rose-500'}`}>
              {mirrorMsg}
            </span>
          </div>
        </div>
      </div>
    </motion.section>
  );
}