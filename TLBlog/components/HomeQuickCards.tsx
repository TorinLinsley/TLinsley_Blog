import fs from 'fs';
import path from 'path';
import Link from 'next/link';

/**
 * 首页新增的两个卡片：资源分享 / 工具。
 *
 * 都放在这一个文件里，是因为它们长得一样（左上角大字标题 + 下面一排子卡片），
 * 只是数据来源不同：资源卡片是写死的三个入口，工具卡片读 tools/tools.json。
 *
 * 样式跟「个人概述」卡片同一套：rounded-3xl + 半透明毛玻璃 + 浅边框 + shadow-xl。
 *
 * 交互约定（用户定的）：
 *   · 点到卡片里**不是**子卡片的地方 → 打开该栏目的总界面；
 *   · 子卡片各自跳自己的地方。
 *   实现上：整卡铺一层绝对定位的 <Link> 当默认跳转，三个子卡片用 z-10 浮在它上面，
 *   这样既不用嵌套 <a>（非法），也不用 JS。
 *   ⚠️ 压在整卡链接上面的**非交互**元素（标题、空状态容器）必须加 pointer-events-none，
 *      否则它会把点击吃掉，那一块就成了点不动的死区；子卡片自己加 pointer-events-auto 穿透回来。
 */

const SHELL =
  'relative h-full rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md ' +
  'border border-white/40 dark:border-white/10 shadow-xl p-5 sm:p-6 md:p-7 ' +
  'flex flex-col transition-all duration-700 hover:scale-[1.01] overflow-hidden group';

const TITLE = 'text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-wide';
const SUB =
  'pointer-events-auto relative z-10 flex flex-col items-center justify-center gap-2 rounded-2xl py-4 sm:py-5 px-2 ' +
  'bg-white/50 dark:bg-slate-700/40 border border-white/40 dark:border-white/10 ' +
  'hover:bg-indigo-500/10 dark:hover:bg-indigo-500/20 hover:border-indigo-400/60 ' +
  'transition-colors duration-300';

/* ───────────────────────── 子卡片里的小图标（内联 SVG，不引依赖） ───────────────────────── */
const ICONS: Record<string, React.ReactNode> = {
  资源分享: (
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  疑难解答: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </>
  ),
  更多: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>
  ),
  笔记分享: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M8 13h8M8 17h5" />
    </>
  ),
};

function SubIcon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-500 dark:text-indigo-400"
    >
      {ICONS[name]}
    </svg>
  );
}

/** 工具的图标：iconify:xxx:yyy 走站内代理，本地 .svg 用 mask 上色，位图直接 img（和工具页同一套逻辑） */
function ToolIcon({ icon }: { icon?: string }) {
  const raw = String(icon || '').trim();
  if (!raw) return <span className="w-6 h-6 sm:w-7 sm:h-7" />;

  const isNet = raw.startsWith('iconify:');
  const url = isNet ? `/iconify/${raw.slice('iconify:'.length).replace(/:/g, '/')}.svg` : raw;

  if (!isNet && !/\.svg(\?|#|$)/i.test(raw)) {
    return <img src={raw} alt="" className="w-6 h-6 sm:w-7 sm:h-7 object-contain" />;
  }
  const style: React.CSSProperties = {
    WebkitMaskImage: `url(${url})`,
    maskImage: `url(${url})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    backgroundColor: 'currentColor',
  };
  return (
    <span
      aria-hidden
      className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-500 dark:text-indigo-400"
      style={style}
    />
  );
}

/* ───────────────────────────────── 资源分享卡片 ───────────────────────────────── */
const RES_ITEMS = [
  { name: '资源分享', href: '/resources/1资源分享/工具.md' },   // 打开「工具.md」那份笔记
  { name: '疑难解答', href: '/resources/2疑难解答/关于MC服务器.md' }, // 打开「关于MC服务器.md」
  { name: '笔记分享', href: '/resources/3笔记分享（多篇型）/笔记分享-列表.md' }, // 打开「笔记分享-列表.md」
];

export function HomeResourcesCard() {
  return (
    <div className={SHELL}>
      {/* 整卡默认跳转：铺满卡片的透明链接；子卡片用 z-10 盖在它上面 */}
      <Link href="/resources" aria-label="打开资源分享" className="absolute inset-0 z-0" />

      <h3 className={`${TITLE} relative z-10 pointer-events-none`}>资源分享</h3>

      <div className="relative z-10 pointer-events-none mt-4 sm:mt-5 grid grid-cols-3 gap-2.5 sm:gap-4 flex-1">
        {RES_ITEMS.map((it) => (
          <Link key={it.name} href={it.href} className={SUB}>
            <SubIcon name={it.name} />
            <span className="text-[11px] sm:text-sm font-bold text-slate-700 dark:text-slate-200 text-center leading-tight">
              {it.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────────── 工具卡片 ───────────────────────────────── */
type ToolItem = { name?: string; dir?: string; entry?: string; icon?: string; tags?: string[] };

/** 首页工具卡片：最多放 3 个打了「+」标签的工具，**第 4 格固定是「更多」**（去工具总界面） */
export const HOME_TOOL_TAG = '+';
export const HOME_TOOL_MAX = 3;

/** 读 tools.json 并挑出带「+」标签的工具（读不到就返回空数组，不炸首页） */
export function readHomeTools(): ToolItem[] {
  try {
    const file = path.join(process.cwd(), 'tools', 'tools.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list: ToolItem[] = Array.isArray(data) ? data : (data?.tools ?? []);
    return (Array.isArray(list) ? list : [])
      .filter((t) => (t?.tags ?? []).map((x) => String(x).trim()).includes(HOME_TOOL_TAG))
      .slice(0, HOME_TOOL_MAX);
  } catch {
    return [];
  }
}

/** 子卡片跳哪儿：**必须带上入口文件**（工具目录里没有 index.html，只写目录会 404） */
function toolHref(t: ToolItem): string {
  const dir = encodeURIComponent(String(t.dir || ''));
  const entry = String(t.entry || '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return entry ? `/tools/${dir}/${entry}` : `/tools/${dir}`;
}

export function HomeToolsCard({ tools }: { tools: ToolItem[] }) {
  return (
    <div className={SHELL}>
      <Link href="/tools" aria-label="打开工具" className="absolute inset-0 z-0" />

      <h3 className={`${TITLE} relative z-10 pointer-events-none`}>工具</h3>

      {tools.length === 0 ? (
        <div className="relative z-10 pointer-events-none flex-1 flex items-center justify-center mt-4">
          <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">
            还没有标记为 <span className="font-black text-indigo-500">+</span> 的工具
            <br />
            （在控制台「工具」里给想放到首页的工具加一个 <span className="font-black">+</span> 标签即可）
          </p>
        </div>
      ) : (
        <div className="relative z-10 pointer-events-none mt-4 sm:mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 flex-1">
          {tools.map((t) => (
            <Link key={t.dir || t.name} href={toolHref(t)} className={SUB}>
              <ToolIcon icon={t.icon} />
              <span className="text-[11px] sm:text-sm font-bold text-slate-700 dark:text-slate-200 text-center leading-tight line-clamp-2">
                {t.name}
              </span>
            </Link>
          ))}

          {/* 第 4 格固定是「更多」：和点卡片空白处一样，都是去工具总界面 */}
          <Link href="/tools" className={SUB}>
            <SubIcon name="更多" />
            <span className="text-[11px] sm:text-sm font-bold text-slate-700 dark:text-slate-200 text-center leading-tight">
              更多
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
