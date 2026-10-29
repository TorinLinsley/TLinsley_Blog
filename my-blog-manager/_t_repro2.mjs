import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const MarkdownIt = require("markdown-it");
const { getSchema } = await import("@tiptap/core");
const StarterKit = (await import("@tiptap/starter-kit")).default;
const ImageExt = (await import("@tiptap/extension-image")).default;
const Underline = (await import("@tiptap/extension-underline")).default;
const Link = (await import("@tiptap/extension-link")).default;
const TaskList = (await import("@tiptap/extension-task-list")).default;
const TaskItem = (await import("@tiptap/extension-task-item")).default;
const { Table, TableCell, TableHeader, TableRow } = await import("@tiptap/extension-table");
const { DOMParser: PMDOMParser } = await import("@tiptap/pm/model");
const { Fragment, Slice } = await import("@tiptap/pm/model");

const dom = new JSDOM("<body></body>");
global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;

const PASTE_MD = new MarkdownIt({ html: true, linkify: true, breaks: false });

const CustomImage = ImageExt.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: "100%", renderHTML: (a) => ({ style: `width:${a.width};display:block;margin:0 0 2rem 0` }) },
    };
  },
});

function tidyPasteWhitespace(body) {
  const BLOCK_TAGS = new Set(["P","UL","OL","LI","BLOCKQUOTE","PRE","TABLE","DIV","HR","H1","H2","H3","H4","H5","H6","THEAD","TBODY","TR","TD","TH"]);
  const isBlock = (n) => !!n && n.nodeType === 1 && BLOCK_TAGS.has(n.tagName);
  const w = body.ownerDocument.createTreeWalker(body, 4);
  const texts = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) texts.push(n);
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

const src = [
  "#### 方式三：浏览器访问验证",
  "",
  "地址栏输入 `http://202.114.114.200`，能看见「Client 1 | IP: 202.114.114.200」即为成功。",
  "![](https://pub-10366cd6dd8a4aae87ff5c7565402826.r2.dev/x.png)",
  "",
  "### 3.5 再看 Server02 的日志验证是否真的有效",
].join("\n");

const html0 = PASTE_MD.render(src);
console.log("HTML0:", JSON.stringify(html0));

const body = new dom.window.DOMParser().parseFromString(html0, "text/html").body;
tidyPasteWhitespace(body);
console.log("HTML1:", JSON.stringify(body.innerHTML));

const schema = getSchema([StarterKit, CustomImage, Underline, Link, TaskList, TaskItem, Table, TableRow, TableCell, TableHeader]);
const slice = PMDOMParser.fromSchema(schema).parseSlice(body, { preserveWhitespace: true });
console.log("openStart", slice.openStart, "openEnd", slice.openEnd);
const nodes = [];
slice.content.forEach((n) => nodes.push(n));
console.log("NODES:", nodes.map((n) => n.type.name + "(" + n.content.size + ")" + (n.textContent ? ":" + n.textContent.slice(0, 10) : "")).join(" || "));
