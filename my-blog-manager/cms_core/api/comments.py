"""💬 控制台侧的游客评论接口（和博客前台的 /api/comments 功能一致）。

为什么要这个：控制台的评论区要和前台**一模一样**（右上角下拉切换 GitHub / 游客），
而游客评论的数据存在博客项目里（`<blogPath>/data/comments/*.json`）。
控制台和博客在同一台机器上，所以直接读写同一批文件即可 —— 不用数据库、不用跨域 ✓

⚠️ 文件名规则必须和博客前台 `lib/comments.ts` **完全一致**（slug + page 的 sha1 前 8 位），
   否则两边看到的不是同一批评论 ✗
"""

import datetime
import hashlib
import json
import os
import re
import time
import uuid

from fastapi import APIRouter, Request

router = APIRouter()

CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))

MAX_NAME = 24
MAX_CONTENT = 2000
MAX_PER_PAGE = 500  # 和前台保持一致：每页最多留这么多条


def _blog_root():
    """博客项目的物理路径（只认设置里配好的 blogPath，且必须真的是博客项目）"""
    try:
        with open(os.path.join(PROJECT_ROOT, "data", "deploy_config.json"), "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        return None
    target = str(cfg.get("blogPath") or "").strip()
    if not target or not os.path.isdir(target):
        return None
    if not os.path.exists(os.path.join(target, "package.json")):
        return None
    return target


def _comments_dir():
    blog = _blog_root()
    return os.path.join(blog, "data", "comments") if blog else None


def _file_for(page: str):
    """页面标识 → 文件路径（规则和前台 lib/comments.ts 一字不差）"""
    directory = _comments_dir()
    if not directory:
        return None
    slug = re.sub(r"[^\w\u4e00-\u9fa5-]+", "-", page.lstrip("/")).strip("-")[:60] or "index"
    digest = hashlib.sha1(page.encode("utf-8")).hexdigest()[:8]
    return os.path.join(directory, f"{slug}-{digest}.json")


def _valid_page(page: str) -> bool:
    return (
        isinstance(page, str)
        and page.startswith("/")
        and len(page) <= 200
        and ".." not in page
        and "//" not in page
    )


def _clean(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text).strip()


def _read(page: str):
    path = _file_for(page)
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return sorted([c for c in data if isinstance(c, dict)], key=lambda c: c.get("createdAt", 0))


def _write(page: str, comments: list) -> bool:
    path = _file_for(page)
    if not path:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + "." + uuid.uuid4().hex[:8] + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(comments, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return True


def _mirror_conf():
    """镜像用的 Token（控制台存的那份 ✓）+ 仓库归属（从博客 siteConfig 里读 ✓）"""
    blog = _blog_root()
    if not blog:
        return None, None, None
    token = ""
    try:
        with open(os.path.join(blog, "data", "comments-config.json"), "r", encoding="utf-8") as f:
            token = str(json.load(f).get("githubToken") or "").strip()
    except Exception:
        token = ""
    owner = repo = ""
    try:
        with open(os.path.join(blog, "siteConfig.ts"), "r", encoding="utf-8") as f:
            text = f.read()
        m = re.search(r"gitalkConfig\s*:\s*\{([\s\S]*?)\}", text)
        block = m.group(1) if m else ""
        owner = (re.search(r'owner\s*:\s*"([^"]*)"', block) or [None, ""])[1]
        repo = (re.search(r'repo\s*:\s*"([^"]*)"', block) or [None, ""])[1]
    except Exception:
        pass
    return (token or None), (owner or None), (repo or None)


# 镜像过去的游客评论正文长这样：
#     🧳 **游客评论 · 昵称**
#     （空行）
#     正文…
# 取出来时剥掉包装 —— 这样它在列表里和本站存的那条**长得一模一样** ✓
_GUEST_BODY = re.compile(r"^🧳\s*\*\*游客评论\s*·\s*([^*\n]+?)\*\*\s*\n+([\s\S]*)$")

# 早期版本正文末尾挂过一行小字（<sub>2026/9/29 16:58:02 · 由本站评论区代发…</sub>）。
# 仓库里那些老评论还带着它 → 取出来时剪掉：①列表里少一行没用的字 ②和本站那份对得上，去重才有效 ✓
_OLD_FOOTER = re.compile(r"\n*<sub>[^<]*</sub>\s*$")


def _strip_old_footer(text: str) -> str:
    m = _OLD_FOOTER.search(text)
    if m and "代发" in m.group(0):
        return text[: m.start()].strip()
    return text


def _normalize_issue_comment(x: dict, page: str) -> dict:
    """GitHub 评论 → 统一形状：游客镜像的用「游客名 + 彩色首字母头像」，真人用 GitHub 头像"""
    text = _strip_old_footer(str(x.get("body") or "").replace("\r\n", "\n").replace("\r", "\n").strip())
    created = x.get("created_at") or ""
    try:
        ts = int(
            datetime.datetime.strptime(created, "%Y-%m-%dT%H:%M:%SZ")
            .replace(tzinfo=datetime.timezone.utc)
            .timestamp()
            * 1000
        )
    except Exception:
        ts = int(time.time() * 1000)

    user = x.get("user") or {}
    m = _GUEST_BODY.match(text)
    if m:
        return {
            "id": f"gh-{x.get('id')}",
            "page": page,
            "name": (m.group(1) or "").strip() or "匿名游客",
            "content": _strip_old_footer((m.group(2) or "").strip()),
            "createdAt": ts,
            "source": "guest",
            "avatar": "",  # 空头像 → 前端画彩色首字母块（和本站游客评论一致 ✓）
        }
    return {
        "id": f"gh-{x.get('id')}",
        "page": page,
        "name": user.get("login") or "GitHub 用户",
        "content": text,
        "createdAt": ts,
        "source": "github",
        "avatar": user.get("avatar_url") or "",
    }


def _gh_headers():
    token, owner, repo = _mirror_conf()
    if not owner or not repo:
        return None, None, None
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "tlblog-console"}
    if token:
        headers["Authorization"] = f"token {token}"
    return headers, owner, repo


def _gh_request(url: str, headers: dict, method: str = "GET"):
    import urllib.request

    req = urllib.request.Request(url, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=8) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body) if body else None


def _github_comments(page: str):
    """取这一页对应 Issue 里的全部评论。

    ⚠️ 返回值要能区分三种情况（调用方靠它决定"要不要把本地那份也跟着删"）：
        ok=False             → 没配 token / 网络异常 / 权限不够 ⇒ 什么都别动（不能瞎删 ✗）
        ok=True, issue=False → 这一页根本没建过 Issue ⇒ 也别动（评论可能压根没镜像过 ✓）
        ok=True, issue=True  → 查到 Issue 了，comments 就是"GitHub 上真实剩下的" ⇒ 可据此对齐 ✓
    """
    headers, owner, repo = _gh_headers()
    if not headers:
        return {"ok": False, "issue": False, "comments": []}
    issue_id = (page.rstrip("/") or "/")[:49]
    labels = f"Gitalk,{issue_id}"

    import urllib.parse

    try:
        issues = _gh_request(
            f"https://api.github.com/repos/{owner}/{repo}/issues?state=all&labels={urllib.parse.quote(labels)}",
            headers,
        )
        if not isinstance(issues, list) or not issues:
            return {"ok": True, "issue": False, "comments": []}
        raw = _gh_request(
            f"https://api.github.com/repos/{owner}/{repo}/issues/{issues[0]['number']}/comments?per_page=100",
            headers,
        )
    except Exception:
        return {"ok": False, "issue": False, "comments": []}

    out = []
    for x in raw if isinstance(raw, list) else []:
        if isinstance(x, dict):
            out.append(_normalize_issue_comment(x, page))
    return {"ok": True, "issue": True, "comments": out}


def _delete_mirrors(page: str, name: str, content: str) -> int:
    """把 GitHub 上那几条镜像过去的游客评论删掉（昵称 + 正文对得上才算 ✓）

    用途：删掉一条游客评论时，顺手把它在 Issue 里的那份也删掉 —— 否则刷新一下它又会
    从 GitHub 那边冒出来 ✗ 搜不到 / 没权限 / 网络异常都直接算了，不影响本地已删 ✓
    """
    headers, owner, repo = _gh_headers()
    if not headers:
        return 0
    issue_id = (page.rstrip("/") or "/")[:49]

    import urllib.parse

    try:
        issues = _gh_request(
            f"https://api.github.com/repos/{owner}/{repo}/issues?state=all"
            f"&labels={urllib.parse.quote(f'Gitalk,{issue_id}')}",
            headers,
        )
        if not isinstance(issues, list) or not issues:
            return 0
        raw = _gh_request(
            f"https://api.github.com/repos/{owner}/{repo}/issues/{issues[0]['number']}/comments?per_page=100",
            headers,
        )
    except Exception:
        return 0

    removed = 0
    for x in raw if isinstance(raw, list) else []:
        if not isinstance(x, dict):
            continue
        n = _normalize_issue_comment(x, page)
        if n.get("source") != "guest" or n.get("name") != name or n.get("content") != content:
            continue
        try:
            _gh_request(
                f"https://api.github.com/repos/{owner}/{repo}/issues/comments/{x.get('id')}",
                headers,
                method="DELETE",
            )
            removed += 1
        except Exception:
            pass
    return removed


@router.get("/list")
def list_comments(page: str = ""):
    if not _valid_page(page):
        return {"ok": False, "message": "页面标识不合法"}

    # 本地游客评论 + GitHub 那边的评论 → 合并成同一份列表（下拉只决定发布方式 ✓）
    local = _read(page)
    gh = _github_comments(page)

    # 🔄 双向对齐之一：**在 GitHub 那边删掉的镜像评论，本地这份也跟着删**（条件保守，宁可不删 ✗）
    if gh["ok"] and gh["issue"]:
        alive = {(c.get("name"), c.get("content")) for c in gh["comments"] if c.get("source") == "guest"}
        # 刚发出去的（2 分钟内）先不动：镜像那一步是"发完顺手做"的，可能还在路上 ⏳
        cutoff = int(time.time() * 1000) - 2 * 60 * 1000
        # 重新读一次：上面查 GitHub 花了几百毫秒，这期间可能刚有人发了新评论 —— 别覆盖掉 ✗
        fresh = _read(page)
        known = {c.get("id") for c in local}
        kept = [
            c
            for c in fresh
            if (c.get("name"), c.get("content")) in alive
            or int(c.get("createdAt") or 0) > cutoff
            or c.get("id") not in known
        ]
        if len(kept) != len(fresh):
            _write(page, kept)
        local = kept

    # ⚠️ 游客评论是"两处都有"的（本站 JSON + 镜像到 Issue）→ 按「昵称 + 正文」把镜像那份
    #    去掉，否则同一条会显示两遍 ✗（本站那份时间更精确，留它 ✓）
    seen = {(c.get("name"), c.get("content")) for c in local}
    merged = local + [
        c for c in gh["comments"] if not (c.get("source") == "guest" and (c.get("name"), c.get("content")) in seen)
    ]
    merged.sort(key=lambda c: c.get("createdAt", 0))
    return {"ok": True, "comments": merged}


@router.post("/add")
async def add_comment(request: Request):
    try:
        body = await request.json()
    except Exception:
        return {"ok": False, "message": "请求格式不对"}

    page = str(body.get("page") or "")
    name = _clean(str(body.get("name") or ""))[:MAX_NAME] or "匿名游客"
    content = _clean(str(body.get("content") or ""))[:MAX_CONTENT]

    if not _valid_page(page):
        return {"ok": False, "message": "页面标识不合法"}
    if not content:
        return {"ok": False, "message": "内容不能为空"}

    comment = {
        "id": os.urandom(6).hex(),
        "page": page,
        "name": name,
        "content": content,
        "createdAt": int(time.time() * 1000),
    }

    comments = _read(page)[-(MAX_PER_PAGE - 1):]
    comments.append(comment)
    if not _write(page, comments):
        return {"ok": False, "message": "还没配置博客路径，无法保存"}
    return {"ok": True, "comment": comment}


@router.delete("/delete")
def delete_comment(page: str = "", id: str = ""):
    if not _valid_page(page) or not id:
        return {"ok": False, "message": "参数不合法"}
    comments = _read(page)
    target = next((c for c in comments if c.get("id") == id), None)
    left = [c for c in comments if c.get("id") != id]
    if len(left) == len(comments):
        return {"ok": False, "message": "没找到这条评论"}
    _write(page, left)

    # 🔄 双向对齐之二：**本地删掉的游客评论，GitHub 那边镜像的那份也一起删**，
    #    否则刷新一下它又会从 GitHub 冒出来 ✗（两边永远对不齐）
    if target:
        try:
            _delete_mirrors(page, target.get("name") or "", target.get("content") or "")
        except Exception:
            pass

    return {"ok": True, "message": "已删除"}

