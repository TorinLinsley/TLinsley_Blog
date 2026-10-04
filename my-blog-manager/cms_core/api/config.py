from fastapi import APIRouter, Body
import os
import re
import json
from typing import Dict, Any

router = APIRouter()

# ---------------------------------------------------------
# 🛠️ 寻址引擎：物理锁死 Manager 本地根目录！(终极修复版)
# ---------------------------------------------------------
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))


def get_config_path():
    possible_paths = [
        os.path.join(PROJECT_ROOT, 'siteConfig.ts'),
        os.path.join(PROJECT_ROOT, 'src', 'siteConfig.ts'),
        os.path.join(os.path.dirname(CURRENT_API_DIR), 'siteConfig.ts')
    ]

    for p in possible_paths:
        if os.path.exists(p):
            return p

    print(f"❌ 警告：在 Manager 目录未找到 siteConfig.ts！正在搜索的根目录是: {PROJECT_ROOT}")
    return None


def dict_to_ts_string(data, indent=2):
    """安全地将字典转为 TypeScript 格式，自动处理多行字符串转义"""
    if isinstance(data, dict):
        lines = ["{"]
        for k, v in data.items():
            # 🌟 核心修复：无论是字典还是外层，全部使用 json.dumps 强制安全转义，彻底消灭 Unterminated string constant
            val = json.dumps(v, ensure_ascii=False)
            lines.append(f"{' ' * (indent + 2)}{k}: {val},")
        lines.append(" " * indent + "}")
        return "\n".join(lines)
    return json.dumps(data, ensure_ascii=False)


# =========================================================
# 🐙 评论「镜像到 GitHub + 新评论通知」的配置
#
# ⚠️ 故意**不写进 siteConfig.ts**：那玩意儿会打进前端产物，Token 就泄露到浏览器里了 ✗
#    这里写到博客项目的 `data/comments-config.json`（**只有服务器读得到** ✓），
#    博客的 /api/comments 在服务端读它 ✓ 所以在控制台填一次、点保存就生效 ✓
#    **不用登服务器改环境变量，也不用重新构建** ✓
# =========================================================

_MIRROR_KEYS = ("githubToken", "notifyWebhook", "notifyServerChan", "notifyBark")


def _blog_root():
    """博客项目根目录（路径取设置里的 blogPath）"""
    cfg_path = os.path.join(PROJECT_ROOT, "data", "deploy_config.json")
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        return None
    target = str(cfg.get("blogPath") or "").strip()
    if not target or not os.path.isdir(target) or not os.path.exists(os.path.join(target, "package.json")):
        return None
    return target


def _mirror_config_path():
    """博客项目里的 data/comments-config.json"""
    root = _blog_root()
    return os.path.join(root, "data", "comments-config.json") if root else None


# =========================================================
# 🎵 音乐歌单的「运行时」配置
#
# ⚠️ 只改 siteConfig.ts 是不够的：那里面的东西会被**打进前端产物**，
#    歌单改完必须重新构建才生效（而"更新本地"并不构建）。
#    所以保存歌单时**额外**写一份 data/music-config.json（只有服务器读得到），
#    博客的 /api/music 在请求时读它 ✓ 控制台点保存 → 刷新页面就换歌 ✓
#    访客那边没有任何额外请求（还是同一个 /api/music）✓
# =========================================================


def _music_config_path():
    """博客项目里的 data/music-config.json（歌单）"""
    root = _blog_root()
    return os.path.join(root, "data", "music-config.json") if root else None


@router.get("/comments_mirror")
def get_comments_mirror():
    path = _mirror_config_path()
    if not path:
        return {"success": False, "message": "还没配置博客路径（设置 → 项目仓库设置）"}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    # Token 只回报"填过没有"，绝不原样发回浏览器
    return {
        "success": True,
        "hasToken": bool(str(data.get("githubToken") or "").strip()),
        "notifyWebhook": str(data.get("notifyWebhook") or ""),
        "notifyServerChan": str(data.get("notifyServerChan") or ""),
        "notifyBark": str(data.get("notifyBark") or ""),
    }


@router.post("/comments_mirror")
def save_comments_mirror(payload: Dict[str, Any] = Body(...)):
    path = _mirror_config_path()
    if not path:
        return {"success": False, "message": "还没配置博客路径（设置 → 项目仓库设置）"}

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}

    for key in _MIRROR_KEYS:
        if key not in payload:
            continue
        value = str(payload.get(key) or "").strip()
        if value:
            data[key] = value
        else:
            data.pop(key, None)

    if payload.get("clearToken"):
        data.pop("githubToken", None)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {"success": True, "message": "✅ 已保存（立刻生效，不用重建）"}


# =========================================================
# 🚀 接口 1：读取配置 (GET) - 终极安全隔离版 (🌟 修复布尔值读取)
# =========================================================
@router.get("/get")
def get_site_config():
    config_path = get_config_path()
    if not config_path:
        return {"success": False, "message": "未能找到 siteConfig.ts 文件"}

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            content = f.read()

        parsed_config = {}
        root_content = content

        # 1. 🌟 预先提取并隔离所有已知的“嵌套对象”，防止内部属性泄露到外层！
        known_dicts = ['social', 'gitalkConfig', 'geminiConfig', 'icpConfig']
        for dict_name in known_dicts:
            dict_match = re.search(rf'{dict_name}\s*:\s*\{{([\s\S]+?)\}}', content)
            if dict_match:
                dict_str = dict_match.group(1)
                # 从根内容中剔除，防止下面的通用正则去抓里面的零散数据
                root_content = re.sub(rf'{dict_name}\s*:\s*\{{[\s\S]+?\}},?', '', root_content)

                sub_dict = {}
                # 提取字符串（支持安全匹配包含 \n 的字符串）
                for m in re.finditer(r'([a-zA-Z0-9_]+)\s*:\s*(["\'])([\s\S]*?)\2', dict_str):
                    # 将转义的 \\n 恢复为真实的换行，供前端显示
                    sub_dict[m.group(1)] = m.group(3).replace('\\n', '\n')

                # Gitalk 的管理员数组特供处理
                if dict_name == 'gitalkConfig':
                    admin_match = re.search(r'admin\s*:\s*\[(.*?)\]', dict_str)
                    if admin_match:
                        admin_raw = admin_match.group(1)
                        sub_dict['admin'] = [x.strip(" \"'") for x in admin_raw.split(',') if x.strip(" \"'")]
                    else:
                        sub_dict['admin'] = []

                parsed_config[dict_name] = sub_dict

        # 1.5 🌟 数组字段也要一起返回！
        #     ⚠️ 这里以前只抓「字符串 / 布尔 / 数字」，**数组一个都没返回** ✗
        #     后果：设置页里那几个列表（背景图 bgImages、音乐 cloudMusicIds、弹幕 danmakuList、
        #     页脚徽章 footerBadges、主题色 themeColors）读到的其实是**构建时打进产物的旧快照**，
        #     于是一模一样的怪事就来了 ——「加了一张背景图 → 更新本地 → 刷新 → 新图不见了」，
        #     而服务器上图片和 siteConfig.ts 明明都写进去了（就是读的时候没带回来）。
        known_arrays = ['themeColors', 'bgImages', 'cloudMusicIds', 'danmakuList', 'footerBadges']
        for arr_name in known_arrays:
            arr_match = re.search(rf'{arr_name}\s*:\s*\[([\s\S]*?)\]', content)
            if not arr_match:
                continue
            arr_str = arr_match.group(1)
            # 从根内容里剔除，免得数组里的字符串/对象属性被下面的通用正则当成外层字段抓走
            root_content = re.sub(rf'{arr_name}\s*:\s*\[[\s\S]*?\],?', '', root_content, count=1)

            if arr_name == 'footerBadges':
                # 对象数组：[{ "name": …, "color": …, "svg": … }, …]
                # ⚠️ 两处坑：键是**带引号**的（"name": 而不是 name:）；字符串里还有转义的 \" （svg 里全是）
                #    所以这里用能吃掉转义的字符串正则，再手动还原 \" 和 \n
                items = []
                for obj in re.finditer(r'\{([\s\S]*?)\}', arr_str):
                    item = {}
                    for m in re.finditer(r'["\']?([A-Za-z0-9_]+)["\']?\s*:\s*"((?:[^"\\]|\\.)*)"', obj.group(1)):
                        item[m.group(1)] = m.group(2).replace('\\"', '"').replace('\\n', '\n')
                    if item:
                        items.append(item)
                parsed_config[arr_name] = items
            else:
                # 字符串 / 数字 / 布尔数组
                vals = []
                for m in re.finditer(r'"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|(true|false|-?\d+(?:\.\d+)?)', arr_str):
                    if m.group(1) is not None:
                        vals.append(m.group(1).replace('\\"', '"').replace('\\n', '\n'))
                    elif m.group(2) is not None:
                        vals.append(m.group(2).replace("\\'", "'").replace('\\n', '\n'))
                    else:
                        raw = m.group(3)
                        if raw == 'true':
                            vals.append(True)
                        elif raw == 'false':
                            vals.append(False)
                        elif '.' in raw:
                            vals.append(float(raw))
                        else:
                            vals.append(int(raw))
                parsed_config[arr_name] = vals

        # 2. 🌟 核心升级：提取外层基础变量（现在支持 字符串、布尔值、数字！）
        for match in re.finditer(r'([a-zA-Z0-9_]+)\s*:\s*(?:(["\'])([\s\S]*?)\2|(true|false|\d+))', root_content):
            key = match.group(1)
            str_val = match.group(3) # 匹配到的字符串
            raw_val = match.group(4) # 匹配到的布尔或数字

            if str_val is not None:
                parsed_config[key] = str_val.replace('\\n', '\n')
            elif raw_val == 'true':
                parsed_config[key] = True
            elif raw_val == 'false':
                parsed_config[key] = False
            elif raw_val.isdigit():
                parsed_config[key] = int(raw_val)

        return {"success": True, "data": parsed_config}
    except Exception as e:
        return {"success": False, "message": f"解析失败: {str(e)}"}


# =========================================================
# 🚀 接口 2：写入配置 (POST) - 白名单防漏防崩溃版
# =========================================================
@router.post("/update")
def update_site_config(payload: Dict[str, Any] = Body(...)):
    updates = payload.get("updates", {})
    if not updates:
        return {"success": False, "message": "没有收到需要更新的数据"}

    config_path = get_config_path()
    if not config_path:
        return {"success": False, "message": "未能扫描到 siteConfig.ts"}

    # 🌟 核心防线：绝对安全的根节点白名单！
    VALID_ROOT_KEYS = {
        "title", "authorName", "bio", "avatarUrl", "useGradient", "themeColors",
        "bgImages", "defaultPostCover", "photoWallImage", "cloudMusicIds", "social",
        "counts", "chatterTitle", "chatterDescription", "picBedName", "picBedUrl",
        "picBedToken", "danmakuList", "gitalkConfig", "buildDate", "footerBadges",
        "icpConfig", "geminiConfig",
        "faviconUrl",
        "navTitle",
        "navSuffix",
        "navAfter",
        "friendLinkApplyFormat",
        "enableLevelSystem" # 👈 你加的字段在这里，完美！
    }

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            content = f.read()

        print("\n" + "=" * 50)
        print(f"🔥 启动物理引擎，目标文件: {config_path}")
        updated_count = 0

        for key, value in updates.items():

            # 拦截非白名单字段，彻底防止二次覆写灾难
            if key not in VALID_ROOT_KEYS:
                print(f"  🛑 拦截非根节点危险字段 -> [{key}]")
                continue

            # 专属通道 1：Gitalk 特殊格式组装
            if key == "gitalkConfig":
                admin_list = value.get("admin", [])
                if isinstance(admin_list, str):
                    admin_list = [admin_list]
                admin_str = '["' + '", "'.join(admin_list) + '"]'

                # 安全转义客户端凭据
                cid = json.dumps(value.get('clientID', ''), ensure_ascii=False)
                csec = json.dumps(value.get('clientSecret', ''), ensure_ascii=False)
                repo = json.dumps(value.get('repo', ''), ensure_ascii=False)
                owner = json.dumps(value.get('owner', ''), ensure_ascii=False)

                gitalk_ts_code = f"""{{
    clientID: {cid},
    clientSecret: {csec},
    repo: {repo},
    owner: {owner},
    admin: {admin_str},
  }}"""
                pattern = rf"({key}\s*:\s*)\{{[\s\S]*?\}}"
                if re.search(pattern, content):
                    content = re.sub(pattern, lambda m: m.group(1) + gitalk_ts_code, content, count=1)
                    print(f"  ✅ 成功修改并落盘(专列) -> [{key}]")
                    updated_count += 1
                continue

            # ================= 原有的通用处理逻辑 =================
            # 🌟 核心修复：这里原本就支持将 bool 转换成 'true' 或 'false' 字符串写入，所以 POST 没问题！
            if isinstance(value, str):
                val_str = json.dumps(value, ensure_ascii=False)
            elif isinstance(value, bool):
                val_str = str(value).lower() # 👈 这里完美的把 bool 变成了 'true' / 'false'
            elif isinstance(value, dict):
                val_str = dict_to_ts_string(value, indent=2)
            else:
                val_str = json.dumps(value, ensure_ascii=False)

            if isinstance(value, dict):
                pattern = rf"({key}\s*:\s*)\{{[\s\S]*?\}}"
            elif isinstance(value, list):
                pattern = rf"({key}\s*:\s*)\[[\s\S]*?\]"
            else:
                # 写入正则也能匹配布尔值和数字，所以替换没有问题
                pattern = rf"({key}\s*:\s*)(['\"`][\s\S]*?['\"`]|true|false|\d+)"

            if re.search(pattern, content):
                content = re.sub(pattern, lambda m: m.group(1) + val_str, content, count=1)
                print(f"  ✅ 成功修改并落盘 -> [{key}]")
                updated_count += 1

        # 写入物理磁盘
        with open(config_path, 'w', encoding='utf-8') as f:
            f.write(content)

        # 🎵 歌单额外落一份运行时配置（siteConfig.ts 那串会被打进前端产物，见上面注释）
        if "cloudMusicIds" in updates:
            music_path = _music_config_path()
            if not music_path:
                print("  ⚠️ 歌单运行时配置未写入：还没配置博客路径（设置 → 项目仓库设置）")
            else:
                raw_ids = updates.get("cloudMusicIds")
                ids = [str(x).strip() for x in raw_ids if str(x).strip()] if isinstance(raw_ids, list) else []
                try:
                    os.makedirs(os.path.dirname(music_path), exist_ok=True)
                    with open(music_path, "w", encoding="utf-8") as f:
                        json.dump({"cloudMusicIds": ids}, f, ensure_ascii=False, indent=2)
                    print(f"  🎵 歌单运行时配置已同步 -> {music_path}（{len(ids)} 首）")
                except Exception as e:
                    print(f"  ⚠️ 歌单运行时配置写入失败: {e}")

        print(f"🔥 任务圆满完成，共刷新 {updated_count} 个字段")
        print("=" * 50 + "\n")

        return {"success": True, "message": "本地 siteConfig.ts 修改成功！"}

    except Exception as e:
        print(f"❌ 物理写入发生灾难性错误: {str(e)}")
        return {"success": False, "message": f"文件读写错误: {str(e)}"}