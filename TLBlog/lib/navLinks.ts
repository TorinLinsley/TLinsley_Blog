/**
 * 🧭 全站导航项 —— **只此一份**。
 *
 * 两个地方共用它：
 *   ① 前台 `components/Navbar.tsx`（正常页面的导航栏）
 *   ② `app/tools/[...file]/route.ts` 往工具网页里注入导航栏时（见 public/toolnav.js）
 *
 * 顺序说明：资源分享是高频入口，放在首页右边第一位；「工具」紧跟其后
 * （都是"进去拿东西用"的入口）；归档在前、项目在后（用户指定）。
 */
export const navLinks = [
  { name: '首页', href: '/' },
  { name: '资源分享', href: '/resources' },
  { name: '工具', href: '/tools' },
  { name: '归档', href: '/timeline' },
  { name: '项目', href: '/projects' },
  { name: '照片墙', href: '/photowall' },
  { name: '音乐', href: '/music' },
  { name: '灵境', href: '/tree' },
  { name: '说说', href: '/moments' },
  { name: '杂谈', href: '/chatter' },
  { name: '友链', href: '/friends' },
  { name: '关于', href: '/about' },
] as const;
