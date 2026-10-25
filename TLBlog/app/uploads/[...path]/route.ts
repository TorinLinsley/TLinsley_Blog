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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params

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
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}