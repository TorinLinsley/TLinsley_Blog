import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * 🖼️ 博客前台的 /uploads/* 通道（和控制台 app/uploads/[...path]/route.ts 是一个思路）。
 *
 * ⚠️ 为什么非要有这个路由，光靠 public/uploads 静态目录不行？
 *    Next 在**服务器启动时**会把 public/ 下的文件扫成一个列表（next/dist/server/lib/router-utils/filesystem.js
 *    里的 setupFsCheck → publicFolderItems），之后就再也不更新了。于是一张图如果是在
 *    `next start` 启动**之后**才放进 public/uploads/ 的（控制台上传图片就是这种情况），
 *    静态匹配根本不知道有它 → 直接 404，图片裂开。表现非常迷惑：
 *    「服务器上文件明明在、控制台里也显示得好好的，就博客前台加载不出来」。
 *    重启一次 xhblogs 才会认（启动时重新扫一遍）。
 *
 *    这里加一条按请求读盘的路由兜住新文件；
 *    启动时就已经存在的旧文件仍然走 Next 的静态匹配（它优先级更高），互不影响。
 *
 * ⚠️ 只服务 <项目根>/public/uploads 下面，且做了目录穿越检查 —— 别改成能读任意路径。
 */

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params

  // 防目录穿越：只允许一段段正常的文件名
  if (
    !segments ||
    segments.length === 0 ||
    segments.some((s) => !s || s.includes('..') || s.includes('/') || s.includes('\\'))
  ) {
    return new NextResponse('Bad request', { status: 400 })
  }

  const filePath = path.join(process.cwd(), 'public', 'uploads', ...segments)

  try {
    const data = await fs.readFile(filePath)
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': type,
        // 文件名带时间戳/随机后缀，内容不会变，可以放心让浏览器多缓存一会儿
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
