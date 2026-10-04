import { NextRequest, NextResponse } from 'next/server'

const NET_EASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  Referer: 'https://music.163.com/',
}

// 🎵 接口变更说明（2026-09）：
// 旧接口 https://music.163.com/api/song/detail 已被网易云限流，
// 会返回 {"msg":"操作频繁，请稍候再试","code":405}，表现为"所有歌都查不到"。
// 改用新版 v3 接口，注意字段也跟着变了：
//   artists[0].name -> ar[0].name
//   album.name      -> al.name
//   album.picUrl    -> al.picUrl
const DETAIL_API = 'https://music.163.com/api/v3/song/detail'
const LYRIC_API = 'https://music.163.com/api/song/lyric'

// 轻量内存缓存：歌曲信息很少变，缓存可以大幅减少对网易云的请求，
// 避免短时间内反复刷新页面再次触发限流。
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

// 新接口用 ar/al，旧接口用 artists/album，两个都兼容，万一以后再变也不至于全挂
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

  // 网易云限流时返回的是 {"msg":"操作频繁","code":405}，没有 songs 字段。
  // 这里把这种情况明确区分出来，避免又被人误读成"歌不存在"。
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
      /* 歌词可选，失败不影响主流程 */
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
