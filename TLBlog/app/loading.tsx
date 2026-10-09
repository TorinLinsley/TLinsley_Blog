/**
 * ⏳ 全站加载骨架 —— App Router 的 `loading.tsx` 约定。
 *
 * 为什么要它（用户反馈的"卡一下"）：
 *   App Router 点链接时，会先去服务端要新页面的 RSC 数据，
 *   **数据到手之后导航才算提交** → 地址栏和 usePathname 才更新。
 *   而这台服务器的首字节要 0.9~1.8 秒 ✗ → 表现就是"点了之后地址栏卡一下才变"。
 *
 *   有了这个文件，Next 会在点击的**那一瞬间**就提交导航：
 *     · 地址栏立刻变 ✓
 *     · 立刻显示下面这个骨架 ✓（数据到了再替换成真内容 ✓）
 *   → 体感从"卡一秒"变成"秒响应" ✓
 *
 * 几个关键点（别改坏 ✓）：
 *   · 它放在 app/ 根目录 → 对**所有**页面生效 ✓
 *   · 它在 **root layout 内部** ✓ → 导航栏和音乐播放器**不受影响、不重建** ✓
 *     （音乐不会因为切页而断 ✓）
 *   · 只在"页面真的还没拿到数据"时才出现 ✓
 *     预取过/静态的页面不会闪骨架 ✓（Next 自己控制 ✓）
 *   · 用 Tailwind 自带的 animate-pulse ✓ 不额外加动画库 ✓ 手机上很轻 ✓
 *   · 配色跟站点一致（浅色白玻璃 / 深色 slate ✓），并遵守 .no-glass 兜底 ✓
 */
export default function Loading() {
  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center px-4 pt-28 pb-24">
      <div className="w-full max-w-3xl">

        {/* 主内容骨架：一张和站点同款的玻璃卡片 */}
        <div className="bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-white/40 dark:border-white/10 shadow-xl p-8 animate-pulse">

          {/* 标题条 */}
          <div className="h-7 w-2/3 rounded-lg bg-slate-200/80 dark:bg-slate-700/60" />

          {/* 正文几行 */}
          <div className="mt-6 space-y-3">
            <div className="h-4 w-full rounded bg-slate-200/70 dark:bg-slate-700/50" />
            <div className="h-4 w-11/12 rounded bg-slate-200/70 dark:bg-slate-700/50" />
            <div className="h-4 w-4/5 rounded bg-slate-200/70 dark:bg-slate-700/50" />
            <div className="h-4 w-10/12 rounded bg-slate-200/70 dark:bg-slate-700/50" />
          </div>

          {/* 两块占位（对应常见的卡片/图片区） */}
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="h-24 rounded-2xl bg-slate-200/60 dark:bg-slate-700/40" />
            <div className="h-24 rounded-2xl bg-slate-200/60 dark:bg-slate-700/40" />
          </div>
        </div>

        <p className="mt-4 text-center text-xs tracking-wider text-slate-400 dark:text-slate-500">
          加载中…
        </p>
      </div>
    </div>
  );
}
