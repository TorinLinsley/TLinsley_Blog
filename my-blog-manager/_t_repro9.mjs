import fs from "fs";
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
const raw = fs.readFileSync(process.argv[2], "utf8");
const body = new dom.window.DOMParser().parseFromString(PASTE_MD.render(raw), "text/html").body;
tidy(body);
body.querySelectorAll("img").forEach((img) => { if (!(img.getAttribute("src") || "").trim()) img.remove(); });
body.querySelectorAll("p").forEach((p) => {
  const kids = Array.from(p.childNodes).filter((n) => !(n.nodeType === 3 && !(n.nodeValue || "").trim()));
  if (kids.length >= 1 && kids.every((k) => k.nodeType === 1 && k.tagName === "IMG")) { const par = p.parentNode; kids.forEach((k) => par.insertBefore(k, p)); p.remove(); }
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
const slice = PMDOMParser.fromSchema(schema).parseSlice(body, { preserveWhitespace: true });
const nodes = []; slice.content.forEach((n) => nodes.push(n));
console.log("slice nodes", nodes.length, "open", slice.openStart, slice.openEnd);
const tdoc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("光标处")])]);
const st = EditorState.create({ doc: tdoc, selection: TextSelection.create(tdoc, 4) });
const fin = []; st.tr.replaceSelection(slice).doc.forEach((n) => fin.push(n));
console.log("doc nodes", fin.length);
for (let i = 0; i < fin.length; i++) {
  const n = fin[i];
  if (n.type.name !== "paragraph") continue;
  if ((n.textContent || "").replace(/[\s\u00a0\u200b\u200d\ufeff]/g, "")) continue;
  console.log("=== empty at", i, "| prev:", fin[i-1]?.type.name, "next:", fin[i+1]?.type.name);
  for (let k = i - 2; k <= i + 2; k++) {
    const m = fin[k]; if (!m) continue;
    console.log("   ", String(k).padStart(4), m.type.name.padEnd(12), "size", String(m.content.size).padStart(4), JSON.stringify((m.textContent || "").slice(0, 60)));
  }
}

