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
const BLOCK_NON_PARA = new Set(["image","heading","bulletList","orderedList","codeBlock","blockquote","horizontalRule","table","taskList"]);

const cases = {
  "blank-before-image": "前一段文字。\n\n![](https://x/y.png)\n\n### 标题",
  "image-only-between": "前一段文字。\n\n![](https://x/y.png)\n\n后一段文字。",
  "inline-bold": "这是 **粗体** 词",
  "list": "1. 甲\n2. 乙",
  "two-images": "![](https://x/1.png)\n\n![](https://x/2.png)",
};

for (const [name, src] of Object.entries(cases)) {
  const html = PASTE_MD.render(src);
  const body = new dom.window.DOMParser().parseFromString(html, "text/html").body;
  let slice = PMDOMParser.fromSchema(schema).parseSlice(body, { preserveWhitespace: true });
  const nodes = []; slice.content.forEach((n) => nodes.push(n));
  const hasBlock = nodes.some((n) => BLOCK_NON_PARA.has(n.type.name));
  const closed = hasBlock ? new Slice(Fragment.fromArray(nodes), 0, 0) : slice;
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("光标处")])]);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) });
  const tr = state.tr.replaceSelection(closed);
  const out = []; tr.doc.forEach((n) => out.push(n.type.name + "(" + n.content.size + ")" + (n.textContent ? ":" + n.textContent.slice(0, 8) : "")));
  console.log(name.padEnd(20), hasBlock ? "CLOSED" : "open  ", "=>", out.join(" || "));
}
