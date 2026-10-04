from fastapi import APIRouter
import json
import requests

router = APIRouter()

# 🎵 接口变更说明（2026-09）：
# 旧接口 https://music.163.com/api/song/detail 已被网易云限流，
# 返回 {"msg":"操作频繁，请稍候再试","code":405}，表现为"所有歌都查不到"。
# 改用新版 v3 接口，注意字段也跟着变了：
#   artists[0].name -> ar[0].name
#   album.name      -> al.name
#   album.picUrl    -> al.picUrl
DETAIL_API = "https://music.163.com/api/v3/song/detail"


@router.get("/query/{song_id}")
def query_netease_music(song_id: str):
    """通过网易云公开接口查询歌曲详情"""
    print(f"\n[API] 🎵 收到查询网易云音乐请求, ID: {song_id}")
    try:
        # v3 接口用 c 参数传 JSON 数组，ID 用数字更稳妥
        try:
            sid = int(song_id)
        except (TypeError, ValueError):
            sid = song_id

        params = {"c": json.dumps([{"id": sid}], separators=(",", ":"))}
        headers = {
            # 伪装得更像真实浏览器
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": "https://music.163.com/"
        }
        response = requests.get(DETAIL_API, params=params, headers=headers, timeout=8)

        # 把 HTTP 状态码打出来，如果是 403 就是被网易云拦截了
        print(f"[API] 📡 网易云响应状态码: {response.status_code}")

        data = response.json()

        # 🌟 关键：限流时返回的是 {"msg":"操作频繁","code":405}，里面没有 songs 字段。
        # 以前这种情况会被误报成"查无此歌"，现在明确区分开。
        if not data.get("songs") and data.get("code") == 405:
            print(f"[API] 🚦 网易云限流（操作频繁），请稍后再试 (ID: {song_id})")
            return {"success": False, "message": "网易云接口限流（操作频繁），请等待几分钟后重试"}

        if data.get("songs") and len(data["songs"]) > 0:
            song = data["songs"][0]
            # 新接口字段是 ar/al；旧接口是 artists/album，两个都兼容
            ar = song.get("ar") or song.get("artists") or []
            al = song.get("al") or song.get("album") or {}
            artist = ar[0]["name"] if ar else "未知歌手"
            print(f"[API] ✅ 查询成功: {song['name']} - {artist}")
            return {
                "success": True,
                "data": {
                    "id": song_id,
                    "name": song["name"],
                    "artist": artist,
                    "album": al.get("name", ""),
                    "cover": al.get("picUrl", "")
                }
            }
        print(f"[API] ❌ 查无此歌 (ID: {song_id})")
        return {"success": False, "message": "未找到该歌曲，可能是 VIP 歌曲或 ID 错误"}

    except Exception as e:
        # 【关键】：在终端里把真正的报错原因打印出来！
        print(f"[API] 💥 网易云接口发生严重错误: {str(e)}")
        return {"success": False, "message": f"后端请求失败: {str(e)}"}
