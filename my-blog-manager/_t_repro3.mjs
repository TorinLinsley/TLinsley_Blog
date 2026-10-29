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
const CustomImage = ImageExt.extend({
  addAttributes() { return { ...this.parent?.(), width: { default: "100%" } }; },
});
const schema = getSchema([StarterKit, CustomImage]);

const cases = {
  "no-blank-before-image": "前一段文字。\n![](https://x/y.png)\n\n### 后面的标题",
  "blank-before-image": "前一段文字。\n\n![](https://x/y.png)\n\n### 后面的标题",
  "image-only-between": "前一段文字。\n\n![](https://x/y.png)\n\n后一段文字。",
};

for (const [name, src] of Object.entries(cases)) {
  const html = PASTE_MD.render(src);
  const body = new dom.window.DOMParser().parseFromString(html, "text/html").body;
  const slice = PMDOMParser.fromSchema(schema).parseSlice(body, { preserveWhitespace: true });
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("光标处")])]);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) });
  const tr = state.tr.replaceSelection(slice);
  const out = [];
  tr.doc.forEach((n) => out.push(n.type.name + "(" + n.content.size + ")" + (n.textContent ? ":" + n.textContent.slice(0, 8) : "")));
  console.log(name, "| slice open", slice.openStart, slice.openEnd, "=>", out.join(" || "));
}
