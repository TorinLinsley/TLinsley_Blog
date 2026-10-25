import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'


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