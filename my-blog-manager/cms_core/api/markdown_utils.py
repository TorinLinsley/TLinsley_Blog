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

# 这些类名等于「没指定语言」，不该写进围栏
_IGNORED = {"none", "nohighlight", "plain", "plaintext", "text", "txt", "hljs", "null"}

# 占位符用私用区字符：正文里不会出现，也不会被 Markdown 转义（和 resources.py 的内联标签占位符一个思路）
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


def _cell_to_md(cell) -> str:
    """单元格内容 → 一行 Markdown 文本（单元格里不能出现换行和裸竖线，否则表格会散架）"""
    from markdownify import markdownify as md

    inner = "".join(str(child) for child in cell.children)
    text = md(inner, heading_style="ATX", keep=["img", "br"])
    # 编辑器用 <br>&zwj; 表示空行，markdownify 会把那个零宽连接符留下来 —— 清掉
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


def restore_tables(text: str, tables: List[str]) -> str:
    """把占位符换回转换好的 Markdown 表格"""
    for i, table in enumerate(tables):
        text = text.replace(_TABLE_SLOT.format(i), table)
    return text


# ═════════════════════════════════════════════════════════════
# 🧩 相邻的引用块被 python-markdown 并成一个 ✗
#
# CommonMark / Obsidian / 前端的 remark 里：
#     > 第一块
#     （空行）
#     > 第二块            → 这是**两个**引用块 ✓
# python-markdown 却会把它并成**一个** blockquote（两个 <p>）✗，于是：
#   · 你分开写的引用块，在控制台里糊成一大坨 ✗
#   · 紧跟着的 `> [!info]` 不再是"引用块的第一段" → callout 直接失效、
#     退化成一行 `[!info]` 原文 ✗（用户遇到的就是这个）
#
# 办法：这种"空行分隔的两个引用块"之间插一行 HTML 注释挡住合并
#      （和下面拆 callout 用的是同一招，已验证有效 ✓）。
# ⚠️ 引用块**内部**的空行写成 `>`（空引用行）—— 那不是分隔，不动 ✓
# ═════════════════════════════════════════════════════════════

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

        # 空行 且 前一行是引用、下一个非空行也是引用 → 两个引用块的分界，插注释 ✓
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


# ═════════════════════════════════════════════════════════════
# 🧩 保存时：把 callout 外壳变回 `> [!type] 标题` 的 Markdown
#
# 不这么干的话，markdownify 会把 callout 里的 <span>/<svg> 当**裸 HTML** 吐进 .md ✗
# —— 表现就是「保存一次，callout 样式全没了，满屏 span 标签」，
#    而且前端再读也认不出它是 callout（用户："连显示效果都没了"）。
# 思路和表格一样：先把外壳抠成占位符，markdownify 之后再放回 Markdown 文本 ✓
# ═════════════════════════════════════════════════════════════

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
    # 标题也走 markdownify：这样标题里的加粗/斜体（> [!info] **标题**）不会丢 ✓
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

    lines = [f"> [!{kind}] {title}".rstrip()]
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
        text = text.replace(_CALLOUT_SLOT.format(i), md_text)
    return text



# ─────────────────────────────────────────────────────────────
# Obsidian 风格的 Callout（标注块）：> [!note] 标题
# 和博客前台（lib/rehypeCallout.ts）那套保持一致 —— 只认首段以 [!类型] 开头的引用块，
# 普通引用一个字都不动。
# ─────────────────────────────────────────────────────────────
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
    "danger": _icon('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
    "error": _icon('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
    "failure": _icon('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
    "bug": _icon('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
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

# 只匹配"首段以 [!类型] 开头"的引用块；普通引用不匹配，保持原样
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


# ─────────────────────────────────────────────────────────────
# 🧩 拆开「挤在同一个引用块里的多个 callout」
#
# 编辑器导出 Markdown 时，相邻的 callout 会连成一片：
#     > [!note] 标题一
#     > 正文一
#     > [!abstract] 标题二
#     > 正文二
# ⚠️ 在 Markdown 里这**是同一个 blockquote**（中间没有空行），所以渲染时
#    只有第一个能变成 callout，后面全部退化成普通引用里的一行字 ——
#    表现就是「控制台编辑器里明明好好的，一保存 / 到前台就全是 [!xxx] 原文」。
#
# 这里给每个新 callout 前面补一个空行，把它们拆成各自独立的引用块。
# ⚠️ 围栏代码块里的内容一个字都不动。
# ─────────────────────────────────────────────────────────────

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
            # ⚠️ 只插一个空行**不管用**：Python-Markdown 比 CommonMark 宽容，
            #    空行 + 后面还是 `>` 开头的行，它仍然算同一个 blockquote ✗
            #    所以插一行**不带 `>` 的 HTML 注释**把它切断（注释在页面上不可见 ✓）
            out.append("")
            out.append("<!-- -->")
            out.append("")

        out.append(line)

    return "\n".join(out)


# ─────────────────────────────────────────────────────────────
# 🧮 数学公式（$…$ / $$…$$）
#
# 背景：资源分享和草稿箱的正文是 python-markdown 渲染的，它**默认不认识数学公式**，
# 而且它那套转义规则会**当场改坏公式**。实测（Markdown==3.10.3 + fenced_code/tables/nl2br）：
#
#   $\{a\}$                              →  ${a}$        ← 反斜杠被吃掉
#   \begin{pmatrix} a & b \\ c & d …     →  … b \ c …    ← TeX 换行符 \\ 被吃成一个 \
#   $$ ⏎ \int … ⏎ $$                      →  $$<br>…<br>$$ ← nl2br 往公式中间插 <br>
#
# 第三条尤其致命：公式被 <br> 切开后，前端 KaTeX 连"一对 $$"都找不齐，怎么渲染都渲染不出来。
#
# 所以这里不引新依赖（pymdownx 得额外 pip 一遍，服务器上还得再装），自己写三十行：
#   ① 预处理：把公式抠成私用区占位符（和本文件表格那个 _TABLE_SLOT 一个思路），
#      顺带跳过 ``` 围栏和 `行内代码` 里的内容；
#   ② 后处理：把占位符换回**原样的公式文本**（HTML 转义一下，`&lt;` 进 DOM 还会变回 `<`）。
#
# 这里只管「别把公式改坏」，不负责渲染 —— 渲染在前端做（控制台资源预览页，
# 见 my-blog-manager/lib/renderMath.ts）。为什么不在这儿包一层 span 给前端当标记：
# 资源页点「编辑」再点「预览」时，预览用的是**编辑器吐出来的 HTML**，而 tiptap 会把
# 它不认识的 span 拆掉，标记当场就没了。所以前端按同一套规则扫文本节点，两条路走同一段代码。
# ─────────────────────────────────────────────────────────────

_MATH_SLOT = "\ue100{}\ue101"

# 行内代码 | 块级公式 | 行内公式（按顺序，代码优先；公式里允许 \$ \\ 这类转义）
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
