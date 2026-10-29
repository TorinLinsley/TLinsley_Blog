import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const MarkdownIt = require("markdown-it");
const { getSchema } = await import("@tiptap/core");
const StarterKit = (await import("@tiptap/starter-kit")).default;
const ImageExt = (await import("@tiptap/extension-image")).default;
const { DOMParser: PMDOMParser } = await import("@tiptap/pm/model");
const { EditorState, TextSelection } = await import("@tiptap/pm/state");

const dom = new JSDOM("<body></body>");
global.window = dom.window; global.document = dom.window.document;
global.Node = dom.window.Node; global.NodeFilter = dom.window.NodeFilter;
const PASTE_MD = new MarkdownIt({ html: true, linkify: true, breaks: false });
const CustomImage = ImageExt.extend({ addAttributes() { return { ...this.parent?.(), width: { default: "100%" } }; } });
const schema = getSchema([StarterKit, CustomImage]);

const raw = fs.readFileSync(process.argv[2], "utf8");
const body = new dom.window.DOMParser().parseFromString(PASTE_MD.render(raw), "text/html").body;
const slice = PMDOMParser.fromSchema(schema).parseSlice(body, { preserveWhitespace: true });
const nodes = [], doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("光标处")])]);
slice.content.forEach((n) => nodes.push(n));
const st = EditorState.create({ doc, selection: TextSelection.create(doc, 4) });
const tr = st.tr.replaceSelection(slice);
const fin = []; tr.doc.forEach((n) => fin.push(n));
for (const center of [88, 129]) {
  console.log("=== around", center);
  for (let i = center - 3; i <= center + 2; i++) {
    const n = fin[i];
    if (!n) continue;
    console.log(String(i).padStart(4), n.type.name.padEnd(12), "size", String(n.content.size).padStart(4), JSON.stringify((n.textContent || "").slice(0, 50)));
  }
}
