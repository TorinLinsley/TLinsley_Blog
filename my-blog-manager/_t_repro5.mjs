import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const MarkdownIt = require("markdown-it");
const { getSchema } = await import("@tiptap/core");
const StarterKit = (await import("@tiptap/starter-kit")).default;
const ImageExt = (await import("@tiptap/extension-image")).default;
const { DOMParser: PMDOMParser, Fragment, Slice } = await import("@tiptap/pm/model");
const { EditorState, TextSelection } = await import("@tiptap/pm/state");

const dom = new JSDOM("<body></body>");
global.window = dom.window; global.document = dom.window.document;
global.Node = dom.window.Node; global.NodeFilter = dom.window.NodeFilter;

const PASTE_MD = new MarkdownIt({ html: true, linkify: true, breaks: false });
const CustomImage = ImageExt.extend({ addAttributes() { return { ...this.parent?.(), width: { default: "100%" } }; } });
const schema = getSchema([StarterKit, CustomImage]);

const BLOCK_TAGS = new Set(["P","UL","OL","LI","BLOCKQUOTE","PRE","TABLE","DIV","HR","H1","H2","H3","H4","H5","H6","THEAD","TBODY","TR","TD","TH"]);
function tidy(body) {
  const isBlock = (n) => !!n && n.nodeType === 1 && BLOCK_TAGS.has(n.tagName);
  const w = body.ownerDocument.createTreeWalker(body, 4);
  const texts = []; for (let n = w.nextNode(); n; n = w.nextNode()) texts.push(n);
  texts.forEach((t) => {
    if (t.parentElement?.closest("pre")) return;
    const v = t.nodeValue || "";
    if (!/^[ \t\r\n]*$/.test(v)) {
      let next = v;
      if (/^[\r\n]/.test(next) && isBlock(t.previousSibling)) next = next.replace(/^[\r\n]+/, "");
      const atEnd = isBlock(t.nextSibling) || (!t.nextSibling && t.parentElement && ["LI","TD","TH"].includes(t.parentElement.tagName));
      if (/[\r\n]$/.test(next) && atEnd) next = next.replace(/[\r\n]+$/, "");
      if (next !== v) t.nodeValue = next;
      return;
    }
    t.remove();
  });
}
function pipeline(body) {
  tidy(body);
  body.querySelectorAll("img").forEach((img) => { if (!(img.getAttribute("src") || "").trim()) img.remove(); });
  body.querySelectorAll("p").forEach((p) => {
    const kids = Array.from(p.childNodes).filter((n) => !(n.nodeType === 3 && !(n.nodeValue || "").trim()));
    const onlyImg = kids.length === 1 && kids[0].nodeType === 1 && kids[0].tagName === "IMG";
    if (onlyImg) p.replaceWith(kids[0]);
  });
  for (let pass = 0; pass < 4; pass++) {
    let removed = 0;
    body.querySelectorAll("p").forEach((p) => {
      const empty = !(p.textContent || "").replace(/[\s\u00a0\u3000\u200b\u200d\ufeff]/g, "") && Array.from(p.children).every((c) => c.tagName === "BR");
      if (!empty) return;
      const prev = p.previousElementSibling, next = p.nextElementSibling;
      if ((prev && prev.tagName === "IMG") || (next && next.tagName === "IMG")) { p.remove(); removed += 1; }
    });
    if (!removed) break;
  }
}
function run(name, src) {
  const html = PASTE_MD.render(src);
  const body = new dom.window.DOMParser().parseFromString(html, "text/html").body;
  pipeline(body);
  const slice = PMDOMParser.fromSchema(schema).parseSlice(body, { preserveWhitespace: true });
  const nodes = []; slice.content.forEach((n) => nodes.push(n));
  const kept = nodes.filter((node, i) => {
    if (node.type.name !== "paragraph") return true;
    if ((node.textContent || "").replace(/[\s\u00a0\u3000\u200b\u200d\ufeff]/g, "")) return true;
    if (node.content.size > 1) return true;
    return !(nodes[i - 1]?.type.name === "image" || nodes[i + 1]?.type.name === "image");
  });
  const fixed = kept.length === nodes.length ? slice : new Slice(Fragment.fromArray(kept), slice.openStart, slice.openEnd);
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("光标处")])]);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) });
  const tr = state.tr.replaceSelection(fixed);
  const out = []; tr.doc.forEach((n) => out.push(n.type.name + "(" + n.content.size + ")" + (n.textContent ? ":" + n.textContent.slice(0, 8) : "")));
  console.log(name.padEnd(22), "slice:", nodes.map((n) => n.type.name).join(","), "| open", slice.openStart, slice.openEnd, "=> doc:", out.join(" || "));
}
run("glued", "前一段。\n![](https://x/a.png)\n\n### 标题");
run("blank-before", "前一段。\n\n![](https://x/a.png)\n\n### 标题");
run("two-images", "![](https://x/1.png)\n\n![](https://x/2.png)");
run("text-img-text", "甲\n\n![](https://x/a.png)\n\n乙");
