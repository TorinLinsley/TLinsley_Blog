import { NextRequest, NextResponse } from 'next/server'

const NET_EASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  Referer: 'https://music.163.com/',
}

const DETAIL_API = 'https://music.163.com/api/v3/song/detail'
const LYRIC_API = 'https://music.163.com/api/song/lyric'

const CACHE_TTL = 10 * 60 * 1000
const songCache = new Map<string, { at: number; data: SongResult }>()

type SongResult = {
  id: string
  name?: string
  artist?: string
  author?: string
  cover?: string
  pic?: string
  url?: string
  lrc?: string
  error?: string
}

type NetEaseSong = {
  name?: string
  ar?: { name?: string }[]
  al?: { name?: string; picUrl?: string }
  artists?: { name?: string }[]
  album?: { name?: string; picUrl?: string }
}

async function fetchSong(songId: string): Promise<SongResult> {
  const hit = songCache.get(songId)
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return hit.data
  }

  const [detailRes, lrcRes] = await Promise.all([
    fetch(`${DETAIL_API}?c=${encodeURIComponent(JSON.stringify([{ id: Number(songId) }]))}`, {
      headers: NET_EASE_HEADERS,
      signal: AbortSignal.timeout(6000),
    }),
    fetch(`${LYRIC_API}?id=${songId}&lv=-1&kv=-1&tv=-1`, {
      headers: NET_EASE_HEADERS,
      signal: AbortSignal.timeout(6000),
    }).catch(() => null),
  ])

  const detail = await detailRes.json()

  if (!detail.songs && detail.code === 405) {
    return { id: songId, error: 'rate_limited' }
  }

  const song: NetEaseSong | undefined = detail.songs?.[0]

  if (!song) {
    return { id: songId, error: 'not_found' }
  }

  let lrcText = ''
  if (lrcRes && lrcRes.ok) {
    try {
      const lrcData = await lrcRes.json()
      lrcText = lrcData.lrc?.lyric || ''
    } catch {
    }
  }

  const artistName = song.ar?.[0]?.name || song.artists?.[0]?.name || '未知歌手'
  const coverUrl = song.al?.picUrl || song.album?.picUrl || ''

  const result: SongResult = {
    id: songId,
    name: song.name,
    artist: artistName,
    author: artistName,
    cover: coverUrl,
    pic: coverUrl,
    url: `https://music.163.com/song/media/outer/url?id=${songId}.mp3`,
    lrc: lrcText,
  }

  songCache.set(songId, { at: Date.now(), data: result })
  return result
}

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get('ids')
  if (!ids) {
    return NextResponse.json({ error: 'Missing ids parameter' }, { status: 400 })
  }

  const songIds = ids.split(',').map((id) => id.trim()).filter(Boolean)

  const results: SongResult[] = await Promise.all(
    songIds.map(async (songId): Promise<SongResult> => {
      try {
        return await fetchSong(songId)
      } catch (error) {
        console.error(`[api/music] 获取歌曲 ${songId} 失败:`, error)
        return { id: songId, error: String(error) }
      }
    }),
  )

  return NextResponse.json(results)
}