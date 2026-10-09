/**
 * ⏳ 全站加载骨架（控制台）—— App Router 的 `loading.tsx` 约定。
 *
 * 和前台的 app/loading.tsx 是**同一个思路**（两边各自一份，别互抄文件 ✗ 样式微调不同）：
 *   App Router 点击链接时先去服务端取新页面的 RSC 数据，
 *   **数据到手导航才算提交** → 地址栏 / usePathname 才更新 ✓
 *   服务器首字节接近 1 秒 ✗ → 表现就是"点了之后卡一下才切过去" ✗
 *
 *   有了它：点击瞬间就提交导航 ✓ → 地址栏立刻变 ✓ + 立刻显示这个骨架 ✓
 *   数据到了再替换成真内容 ✓ → 体感从"卡一秒"变成"秒响应" ✓
 *
 * 几个关键点（别改坏 ✓）：
 *   · 放在 app/ 根目录 → 对**所有**页面生效 ✓
 *   · 在 root layout 内部 ✓ → 导航栏、悬浮播放器、猫**都不受影响** ✓
 *   · 只在"确实还没拿到数据"时出现 ✓ 预取过的页面不会闪 ✓
 *   · 只用 Tailwind 自带的 animate-pulse ✓ 不引额外动画库 ✓
 */
export default function Loading() {
  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center px-4 pt-28 pb-24">
      <div className="w-full max-w-3xl">

        {/* 一张和站点同款的玻璃卡片当骨架 */}
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

          {/* 两块占位（列表 / 编辑区常见形态） */}
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
