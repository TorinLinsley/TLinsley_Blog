import { NextResponse } from 'next/server';

/**
 * 🎭 网络图标代理（前台侧）：`/iconify/mdi/clock.svg` → 从 Iconify 取原始 SVG 再吐给浏览器。
 *
 * 为什么要代理，而不是让浏览器直连 api.iconify.design：
 *   ① 那个域名在国内经常连不上，直连就是一片空白 ✗
 *   ② 同源之后才能把它当 CSS mask 用 —— 配合 `background-color: currentColor`
 *      图标就会跟着文字颜色走，**深色模式自动变白** ✓（`<img>` 是做不到这点的）
 *
 * 带一年强缓存：同一个图标浏览器只会真正回源一次。
 * 控制台那边有一条一模一样的（my-blog-manager/app/iconify/[prefix]/[name]/route.ts）。
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ prefix: string; name: string }> }) {
  const { prefix, name } = await ctx.params;

  const ok = (s: string) => /^[A-Za-z0-9._-]+$/.test(s || '');
  const icon = String(name || '').replace(/\.svg$/i, '');
  if (!ok(prefix) || !ok(icon)) {
    return new NextResponse('bad icon name', { status: 400 });
  }

  try {
    const res = await fetch(`https://api.iconify.design/${prefix}/${icon}.svg`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      return new NextResponse('icon not found', { status: 404 });
    }
    const svg = await res.text();
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('icon fetch failed', { status: 502 });
  }
}
