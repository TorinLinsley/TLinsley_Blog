"""编辑器 HTML → Markdown 的公共小工具。

背景一：markdownify 默认会把 `<pre><code class="language-xxx">` 上的语言类名丢掉，
落盘变成裸 ``` 围栏。表现就是——编辑器里明明选了 PowerShell，保存后语言就没了，
前台代码块的复制按钮也就只剩一个图标、标注不出语言。

markdownify 自带 `code_language_callback` 选项（见其 convert_pre），这里把它接上。

背景二：markdownify 转表格会**每行后面多塞一条分隔线**（`| --- | --- |`），
落盘的表格直接是坏的。表格这里自己转，输出标准 GFM 表格。
"""

import re
from typing import List, Optional, Tuple

import html as _html

from markdown.extensions import Extension
from markdown.postprocessors import Postprocessor
from markdown.preprocessors import Preprocessor

_IGNORED = {"none", "nohighlight", "plain", "plaintext", "text", "txt", "hljs", "null"}

_TABLE_SLOT = "\ue000TABLE{}\ue001"


def code_language_callback(el) -> Optional[str]:
    """从 <pre><code class="language-powershell"> 里取出 `powershell`。

    markdownify 会把 <pre> 元素传进来，取不到就返回 None（保持它原本的行为）。
    """
    try:
        code = el.find("code")
    except AttributeError:
        return None
    if code is None:
        return None

    raw = code.get("class")
    if isinstance(raw, str):
        classes = raw.split()
    elif isinstance(raw, (list, tuple)):
        classes = [str(c) for c in raw]
    else:
        classes = []

    for cls in classes:
        name = cls.strip()
        if not name.startswith("language-"):
            continue
        name = name[len("language-"):].strip()
        if name and name.lower() not in _IGNORED:
            return name
    return None


ORDERED_LINE = re.compile(r"^(\d{1,9})([.)])([ \t]+)(.*)$")
UNORDERED_LINE = re.compile(r"^[-*+][ \t]+")
HEADING_LINE = re.compile(r"^#{1,6}[ \t]+")
HR_LINE = re.compile(r"^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$")
FENCE_LINE = re.compile(r"^[ \t]{0,3}(`{3,}|~{3,})")


def _fence_hit(line: str):
    marker = FENCE_LINE.match(line)
    if not marker:
        return None
    text = marker.group(1)
    return (text[0], len(text))


def _track_fence(line: str, state):
    hit = _fence_hit(line)
    if not hit:
        return state, False
    ch, size = hit
    if not state:
        return (ch, size), True
    if state[0] == ch and size >= state[1]:
        return None, True
    return state, True


def continue_ordered_lists(md: str) -> str:
    lines = str(md or "").split("\n")
    fence = ""
    last = 0
    resumable = False
    for i, line in enumerate(lines):
        hit = FENCE_LINE.match(line)
        if hit:
            ch = hit.group(1)[0]
            fence = "" if fence == ch else (fence or ch)
            last = 0
            resumable = False
            continue
        if fence:
            continue
        ordered = ORDERED_LINE.match(line)
        if ordered:
            n = int(ordered.group(1))
            if resumable and last > 0:
                want = last + 1
                if n != want:
                    lines[i] = "%d%s%s%s" % (want, ordered.group(2), ordered.group(3), ordered.group(4))
                    n = want
            last = n
            resumable = True
            continue
        if HEADING_LINE.match(line) or HR_LINE.match(line) or UNORDERED_LINE.match(line):
            last = 0
            resumable = False
            continue
        if line.strip() == "" or line[:1] in (" ", "\t"):
            continue
        resumable = True
    return "\n".join(lines)


def collapse_blank_lines(markdown_text: str) -> str:
    """把连续空行压成一个（代码围栏内部**原样保留**）。

    为什么要做：预览用的是 python-markdown 的 nl2br 扩展，它会把**每个换行**都变成 <br>，
    于是 Markdown 里连着三个空行，在预览里就变成一坨实打实的空白（而编辑器是所见即所得，
    空行不会长出间距）—— 两边就对不上了。落盘前压成一个空行，两边才一致。
    """
    out: List[str] = []
    in_fence = False
    blanks = 0

    for line in markdown_text.split("\n"):
        stripped = line.strip()

        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            out.append(line)
            blanks = 0
            continue

        if in_fence:
            out.append(line)
            continue

        if stripped == "":
            blanks += 1
            if blanks <= 1:
                out.append("")
            continue

        blanks = 0
        out.append(line)

    return "\n".join(out)



_INVISIBLE = "\u200b\u200d\ufeff"

_IMG_LINE_RE = re.compile(r"^[" + _INVISIBLE + r"]*!\[[^\]]*\]\([^)]*\)\s*$")
_MARKER_LINE_RE = re.compile(
    r"^[\s" + _INVISIBLE + r"]*[" + _INVISIBLE + r"][\s" + _INVISIBLE + r"]*$"
)
_BAD_LEAD_RE = re.compile(
    r"^(?:#{1,6}(?:\s|$)|>|\||```|~~~|[-*+](?:\s|$)|\d+[.)](?:\s|$)|<|!\[|(?:[-*_]\s*){3,}$)"
)


def glue_image_blocks(markdown_text: str) -> str:
    """图片单独成行时，把它**上面那个空行**去掉（和编辑器里看到的一样紧贴上一段）。

    只处理顶层正文；标题/列表/引用/表格/围栏上面的图片、以及围栏内部，一律原样保留。
    """
    lines = markdown_text.split("\n")
    out: List[str] = []
    fence: Optional[str] = None

    for line in lines:
        stripped = line.lstrip()
        marker = stripped[:3]

        if fence is None and marker in ("```", "~~~"):
            fence = marker
            out.append(line)
            continue
        if fence is not None:
            out.append(line)
            if stripped.startswith(fence):
                fence = None
            continue

        if _IMG_LINE_RE.match(stripped) and out and (
            out[-1].strip() == "" or _MARKER_LINE_RE.match(out[-1])
        ):
            popped: List[str] = []
            while out and (out[-1].strip() == "" or _MARKER_LINE_RE.match(out[-1])):
                popped.append(out.pop())

            prev = out[-1] if out else ""
            if prev.strip() and not _BAD_LEAD_RE.match(prev.lstrip()):
                out.append(re.sub(r"^[" + _INVISIBLE + r"]+", "", stripped))
            elif any(_MARKER_LINE_RE.match(l) for l in popped):
                out.append("")
                out.append(line)
            else:
                out.extend(reversed(popped))
                out.append(line)
            continue

        out.append(line)

    return "\n".join(out)



_BR_IMG_END_RE = re.compile(r"<br\s*/?>\s*(<img\b[^>]*>)\s*</p>", re.I)
_BR_IMG_RE = re.compile(r"<br\s*/?>\s*(<img\b[^>]*>)", re.I)
_INV_BEFORE_IMG_RE = re.compile(r"[" + _INVISIBLE + r"]+(?=<img\b)", re.I)
_P_RE = re.compile(r"<p\b[^>]*>[\s\S]*?</p>", re.I)
_IMG_ONLY_P_RE = re.compile(r"<p\b[^>]*>\s*(<img\b[^>]*>)\s*</p>", re.I)
_EMPTY_P_BEFORE_IMG_RE = re.compile(
    r"<p\b[^>]*>(?:\s|&nbsp;|&#12288;|<br\s*/?>|[" + _INVISIBLE + r"])*</p>\s*(?=<p\b[^>]*>\s*<img\b)",
    re.I,
)
_EMPTY_P_BEFORE_RAW_IMG_RE = re.compile(
    r"<p\b[^>]*>(?:\s|&nbsp;|&#12288;|<br\s*/?>|[" + _INVISIBLE + r"])*</p>\s*(?=<img\b)",
    re.I,
)


def _unbreak_image_paragraph(match: "re.Match[str]") -> str:
    """单个 <p>…</p>：把紧贴图片的 <br>/零宽标记清掉（没有图片就原样返回）"""
    block = match.group(0)
    if "<img" not in block:
        return block
    block = _INV_BEFORE_IMG_RE.sub("", block)
    block = _BR_IMG_END_RE.sub(r"</p>\n<p>\1</p>", block)
    block = _BR_IMG_RE.sub(r"</p>\n<p>\1</p>\n<p>", block)
    return block


def unbreak_image_lines(html: str) -> str:
    """读回来时去掉「图片上面那一行空白」（<br> 顶出来的、以及老文件残留的空行标记）"""
    out = _P_RE.sub(_unbreak_image_paragraph, html)
    for _ in range(6):
        trimmed = _EMPTY_P_BEFORE_IMG_RE.sub("", out)
        trimmed = _EMPTY_P_BEFORE_RAW_IMG_RE.sub("", trimmed)
        if trimmed == out:
            break
        out = trimmed
    out = _IMG_ONLY_P_RE.sub(r"\1", out)
    return out


def _cell_to_md(cell) -> str:
    """单元格内容 → 一行 Markdown 文本（单元格里不能出现换行和裸竖线，否则表格会散架）"""
    from markdownify import markdownify as md

    inner = "".join(str(child) for child in cell.children)
    text = md(inner, heading_style="ATX", keep=["img", "br"])
    text = text.replace("\u200d", "").replace("\u200b", "").replace("\ufeff", "")
    text = text.replace("|", "\\|")
    return " ".join(text.split())


def table_to_markdown(table_html: str) -> str:
    """<table> → 标准 GFM 表格（首行当表头）"""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return ""

    soup = BeautifulSoup(table_html, "html.parser")
    table = soup.find("table")
    if table is None:
        return ""

    rows: List[List[str]] = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"], recursive=False) or tr.find_all(["th", "td"])
        if not cells:
            continue
        rows.append([_cell_to_md(cell) for cell in cells])

    if not rows:
        return ""

    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]

    lines = [
        "| " + " | ".join(rows[0]) + " |",
        "| " + " | ".join(["---"] * width) + " |",
    ]
    lines += ["| " + " | ".join(row) + " |" for row in rows[1:]]

    return "\n\n" + "\n".join(lines) + "\n\n"


def stash_tables(raw_html: str) -> Tuple[str, List[str]]:
    """把 <table> 抠成占位符，返回 (处理后的 HTML, 已转换好的 Markdown 表格列表)"""
    tables: List[str] = []

    def _stash(match):
        tables.append(table_to_markdown(match.group(0)))
        return "\n\n" + _TABLE_SLOT.format(len(tables) - 1) + "\n\n"

    out = re.sub(r"<table\b[\s\S]*?</table>", _stash, raw_html, flags=re.IGNORECASE)
    return out, tables


def _quote_prefix_at(line: str, token: str) -> str:
    idx = line.find(token)
    if idx < 0:
        return ""
    lead = line[:idx]
    return lead.strip() if ">" in lead else ""


def expand_restore(text: str, token: str, block: str) -> str:
    """占位符在引用块里时，把替换出来的多行内容逐行加上同一个 `>` 前缀

    不这样做的后果：`> TLCODE0` 被换成裸围栏，围栏第 2 行起没有 `>`，
    引用块当场断掉，代码块/表格就掉到 callout 外面去了 ✗
    """
    pattern = re.compile(r"^([ \t]*(?:>[ \t]*)+)[ \t]*" + re.escape(token) + r"[ \t]*$", re.M)

    def repl(match):
        prefix = match.group(1).strip() or ">"
        out = []
        for ln in block.split("\n"):
            out.append((prefix + " " + ln) if ln.strip() else prefix)
        return "\n".join(out)

    if pattern.search(text):
        return pattern.sub(repl, text)
    return text.replace(token, "\n\n" + block + "\n\n")


def restore_tables(text: str, tables: List[str]) -> str:
    """把占位符换回转换好的 Markdown 表格"""
    for i, table in enumerate(tables):
        text = expand_restore(text, _TABLE_SLOT.format(i), table)
    return text



def separate_blockquotes(md_text: str) -> str:
    """把"空行分隔的相邻引用块"用 HTML 注释隔开，免得被并成一个（围栏内不动）"""
    lines = md_text.split("\n")
    out: List[str] = []
    fence: Optional[str] = None

    for i, line in enumerate(lines):
        stripped = line.lstrip()
        marker = stripped[:3]

        if fence is None and marker in ("```", "~~~"):
            fence = marker
        elif fence is not None and stripped.startswith(fence):
            fence = None

        if fence is None and line.strip() == "" and out:
            prev = next((l for l in reversed(out) if l.strip()), "")
            nxt = next((l for l in lines[i + 1:] if l.strip()), "")
            if prev.lstrip().startswith(">") and nxt.lstrip().startswith(">"):
                out.append(line)
                out.append("")
                out.append("<!-- -->")
                continue

        out.append(line)

    return "\n".join(out)



_CALLOUT_SLOT = "\ue002CALLOUT{}\ue003"


def callout_html_to_markdown(div_html: str) -> str:
    """render_callouts 生成的外壳 → `> [!type] 标题` + `> 正文`"""
    from markdownify import markdownify as _md

    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return ""

    soup = BeautifulSoup(div_html, "html.parser")
    box = soup.select_one("div.callout") or soup
    kind = str(box.get("data-callout") or "note").strip() or "note"

    title_el = box.select_one(".callout-title-text")
    if title_el is not None:
        title = _md(title_el.decode_contents(), heading_style="ATX").strip() or kind.capitalize()
    else:
        title = kind.capitalize()

    body_el = box.select_one(".callout-body")
    body_md = ""
    if body_el is not None:
        inner = "".join(str(c) for c in body_el.children)
        if inner.strip():
            body_md = _md(inner, heading_style="ATX", keep=["img", "br"])
            body_md = re.sub(r"<br\s*/?>", "\n", body_md)
            body_md = re.sub(r"\n{3,}", "\n\n", body_md).strip()

    lines = [f"> [!{kind}] {title}".rstrip(), ">"]
    for ln in body_md.split("\n"):
        lines.append(("> " + ln).rstrip() if ln.strip() else ">")
    return "\n".join(lines)


def stash_callouts(raw_html: str) -> Tuple[str, List[str]]:
    """把 callout 外壳抠成占位符，返回 (处理后的 HTML, 已转好的 Markdown 列表)

    ⚠️ 这里必须用 BeautifulSoup 而不是正则：callout 是**三层嵌套 div**
       （callout > callout-title/callout-body），正则数不清括号 ✗
       （我第一版就是正则，结果一个都没抠出来，span/svg 直接漏进 .md ✗）
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return raw_html, []

    soup = BeautifulSoup(raw_html, "html.parser")
    boxes = soup.select("div.callout")
    if not boxes:
        return raw_html, []

    callouts: List[str] = []
    for box in boxes:
        callouts.append(callout_html_to_markdown(str(box)))
        slot = "\n\n" + _CALLOUT_SLOT.format(len(callouts) - 1) + "\n\n"
        box.replace_with(soup.new_string(slot))
    return str(soup), callouts


def restore_callouts(text: str, callouts: List[str]) -> str:
    """把占位符换回 `> [!type] 标题` 形式的 Markdown"""
    for i, md_text in enumerate(callouts):
        text = expand_restore(text, _CALLOUT_SLOT.format(i), md_text)
    return text



def _icon(inner: str) -> str:
    return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'
    )


CALLOUT_ICONS = {
    "note": _icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    "info": _icon('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/>'),
    "tip": _icon('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z"/>'),
    "hint": _icon('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z"/>'),
    "success": _icon('<path d="M20 6 9 17l-5-5"/>'),
    "check": _icon('<path d="M20 6 9 17l-5-5"/>'),
    "done": _icon('<path d="M20 6 9 17l-5-5"/>'),
    "warning": _icon('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    "caution": _icon('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    "attention": _icon('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    "danger": _icon('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>'),
    "error": _icon('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
    "failure": _icon('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
    "bug": _icon('<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>'),
    "question": _icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
    "help": _icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
    "faq": _icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
    "quote": _icon('<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M15 7h2v4a4 4 0 0 1-4 4"/>'),
    "cite": _icon('<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M15 7h2v4a4 4 0 0 1-4 4"/>'),
    "example": _icon('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
    "abstract": _icon('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
    "summary": _icon('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
    "todo": _icon('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>'),
}

_CALLOUT_RE = re.compile(
    r"<blockquote>\s*<p>\s*\[!\s*([A-Za-z0-9_-]+)\s*\]\s*[-+]?\s*([\s\S]*?)</p>([\s\S]*?)</blockquote>",
    re.IGNORECASE,
)


def _split_title_and_body(first_paragraph: str) -> Tuple[str, str]:
    """首段 HTML → (标题行, 首段里剩下的正文)。

    ⚠️ 老代码把首段**整个**当标题，于是 `> [!note] 标题 ↵ 正文` 这种写法里
    标题行下面的正文会被吃掉 ✗。这里到第一个 `<br>` 为止算标题，其余算正文。
    """
    parts = re.split(r"<br\s*/?>", first_paragraph, maxsplit=1)
    title = parts[0].strip()
    rest = parts[1].lstrip("\n") if len(parts) > 1 else ""
    return title, rest


def render_callouts(html: str) -> str:
    """把 Obsidian 的 > [!type] 标题 引用块渲染成带图标的 callout（普通引用不动）"""

    def _repl(match: "re.Match[str]") -> str:
        kind = match.group(1).lower()
        title, first_body = _split_title_and_body(match.group(2) or "")
        title = title or kind.capitalize()
        rest = (("<p>" + first_body + "</p>") if first_body.strip() else "") + (match.group(3) or "")
        icon = CALLOUT_ICONS.get(kind, CALLOUT_ICONS["note"])
        return (
            '<div class="callout callout-' + kind + '" data-callout="' + kind + '">'
            '<div class="callout-title"><span class="callout-icon">' + icon + "</span>"
            '<span class="callout-title-text">' + title + "</span></div>"
            '<div class="callout-body">' + rest + "</div>"
            "</div>"
        )

    return _CALLOUT_RE.sub(_repl, html)



_CALLOUT_LINE = re.compile(r"^\s*>\s*\[!\s*[A-Za-z0-9_-]+\s*\]")


def split_callout_blockquotes(md_text: str) -> str:
    """把「一个引用块里塞了多个 callout」拆成多个独立引用块（其它内容原样保留）"""
    out: List[str] = []
    fence: Optional[str] = None

    for line in md_text.split("\n"):
        stripped = line.lstrip()
        marker = stripped[:3]

        if fence is None and marker in ("```", "~~~"):
            fence = marker
        elif fence is not None and stripped.startswith(fence):
            fence = None
        elif (
            fence is None
            and _CALLOUT_LINE.match(line)
            and out
            and out[-1].strip()
            and out[-1].lstrip().startswith(">")
        ):
            out.append("")
            out.append("<!-- -->")
            out.append("")

        out.append(line)

    return "\n".join(out)



_MATH_SLOT = "\ue100{}\ue101"

_MATH_RE = re.compile(
    r"(?P<code>`+[^`]*`+)"
    r"|(?P<display>\$\$[\s\S]+?\$\$)"
    r"|(?P<inline>\$(?!\s)(?:\\.|[^$\n])*?[^\s$]\$)",
)


def _is_currency(inner: str) -> bool:
    """`$100` / `$1,234.5` 这种是钱不是公式（Obsidian 也是这么躲的）"""
    return bool(re.fullmatch(r"[\d,.\s]+", inner))


class MathPreprocessor(Preprocessor):
    def __init__(self, md, stash: List[str]):
        super().__init__(md)
        self.stash = stash

    def run(self, lines: List[str]) -> List[str]:
        out: List[str] = []
        buf: List[str] = []
        fence: Optional[str] = None

        def flush():
            if buf:
                out.append(self._replace("\n".join(buf)))
                buf.clear()

        for line in lines:
            stripped = line.lstrip()
            marker = stripped[:3]
            if fence is None and marker in ("```", "~~~"):
                flush()
                fence = marker
                out.append(line)
                continue
            if fence is not None:
                out.append(line)
                if stripped.startswith(fence):
                    fence = None
                continue
            buf.append(line)
        flush()
        return out

    def _replace(self, chunk: str) -> str:
        def repl(m: "re.Match[str]") -> str:
            if m.group("code"):
                return m.group("code")
            tex = m.group("display") or m.group("inline")
            if not tex:
                return m.group(0)
            inner = tex[2:-2] if m.group("display") else tex[1:-1]
            if _is_currency(inner):
                return m.group(0)
            self.stash.append(tex)
            return _MATH_SLOT.format(len(self.stash) - 1)

        return _MATH_RE.sub(repl, chunk)


class MathPostprocessor(Postprocessor):
    def __init__(self, md, stash: List[str]):
        super().__init__(md)
        self.stash = stash

    def run(self, text: str) -> str:
        for i, tex in enumerate(self.stash):
            text = text.replace(_MATH_SLOT.format(i), _html.escape(tex))
        return text


class MathExtension(Extension):
    """给 python-markdown 加上「别碰数学公式」的扩展。

    用法：`markdown.markdown(text, extensions=[..., MathExtension()])`
    ⚠️ 必须每次渲染 new 一个（占位符清单是挂在实例上的，不能跨次复用）。
    """

    def extendMarkdown(self, md):  # noqa: N802（python-markdown 的接口就是驼峰）
        stash: List[str] = []
        md.preprocessors.register(MathPreprocessor(md, stash), "xh_math", 40)
        md.postprocessors.register(MathPostprocessor(md, stash), "xh_math", 30)


_KEEP_INLINE_RE = re.compile(
    r"<(span|mark|u|sub|sup)\b(?![^>]*class=\"callout-)[^>]*>.*?</\1\s*>",
    re.S | re.I,
)
_INLINE_SLOT = "\ue000INLINE{}\ue001"

_EMPH_WRAP_INLINE_RE = re.compile(
    r"<(strong|b|em|i|s|del|strike)\b[^>]*>"
    r"(?:(?!</\1\s*>).)*?"
    r"<(?:span|mark|u|sub|sup)\b[^>]*>.*?</(?:span|mark|u|sub|sup)\s*>"
    r"(?:(?!</\1\s*>).)*?"
    r"</\1\s*>",
    re.S | re.I,
)


def protect_inline_tags(html: str):
    """把需要原样保留的内联标签换成占位符，返回 (处理后的 HTML, 原标签列表)"""
    stash = []

    def _stash(m):
        stash.append(m.group(0))
        return _INLINE_SLOT.format(len(stash) - 1)

    html = _EMPH_WRAP_INLINE_RE.sub(_stash, html)
    return _KEEP_INLINE_RE.sub(_stash, html), stash


def restore_inline_tags(text: str, stash) -> str:
    """把占位符换回原来的标签"""
    for i, raw in enumerate(stash):
        text = text.replace(_INLINE_SLOT.format(i), raw)
    return text


LIST_MARK_RE = re.compile(r"^([ \t]+)([-*+]|\d{1,9}[.)])([ \t]+)")



def extract_list_fences(md: str):
    lines = str(md or "").split("\n")
    blocks = []
    item_re = re.compile(r"^[ \t]{0,3}([-*+]|\d{1,9}[.)])[ \t]+")
    any_fence = re.compile(r"^([ \t]*)(`{3,}|~{3,})(.*)$")
    i = 0
    total = len(lines)
    while i < total:
        line = lines[i]
        fence = any_fence.match(line)
        indent = len(line) - len(line.lstrip(" "))
        if fence and indent > 0:
            in_list = False
            seen = 0
            j = i - 1
            while j >= 0 and seen < 8:
                prev = lines[j]
                j -= 1
                if prev.strip() == "":
                    continue
                seen += 1
                if item_re.match(prev):
                    in_list = True
                    break
                if prev.lstrip().startswith(">"):
                    continue
                break
            if in_list:
                language = (fence.group(3) or "").strip().split(" ")[0] if (fence.group(3) or "").strip() else ""
                body = []
                i += 1
                while i < total:
                    cur = lines[i]
                    stripped = cur.strip()
                    if stripped.startswith("```") or stripped.startswith("~~~"):
                        i += 1
                        break
                    body.append(cur[indent:] if len(cur) >= indent else cur)
                    i += 1
                blocks.append(("TLFENCE%d" % len(blocks), language, "\n".join(body)))
                continue
        i += 1
    return md, blocks


def restore_list_fences(html: str, blocks, render) -> str:
    if not blocks:
        return html
    pattern = re.compile(r"<p>[ \t]*<code[^>]*>(.*?)</code>[ \t]*</p>", re.S)
    for _token, language, body in blocks:
        target = re.sub(r"\s+", " ", ((language or "") + " " + " ".join(body.split("\n"))).strip()).strip()
        if not target:
            continue
        code_html = render(language, body)
        def repl(match, target=target, code_html=code_html):
            inner = re.sub(r"<[^>]+>", "", match.group(1))
            if re.sub(r"\s+", " ", inner).strip() == target:
                return code_html
            return match.group(0)
        html = pattern.sub(repl, html)
        html = re.sub(
            r"(</li>\s*</ul>)\s*(" + re.escape(code_html) + r")",
            lambda m: m.group(2) + m.group(1),
            html,
            count=1,
        )
    return html


def normalize_list_indent(md: str) -> str:
    lines = str(md or "").split("\n")
    out = []
    fence = None
    for line in lines:
        was_inside = fence is not None
        fence, is_fence = _track_fence(line, fence)
        if is_fence or was_inside:
            out.append(line)
            continue
        mark = LIST_MARK_RE.match(line)
        if mark:
            indent = len(mark.group(1).replace("\t", "    "))
            if indent < 4:
                line = " " * 4 + line[indent:]
        out.append(line)
    return "\n".join(out)

BQ_ITEM_RE = re.compile(r"^([ \t]*(?:>[ \t]*)+)([*+-]|\d{1,9}[.)])(?=\S)(.*)$")
BQ_ANY_ITEM_RE = re.compile(r"^[ \t]*(?:>[ \t]*)+([*+-]|\d{1,9}[.)])[ \t]")


def space_blockquote_lists(md: str) -> str:
    lines = str(md or "").split("\n")
    out = []
    plain_item_re = re.compile(r"^[ \t]{0,3}([*+-]|\d{1,9}[.)])[ \t]+\S")
    unescape_re = re.compile(r"^([ \t]*(?:>[ \t]*)*)\\([*+-])")
    for line in lines:
        line = unescape_re.sub(lambda m: m.group(1) + m.group(2), line)
        hit = BQ_ITEM_RE.match(line)
        if hit and "*" not in hit.group(3) and "_" not in hit.group(3):
            prefix = hit.group(1)
            prev = out[-1] if out else ""
            if prev.strip().startswith(">") and not BQ_ANY_ITEM_RE.match(prev) and prev.strip() != ">":
                out.append(prefix.rstrip())
            out.append(prefix + hit.group(2) + " " + hit.group(3))
            continue
        if plain_item_re.match(line) and out and out[-1].lstrip().startswith(">"):
            out.append("")
        out.append(line)
    return "\n".join(out)
PRE_BLOCK_RE = re.compile(r"<pre[^>]*>(.*?)</pre>", re.S | re.I)
LANG_RE = re.compile(r"language-([A-Za-z0-9_+#.-]+)")


def sanitize_code_fences(raw_html: str) -> str:
    def repl(match):
        block = match.group(0)
        lang = LANG_RE.search(block)
        body = match.group(1)
        body = re.sub(r"<[^>]+>", "", body)
        body = body.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        body = body.strip("\n")
        code = (
            body.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        cls = ' class="language-%s"' % lang.group(1) if lang else ""
        return "<pre><code%s>%s</code></pre>" % (cls, code)
    return PRE_BLOCK_RE.sub(repl, str(raw_html or ""))


def strip_spans_in_fences(md: str) -> str:
    lines = str(md or "").split("\n")
    out = []
    fence = None
    for line in lines:
        fence, is_fence = _track_fence(line, fence)
        if is_fence or fence:
            out.append(line)
            continue
        if "<span" in line:
            line = re.sub(r"<[^>]+>", "", line)
            line = line.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        out.append(line)
    return "\n".join(out)

PARA_RE = re.compile(r"<p>((?:(?!</p>).)*?)</p>", re.S)
SINGLE_CODE_RE = re.compile(r"^\s*<code[^>]*>(.*?)</code>\s*$", re.S)


def promote_inline_code_blocks(html: str) -> str:
    def repl(match):
        inner = match.group(1)
        single = SINGLE_CODE_RE.match(inner)
        if not single:
            return match.group(0)
        raw = single.group(1)
        text = re.sub(r"<br\s*/?>", "\n", raw)
        text = re.sub(r"<[^>]+>", "", text)
        text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        if len(lines) < 2:
            return match.group(0)
        lang = ""
        head = re.match(r"^([A-Za-z0-9_+#.-]{1,20})[ \t]+(.*)$", lines[0])
        if head and not re.search(r"[(){}\[\];,]", head.group(1)):
            lang = head.group(1)
            lines[0] = head.group(2)
        elif len(lines) >= 2 and re.fullmatch(r"[A-Za-z][A-Za-z0-9_+#.-]{0,19}", lines[0]):
            lang = lines[0]
            lines = lines[1:]
        code = "\n".join(lines)
        code = code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        cls = ' class="language-%s"' % lang if lang else ""
        return '<div class="codehilite"><pre><code%s>%s</code></pre></div>' % (cls, code)
    return PARA_RE.sub(repl, str(html or ""))


def _task_lines(ul, to_md, depth: int = 0):
    lines = []
    pad = "    " * depth
    for li in ul.find_all("li", recursive=False):
        checked = str(li.get("data-checked", "")).lower() == "true"
        content = li.find("div", recursive=False) or li
        nested = []
        for sub in content.find_all("ul", recursive=False):
            nested.append(sub.extract())
        inner_html = "".join(str(child) for child in content.contents)
        try:
            inner = to_md(inner_html)
        except Exception:
            inner = content.get_text(" ", strip=True)
        inner = re.sub(r"\s+", " ", str(inner)).strip()
        lines.append("%s- [%s] %s" % (pad, "x" if checked else " ", inner))
        for sub in nested:
            lines.extend(_task_lines(sub, to_md, depth + 1))
    return lines


def stash_task_lists(html: str, to_md):
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return html, []
    soup = BeautifulSoup(str(html or ""), "html.parser")
    stash = []
    for ul in soup.find_all("ul"):
        if ul.parent is None:
            continue
        lis = [li for li in ul.find_all("li", recursive=False) if li.get("data-type") == "taskItem" or li.get("data-checked") is not None]
        if not lis:
            continue
        block = "\n".join(_task_lines(ul, to_md))
        token = "@@TASKLIST%d@@" % len(stash)
        stash.append((token, block))
        placeholder = soup.new_tag("p")
        placeholder.string = token
        ul.replace_with(placeholder)
    return str(soup), stash


def restore_task_lists(md_text: str, stash) -> str:
    for token, block in stash or []:
        md_text = expand_restore(md_text, token, block)
    return md_text


def render_task_lists(html: str) -> str:
    try:
        from bs4 import BeautifulSoup
        from bs4.element import NavigableString
    except ImportError:
        return html
    soup = BeautifulSoup(str(html or ""), "html.parser")
    for ul in soup.find_all("ul"):
        lis = ul.find_all("li", recursive=False)
        if not lis:
            continue
        marks = []
        ok = True
        for li in lis:
            first = li.contents[0] if li.contents else None
            text = str(first) if isinstance(first, NavigableString) else ""
            hit = re.match(r"^\s*\[([ xX])\]\s+", text)
            if not hit:
                ok = False
                break
            marks.append((li, hit.group(1).lower() == "x", hit.end()))
        if not ok:
            continue
        ul["data-type"] = "taskList"
        for li, checked, cut in marks:
            inline = []
            blocks = []
            for child in list(li.contents):
                if getattr(child, "name", None) in ("ul", "ol", "div", "p"):
                    blocks.append(child.extract())
                else:
                    inline.append(child.extract())
            if inline and isinstance(inline[0], NavigableString):
                first_text = str(inline[0])
                inline[0] = NavigableString(first_text[cut:])
            label = soup.new_tag("label")
            box = soup.new_tag("input", attrs={"type": "checkbox"})
            if checked:
                box["checked"] = "checked"
            label.append(box)
            label.append(soup.new_tag("span"))
            holder = soup.new_tag("div")
            para = soup.new_tag("p")
            for node in inline:
                para.append(node)
            holder.append(para)
            for node in blocks:
                holder.append(node)
            li.clear()
            li["data-type"] = "taskItem"
            li["data-checked"] = "true" if checked else "false"
            li.append(label)
            li.append(holder)
    return str(soup)


def tidy_quote_blanks(md_text: str) -> str:
    """引用块里连续多行空 `>` 压成两行（回填后会出现一长串空引用行）"""
    return re.sub(r"(?:^>[ \t]*\n){3,}", ">\n>\n", str(md_text or ""), flags=re.M)


def harden_fences(md_text: str) -> str:
    lines = str(md_text or "").split("\n")
    out = []
    i = 0
    total = len(lines)
    while i < total:
        line = lines[i]
        hit = re.match(r"^([ \t]{0,3})(`{3,}|~{3,})(.*)$", line)
        if not hit:
            out.append(line)
            i += 1
            continue
        indent, marker, info = hit.group(1), hit.group(2), hit.group(3)
        ch = marker[0]
        size = len(marker)
        body = []
        i += 1
        while i < total:
            close = re.match(r"^[ \t]{0,3}(%s{3,})[ \t]*$" % re.escape(ch), lines[i])
            if close and len(close.group(1)) >= size:
                break
            body.append(lines[i])
            i += 1
        body_text = "\n".join(body)
        runs = re.findall(re.escape(ch) + "{3,}", body_text)
        need = max([size] + [len(run) + 1 for run in runs]) if runs else size
        fence = ch * need
        out.append(indent + fence + info)
        out.extend(body)
        out.append(indent + fence)
        i += 1
    return "\n".join(out)


CODE_TOKEN = "@@CODEBLOCK%d@@"


def stash_code_blocks(raw_html: str):
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return raw_html, []
    soup = BeautifulSoup(str(raw_html or ""), "html.parser")
    stash = []
    for pre in soup.find_all("pre"):
        code = pre.find("code")
        language = ""
        for node in (code, pre):
            if node is None:
                continue
            cls = node.get("class") or []
            if isinstance(cls, str):
                cls = cls.split()
            for item in cls:
                if str(item).startswith("language-"):
                    language = str(item)[9:]
                    break
            if language:
                break
            data_lang = node.get("data-language")
            if data_lang:
                language = str(data_lang)
                break
        text = code.get_text() if code is not None else pre.get_text()
        text = str(text or "").strip("\n")
        token = CODE_TOKEN % len(stash)
        stash.append((token, language, text))
        placeholder = soup.new_tag("p")
        placeholder.string = token
        pre.replace_with(placeholder)
    return str(soup), stash


def restore_code_blocks(md_text: str, stash) -> str:
    for token, language, text in stash or []:
        runs = re.findall(r"`{3,}", text or "")
        size = max([3] + [len(run) + 1 for run in runs]) if runs else 3
        fence = "`" * size
        block = fence + (language or "") + "\n" + (text or "") + "\n" + fence
        md_text = expand_restore(md_text, token, block)
    return md_text


HEADING_STRIKE_RE = re.compile(r"^(#{1,6}[ \t]+)~~(.+?)~~[ \t]*$", re.M)


def strip_heading_strike(md: str) -> str:
    return HEADING_STRIKE_RE.sub(lambda m: m.group(1) + m.group(2), str(md or ""))


def tighten_math_blocks(md_text: str) -> str:
    lines = str(md_text or "").split("\n")
    out = []
    i = 0
    total = len(lines)
    while i < total:
        line = lines[i]
        if line.strip() == "$$":
            block = [line]
            i += 1
            while i < total:
                cur = lines[i]
                if cur.strip() == "$$":
                    block.append(cur)
                    i += 1
                    break
                if cur.strip():
                    block.append(cur)
                i += 1
            out.extend(block)
            continue
        out.append(line)
        i += 1
    return "\n".join(out)
