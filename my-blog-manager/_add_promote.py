p = r"cms_core\api\markdown_utils.py"
t = open(p, encoding="utf-8").read()
helper = '''

INLINE_CODE_P_RE = re.compile(r"<p>\\s*<code[^>]*>(.*?)</code>\\s*</p>", re.S)


def promote_inline_code_blocks(html: str) -> str:
    def repl(match):
        inner = match.group(1)
        text = re.sub(r"<br\\s*/?>", "\\n", inner)
        text = re.sub(r"<[^>]+>", "", text)
        text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        lines = [line.strip() for line in text.split("\\n") if line.strip()]
        if len(lines) < 2:
            return match.group(0)
        lang = ""
        head = re.match(r"^([A-Za-z0-9_+#.\\-]{1,20})[ \\t]+(.*)$", lines[0])
        if head and not re.search(r"[(){}\\[\\];,]", head.group(1)):
            lang = head.group(1)
            lines[0] = head.group(2)
        code = "\\n".join(lines)
        code = code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        cls = ' class="language-%s"' % lang if lang else ""
        return '<div class="codehilite"><pre><code%s>%s</code></pre></div>' % (cls, code)
    return INLINE_CODE_P_RE.sub(repl, str(html or ""))
'''
if "def promote_inline_code_blocks" not in t:
    t = t + helper
open(p, "w", encoding="utf-8", newline="").write(t)
print("helper added")

for f in (r"cms_core\api\resources.py", r"cms_core\api\drafts.py"):
    s = open(f, encoding="utf-8").read()
    if "promote_inline_code_blocks" not in s:
        s = s.replace("    sanitize_code_fences,\n", "    sanitize_code_fences,\n    promote_inline_code_blocks,\n")
    s = s.replace("""    html = unbreak_image_lines(html)""", """    html = promote_inline_code_blocks(html)
    html = unbreak_image_lines(html)""", 1)
    open(f, "w", encoding="utf-8", newline="").write(s)
    print("wired", f, "promote_inline_code_blocks" in s)
