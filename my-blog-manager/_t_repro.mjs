import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const MarkdownIt = require("markdown-it");
const { getSchema } = await import("@tiptap/core");
const StarterKit = (await import("@tiptap/starter-kit")).default;
const ImageExt = (await import("@tiptap/extension-image")).default;
const { DOMParser: PMDOMParser } = await import("@tiptap/pm/model");

const md = new MarkdownIt({ html: true, linkify: true, breaks: false });
const src = fs.readFileSync(process.argv[2], "utf8");
const idx = src.indexOf("地址栏输入");
const snippet = src.slice(idx - 40, idx + 200).split("\n").slice(0, 4).join("\n");
console.log("SRC SEG:", JSON.stringify(snippet));

const html = md.render(snippet);
console.log("HTML:", html);

const dom = new JSDOM(`<body>${html}</body>`);
const body = dom.window.document.body;

const schema = getSchema([StarterKit, ImageExt]);
const slice = PMDOMParser.fromSchema(schema).parseSlice(body, { preserveWhitespace: true });
const out = [];
slice.content.forEach((n) => out.push(n.type.name + (n.textContent ? ":" + n.textContent.slice(0, 12) : "")));
console.log("NODES:", out.join(" || "));
