import os
import json
import time
import yaml
from fastapi import APIRouter, Request
from datetime import datetime
import re
import markdown
from markdownify import markdownify as _md_raw
import re as _re

_SUP_SUB_RE = _re.compile(r"<(sup|sub)(?:\s[^>]*)?>.*?</\1>", _re.S | _re.I)

def md(html, *args, **kwargs):
    stash = []
    def _keep(m):
        stash.append(m.group(0))
        return "@@SUPSUB%d@@" % (len(stash) - 1)
    out = _md_raw(_SUP_SUB_RE.sub(_keep, html), *args, **kwargs)
    for i, tag in enumerate(stash):
        out = out.replace("@@SUPSUB%d@@" % i, tag)
    return out
from .markdown_utils import (
    MathExtension,
    code_language_callback,
    collapse_blank_lines,
    continue_ordered_lists,
    glue_image_blocks,
    protect_inline_tags,
    render_callouts,
    restore_callouts,
    restore_inline_tags,
    restore_tables,
    separate_blockquotes,
    split_callout_blockquotes,
    stash_callouts,
    stash_tables,
    unbreak_image_lines,
)

router = APIRouter()

CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))


def get_manager_drafts_dir() -> str:
    drafts_dir = os.path.join(PROJECT_ROOT, "manager_data", "drafts")
    if not os.path.exists(drafts_dir):
        os.makedirs(drafts_dir)
    return drafts_dir


@router.post("/save")
async def save_draft(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "后端无法解析传来的 JSON 数据"}

    drafts_dir = get_manager_drafts_dir()
    draft_id = payload.get("id")

    if not draft_id or draft_id == 'new':
        draft_id = f"draft_{int(time.time() * 1000)}"
    elif payload.get("type") == "about":
        draft_id = "about"

    draft_data = {
        "id": draft_id,
        "type": payload.get("type", "post"),
        "title": payload.get("title", ""),
        "description": payload.get("description", ""),
        "content": payload.get("content", ""),
        "cover": payload.get("cover", ""),
        "tags": payload.get("tags", []),
        "mood": payload.get("mood", ""),
        "date": payload.get("date", ""),
        "lastModified": int(time.time() * 1000)
    }

    file_path = os.path.join(drafts_dir, f"{draft_id}.json")
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(draft_data, f, ensure_ascii=False, indent=2)
        return {"success": True, "message": "草稿已安全落盘", "id": draft_id}
    except Exception as e:
        return {"success": False, "message": f"草稿保存失败: {str(e)}"}


@router.post("/list")
async def list_drafts(request: Request):
    drafts_dir = get_manager_drafts_dir()
    drafts = []
    if not os.path.exists(drafts_dir):
        return {"success": True, "drafts": []}

    for filename in os.listdir(drafts_dir):
        if filename.endswith(".json"):
            file_path = os.path.join(drafts_dir, filename)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    content = data.get("content", "")
                    data["contentPreview"] = content[:100] if content else ""
                    if "content" in data: del data["content"]
                    drafts.append(data)
            except Exception:
                continue
    drafts.sort(key=lambda x: x.get("lastModified", 0), reverse=True)
    return {"success": True, "drafts": drafts}


@router.post("/get")
async def get_draft(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    raw_id = payload.get("id", "").replace(".md", "")
    doc_type = payload.get("type", "post")
    base_dir = PROJECT_ROOT
    drafts_dir = get_manager_drafts_dir()

    file_path = os.path.join(drafts_dir, f"{raw_id}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            draft = json.load(f)
        if isinstance(draft.get("content"), str):
            draft["content"] = unbreak_image_lines(draft["content"])
        return {"success": True, "draft": draft}

    target_md = None
    if raw_id == "about" or doc_type == "about":
        target_md = os.path.join(base_dir, "app", "about", "about.md")
    else:
        folder = "posts" if doc_type == "post" else "chatters"
        target_md = os.path.join(base_dir, folder, f"{raw_id}.md")

    if target_md and os.path.exists(target_md):
        try:
            with open(target_md, "r", encoding="utf-8") as f:
                raw_content = f.read()

            title, cover, description, mood, date = "", "", "", "", ""
            tags = []
            md_body = raw_content

            if raw_content.strip().startswith("---"):
                parts = raw_content.split("---", 2)
                if len(parts) >= 3:
                    try:
                        fm = yaml.safe_load(parts[1])
                        if fm:
                            title = fm.get("title", "")
                            cover = fm.get("cover", "")
                            description = fm.get("description", "")
                            mood = fm.get("mood", "")
                            date = fm.get("date", "")
                            tags = fm.get("tags", [])
                            if not isinstance(tags, list): tags = [tags] if tags else []
                        md_body = parts[2].strip()
                    except:
                        pass

            md_body = split_callout_blockquotes(md_body)
            md_body = separate_blockquotes(md_body)
            md_body = continue_ordered_lists(md_body)
            html_content = markdown.markdown(
                md_body,
                extensions=['fenced_code', 'codehilite', 'tables', 'nl2br', 'sane_lists', MathExtension()],
                extension_configs={
                    'codehilite': {'noclasses': True, 'pygments_style': 'monokai', 'guess_lang': False},
                },
            )
            html_content = unbreak_image_lines(html_content)
            html_content = render_callouts(html_content)

            draft_data = {
                "id": raw_id,
                "type": doc_type,
                "title": title or ("关于我" if doc_type == "about" else ""),
                "content": html_content,
                "tags": tags,
                "cover": cover,
                "description": description,
                "mood": mood,
                "date": date
            }
            return {"success": True, "draft": draft_data}
        except Exception as e:
            return {"success": False, "message": f"解析物理文件失败: {str(e)}"}

    return {"success": False, "message": "未找到相关文件"}


@router.post("/delete")
async def delete_draft(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    raw_id = payload.get("id", "").replace(".md", "").replace(".json", "")
    base_dir = PROJECT_ROOT
    drafts_dir = get_manager_drafts_dir()

    possible_paths = [
        os.path.join(drafts_dir, f"{raw_id}.json"),
        os.path.join(base_dir, "posts", f"{raw_id}.md"),
        os.path.join(base_dir, "chatters", f"{raw_id}.md")
    ]

    deleted_count = 0
    for p in possible_paths:
        if os.path.exists(p):
            try:
                os.remove(p)
                deleted_count += 1
            except:
                continue

    if deleted_count > 0:
        return {"success": True, "message": f"已彻底销毁相关文件"}
    return {"success": False, "message": "未找到相关文件"}


@router.post("/sync_local")
async def sync_local_operations(request: Request):
    payload = await request.json()
    operations = payload.get("operations", [])
    base_dir = PROJECT_ROOT
    drafts_dir = get_manager_drafts_dir()
    results = []

    for op in operations:
        if op.get("type") == "publish_article":
            data = op.get("value", {})
            doc_type = data.get("type", "post")
            doc_id = data.get("id", "")

            final_id = doc_id
            if not final_id or final_id == 'new':
                final_id = f"{doc_type}_{int(time.time())}"

            raw_html = data.get("content", "")

            raw_html = re.sub(
                r"<p>(?:\s|&nbsp;|&#12288;|\u200b|\u200d|\ufeff|<br\s*/?>)*</p>",
                "<br>\u200d",
                raw_html,
            )

            raw_html, inline_tags = protect_inline_tags(raw_html)
            raw_html, tables = stash_tables(raw_html)
            raw_html, callouts = stash_callouts(raw_html)
            md_content = md(raw_html, heading_style="ATX", keep=['img', 'br'], code_language_callback=code_language_callback)

            md_content = re.sub(r'<br\s*\/?>', '\n\n', md_content)

            md_content = restore_tables(md_content, tables)
            md_content = restore_callouts(md_content, callouts)
            md_content = collapse_blank_lines(md_content)
            md_content = glue_image_blocks(md_content)

            md_content = split_callout_blockquotes(md_content)
            md_content = restore_inline_tags(md_content, inline_tags)

            input_date = str(data.get("date", "")).strip()
            if input_date:
                if len(input_date) <= 10:
                    current_time = datetime.now().strftime("%H:%M:%S")
                    final_date = f"{input_date} {current_time}"
                else:
                    final_date = input_date
            else:
                final_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            fm = {
                "title": data.get("title", ""),
                "date": final_date,
                "tags": data.get("tags", []),
                "mood": data.get("mood", ""),
                "cover": data.get("cover", ""),
                "description": data.get("description", "")
            }
            final_text = f"---\n{yaml.dump(fm, allow_unicode=True, sort_keys=False)}---\n\n{md_content}"

            if doc_type == "about":
                save_path = os.path.join(base_dir, "app", "about", "about.md")
            else:
                folder = "posts" if doc_type == "post" else "chatters"
                save_path = os.path.join(base_dir, folder, f"{final_id}.md")

            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            with open(save_path, "w", encoding="utf-8") as f:
                f.write(final_text)

            draft_path = os.path.join(drafts_dir, f"{doc_id}.json")
            if os.path.exists(draft_path):
                try:
                    os.remove(draft_path)
                except:
                    pass

            results.append(f"✅ 已发布: {fm['title']}")

    return {"success": True, "message": "\n".join(results)}


@router.get("/all_tags")
async def get_all_historical_tags():
    base_dir = PROJECT_ROOT
    scan_dirs = {"post": os.path.join(base_dir, "posts"), "chatter": os.path.join(base_dir, "chatters")}
    tag_collections = {"post": set(), "chatter": set()}
    fm_regex = re.compile(r'---\s*\n(.*?)\n---\s*', re.DOTALL)

    for doc_type, dir_path in scan_dirs.items():
        if not os.path.exists(dir_path): continue
        for filename in os.listdir(dir_path):
            if filename.endswith(".md"):
                try:
                    with open(os.path.join(dir_path, filename), "r", encoding="utf-8") as f:
                        match = fm_regex.search(f.read())
                        if match:
                            fm = yaml.safe_load(match.group(1))
                            if fm and "tags" in fm:
                                for t in (fm["tags"] if isinstance(fm["tags"], list) else [fm["tags"]]):
                                    tag_collections[doc_type].add(str(t))
                except:
                    continue
    return {"success": True, "postTags": sorted(list(tag_collections["post"])),
            "chatterTags": sorted(list(tag_collections["chatter"]))}