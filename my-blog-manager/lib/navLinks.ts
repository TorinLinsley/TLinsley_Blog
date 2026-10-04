/**
 * 🧭 控制台的导航项 —— **只此一份**。
 *
 * 两个地方共用它：
 *   ① `components/Navbar.tsx`（控制台自己的导航栏）
 *   ② `app/tools/[...file]/route.ts` 在控制台里预览工具网页时注入的那条导航栏
 *      （见前台 public/toolnav.js，两边用的是同一个脚本）
 */
export const navLinks = [
  { name: '首页', href: '/' },
  { name: '资源分享', href: '/resources' },
  { name: '工具', href: '/tools' },
  { name: '归档', href: '/timeline' },
  { name: '项目', href: '/projects' },
  { name: '照片墙', href: '/photowall' },
  { name: '音乐', href: '/music' },
  { name: '说说', href: '/moments' },
  { name: '杂谈', href: '/chatter' },
  { name: '🌳 灵境', href: '/tree' },
  { name: '📝 草稿箱', href: '/drafts' },
  { name: '友链', href: '/friends' },
  { name: '关于', href: '/about' },
  { name: '⚙️ 设置', href: '/settings' },
] as const;
