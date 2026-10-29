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
  if (kids.length === 1 && kids[0].nodeType === 1 && kids[0].tagName === "IMG") p.replaceWith(kids[0]);
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
const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("光标处")])]);
const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) });
const tr = state.tr.replaceSelection(slice);
const nodes = []; tr.doc.forEach((n) => nodes.push(n));
console.log("total top-level nodes:", nodes.length, "open", slice.openStart, slice.openEnd);
let bad = 0;
nodes.forEach((n, i) => {
  if (n.type.name !== "paragraph") return;
  const empty = !(n.textContent || "").replace(/[\s\u00a0\u200b\u200d\ufeff]/g, "");
  if (!empty) return;
  const prev = nodes[i - 1]?.type.name, next = nodes[i + 1]?.type.name;
  if (prev === "image" || next === "image" || prev === "horizontalRule" || next === "horizontalRule") {
    bad += 1;
    console.log("EMPTY@", i, "prev:", prev, "next:", next, "| prevText:", JSON.stringify((nodes[i - 2]?.textContent || "").slice(-30)), "| nextText:", JSON.stringify((nodes[i + 2]?.textContent || "").slice(0, 30)));
  }
});
console.log("empty paragraphs adjacent to image/hr:", bad);
