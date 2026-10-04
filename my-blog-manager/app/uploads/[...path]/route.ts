import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

// 🖥️ 本地图库预览通道
// 博客里插入的是相对路径 /uploads/xxx.jpg。控制台和博客不同源，
// 预览时请求会打到控制台自己身上，于是图片是裂的。
// 这个路由把 /uploads/* 映射到博客项目的 public/uploads 目录，
// 让控制台（编辑器、设置页）里也能正常看到图。

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

async function readBlogPath(): Promise<string> {
  try {
    const cfg = path.join(process.cwd(), 'data', 'deploy_config.json')
    const raw = await fs.readFile(cfg, 'utf-8')
    return (JSON.parse(raw).blogPath || '').trim()
  } catch {
    return ''
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params

  // 防目录穿越
  if (
    !segments ||
    segments.length === 0 ||
    segments.some((s) => !s || s.includes('..') || s.includes('/') || s.includes('\\'))
  ) {
    return new NextResponse('Bad request', { status: 400 })
  }

  const blogPath = await readBlogPath()
  if (!blogPath) {
    return new NextResponse('blogPath not configured', { status: 404 })
  }

  const filePath = path.join(blogPath, 'public', 'uploads', ...segments)

  try {
    const data = await fs.readFile(filePath)
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
