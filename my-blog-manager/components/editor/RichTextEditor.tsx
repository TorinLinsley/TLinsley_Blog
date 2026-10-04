"use client";

import React, { useState, useImperativeHandle, forwardRef, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useEditor, EditorContent, Extension, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
// 📊 表格（Markdown 表格粘贴 / 编辑 / 存回都要它）
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

// 🌟 引入 Markdown 插件
import { Markdown } from 'tiptap-markdown';
// 📋 粘贴 Markdown 源码时**自己接管解析**：markdown-it 出 HTML，再交给 ProseMirror 自己的解析器建 slice。
//    不这么做的话，tiptap-markdown 内部的 clipboardTextParser 会把引用块/列表拆平
//    （表现：剪贴板里明明有 `>`，粘进来 `>` 没了、引用块和列表退化成普通段落）。
import MarkdownIt from 'markdown-it';

/** 只用于「粘贴 Markdown 源码」这一条路；表格/删除线等 GFM 语法默认就支持 */
const PASTE_MD = new MarkdownIt({ html: false, linkify: true, breaks: false });

/* ═══════════ 📋 Markdown 源码 → ProseMirror Slice（粘贴用的那条路） ═══════════ */

/** 文件头的 YAML：`---` 开头、`---` 结尾，且里面至少有一行 `key:` */
const YAML_FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function stripFrontmatter(raw: string): string {
  const text = raw.replace(/^\uFEFF/, '');
  const match = YAML_FRONTMATTER.exec(text);
  // ⚠️ 必须确认里面是 YAML（有 key: 行）才丢。
  //    否则一篇「正文第一行是 ---（分隔线）、后面又有一条 ---」的文章会被整段吃掉。
  return match && /^[A-Za-z_][\w-]*[ \t]*:/m.test(match[1]) ? text.slice(match[0].length) : text;
}

/**
 * 🚿 洗 markdown-it 输出里的排版空白（`<pre>` 里一个字都不动）。
 *
 * ① 纯空白文本节点 → 全删。这是「粘一整篇满屏空行」的**根因**：
 *    markdown-it 输出的 HTML 里每个 `</li>` 和 `<li>` 之间都有一个换行符，
 *    而 `preserveWhitespace: 'full'` 会把它当成**真正的文字**交给 ProseMirror；
 *    `<ul>`/`<ol>`/`<blockquote>` 这些容器的 content 是"只能装块"，装不下文字，
 *    PM 就地现造一个空段落 / 空列表项来安放它 —— 表现就是整篇都是多余空行。
 *    （实测 555 行的测试文件：旧管线 1432 个块里 794 个是这么来的空块，修完只剩 8 个
 *      —— 那 8 个是「不规则表格」里 markdown-it 补出来的空格子，本来就该是空的。）
 *
 * ② 块级元素**前后**的换行也要剪掉。markdown-it 是这么排嵌套列表的：
 *        <li>[x] 已完成\n<ul>…</ul></li>
 *    这个 \n 只是 JS 里的排版换行，但它在"文字后面"，会被当成软换行 →
 *    tiptap 的 schema 带 linebreakReplacement，于是变成真正的 <br>，
 *    表现就是"列表项和它的子列表之间凭空多一个空行"。
 *    所以：紧跟着块级元素的换行剪掉，段落**内部**的换行（软换行）留着。
 */
function tidyPasteWhitespace(body: HTMLElement) {
  const BLOCK_TAGS = new Set(['P', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'DIV', 'HR',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
  const isBlock = (node: Node | null) =>
    !!node && node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName);

  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);

  texts.forEach(text => {
    if (text.parentElement?.closest('pre')) return;             // 代码块里的空行/缩进要留着
    const value = text.nodeValue || '';
    if (!/^[ \t\r\n]*$/.test(value)) {
      let next = value;
      if (/^[\r\n]/.test(next) && isBlock(text.previousSibling)) next = next.replace(/^[\r\n]+/, '');
      // 父容器是列表项/单元格时，末尾的换行也不是软换行（后面没有块了）
      const atBlockEnd = isBlock(text.nextSibling) ||
        (!text.nextSibling && !!text.parentElement && ['LI', 'TD', 'TH'].includes(text.parentElement.tagName));
      if (/[\r\n]$/.test(next) && atBlockEnd) next = next.replace(/[\r\n]+$/, '');
      if (next !== value) text.nodeValue = next;
      return;
    }
    text.remove();
  });
}

/**
 * ☑️ `- [ ]` / `- [x]` → tiptap 的 taskList + taskItem（markdown-it 默认只当普通文字）。
 *
 * taskItem 的 content 是 `paragraph+`（这里配了 nested，等于 `paragraph block*`），
 * 所以紧凑列表里的裸文字要先包一层 `<p>`；嵌套的子列表留在 `<p>` 外面。
 */
function convertTaskLists(body: HTMLElement) {
  const doc = body.ownerDocument;
  const BLOCK_TAGS = new Set(['P', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'TABLE', 'DIV', 'HR',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

  body.querySelectorAll('li').forEach(li => {
    const holder = (li.querySelector(':scope > p') as HTMLElement | null) ?? li;
    const first = holder.firstChild;
    if (!first || first.nodeType !== Node.TEXT_NODE) return;
    const match = /^\[([ xX])\][ \t]+/.exec(first.nodeValue || '');
    if (!match) return;

    first.nodeValue = (first.nodeValue || '').slice(match[0].length);
    li.setAttribute('data-type', 'taskItem');
    li.setAttribute('data-checked', match[1].toLowerCase() === 'x' ? 'true' : 'false');

    if (holder === li) {
      // 紧凑列表：文字直接挂在 <li> 上 → 把「开头的行内内容」包进一个 <p>
      const paragraph = doc.createElement('p');
      let node: ChildNode | null = li.firstChild;
      while (node) {
        const next: ChildNode | null = node.nextSibling;
        if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName)) break;
        paragraph.appendChild(node);
        node = next;
      }
      if (paragraph.firstChild) li.insertBefore(paragraph, li.firstChild);
    }
  });

  // ⚠️ 同一个列表里「任务项」和「普通项」混着放时，一个容器装不下两种内容，
  //    ProseMirror 会丢东西。所以按类型拆成相邻的多个列表（任务项各自进 data-type="taskList" 的 <ul>）。
  body.querySelectorAll('ul, ol').forEach(list => {
    const items = Array.from(list.children).filter(el => el.tagName === 'LI') as HTMLElement[];
    if (!items.some(li => li.getAttribute('data-type') === 'taskItem')) return;

    const groups: { task: boolean; items: HTMLElement[] }[] = [];
    items.forEach(li => {
      const task = li.getAttribute('data-type') === 'taskItem';
      const last = groups[groups.length - 1];
      if (last && last.task === task) last.items.push(li);
      else groups.push({ task, items: [li] });
    });
    if (groups.length === 1 && groups[0].task) { list.setAttribute('data-type', 'taskList'); return; }

    const frag = doc.createDocumentFragment();
    groups.forEach(group => {
      const nl = doc.createElement(group.task || list.tagName === 'UL' ? 'ul' : 'ol');
      if (group.task) nl.setAttribute('data-type', 'taskList');
      group.items.forEach(li => nl.appendChild(li));
      frag.appendChild(nl);
    });
    list.parentNode?.replaceChild(frag, list);
  });
}

/**
 * Markdown 源码 → 可直接 replaceSelection 的 Slice。
 *
 * 顺序有讲究：先丢 frontmatter（不然会被渲染成「分隔线 + 一堆列表项」）→ 再渲染 →
 * 再洗 DOM（空白节点 / 任务列表）→ 最后交给 ProseMirror。
 * `preserveWhitespace` 只能给 `true`（= 保留空白、换行按空格处理），**绝不能给 `'full'`**：
 * `'full'` 就是上面说的空行灾难。代码块的缩进不受影响，因为 tiptap 自己的代码块
 * 解析规则里写死了 `preserveWhitespace: 'full'`（见 @tiptap/extension-code-block）。
 */
function markdownToSlice(schema: Schema, raw: string): Slice {
  const body = new window.DOMParser()
    .parseFromString(PASTE_MD.render(stripFrontmatter(raw)), 'text/html')
    .body;
  tidyPasteWhitespace(body);
  convertTaskLists(body);
  return PMDOMParser.fromSchema(schema).parseSlice(body, { preserveWhitespace: true });
}

// 🌟 引入满血版 C++ 语法高亮
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';

/**
 * ⚡ 语法高亮**只注册工具栏里列出来的那些语言**（就是下面那份 CODE_LANGUAGES）。
 *
 * 原来这里用的是 lowlight 的 `all` —— 它会把 highlight.js **全部 384 种语言**的语法
 * 一起打进包里（1.5 MB 原始体积，占了整个编辑器 chunk 的绝大部分）。
 * 控制台的代码块语言是固定的那几个，多出来的 350 多种一个都用不到，
 * 但每次打开资源分享页/编辑器都要陪你下完 —— 这就是控制台感觉比前台慢的主因之一。
 *
 * 现在这份名单 25 种语言合计约 184 KB（≈ 原来的 1/8），着色效果**和以前一模一样**：
 * 下拉里能选的语言全都在（jsx/tsx 走 javascript/typescript 的别名，html 走 xml 的别名，
 * cmd/bat 走 dos 的别名），不在名单里的语言本来也只是纯文本显示。
 *
 * ⚠️ 以后往 CODE_LANGUAGES 里加语言，记得在这里也 import 一份，否则那个语言不会着色。
 */
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import dos from 'highlight.js/lib/languages/dos';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import lua from 'highlight.js/lib/languages/lua';
import markdown from 'highlight.js/lib/languages/markdown';
import matlab from 'highlight.js/lib/languages/matlab';
import nginx from 'highlight.js/lib/languages/nginx';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

// 复用手写体里那套复制按钮（pywebview 原生 / Clipboard API / execCommand 三层兜底都在里面）
import { attachCodeFold, createCopyBar, FOLD_AFTER, prettyLang, copyToClipboard } from '../CodeCopy';
import ThemedSelect from '../ThemedSelect';
import LinkCardTool from './LinkCardTool';
import { CalloutDecoration } from './CalloutDecoration';
import { calloutDivsToBlockquotes } from './calloutBridge';

// 📏 行号：代码块内部的行号靠 ProseMirror 的 widget decoration 实现
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import { DOMParser as PMDOMParser, Fragment, Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';

import {
  Undo2, Redo2, Eraser, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered, ListTodo,
  Highlighter, Code2, Heading1, Heading2, Heading3,
  Type, ImageIcon, Quote, RemoveFormatting,
  Pipette, Hash, Check, Link2, Superscript as SupIcon, Subscript as SubIcon, Minus, Palette, Lock,
  Table as TableIcon, Trash2, Info, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Plus, Copy, ArrowUpDown, Rows3, Columns3
} from 'lucide-react';

/* ═══════════════ 📊 表格操作（对标 Obsidian 的 Advanced Tables） ═══════════════ */

/** 光标所在的表格（PM 位置 + 节点）；不在表格里返回 null */
function findTableNode(editor: Editor): { pos: number; node: PMNode } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') return { pos: $from.before(depth), node };
  }
  return null;
}

/** 光标所在单元格的行列号（走 DOM，最直观也最稳） */
function currentCellIndex(editor: Editor): { row: number; col: number } | null {
  try {
    const at = editor.view.domAtPos(editor.state.selection.from).node as Node;
    const element = at.nodeType === Node.TEXT_NODE ? at.parentElement : (at as HTMLElement);
    const cell = element?.closest('td, th') as HTMLTableCellElement | null;
    const row = cell?.parentElement as HTMLTableRowElement | null;
    if (!cell || !row) return null;
    return { row: row.rowIndex, col: cell.cellIndex };
  } catch {
    return null;
  }
}

function tableRows(node: PMNode): PMNode[] {
  const rows: PMNode[] = [];
  node.forEach((row) => rows.push(row));
  return rows;
}

/** 用改好的行数组整体替换表格：不用做位置换算，最不容易出错 */
function replaceTableRows(editor: Editor, pos: number, node: PMNode, rows: PMNode[]) {
  const next = node.copy(Fragment.fromArray(rows));
  const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, next);

  // ⚠️ 整表替换会把光标挤出表格，浮动工具条会因此收起来（用户就得重新点回表格）。
  //    这里把光标放回表格里第一个可落点。
  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size)), 1));
  } catch {
    /* 放不回去就算了，光标停在原地 */
  }

  editor.view.dispatch(tr);
}

/** 行上移 / 下移 */
function moveTableRow(editor: Editor, dir: -1 | 1): boolean {
  const table = findTableNode(editor);
  const index = currentCellIndex(editor);
  if (!table || !index) return false;
  const rows = tableRows(table.node);
  const to = index.row + dir;
  if (index.row < 0 || to < 0 || to >= rows.length) return false;
  const next = rows.slice();
  const [moved] = next.splice(index.row, 1);
  next.splice(to, 0, moved);
  replaceTableRows(editor, table.pos, table.node, next);
  return true;
}

/** 列左移 / 右移（每一行都换一次位置） */
function moveTableColumn(editor: Editor, dir: -1 | 1): boolean {
  const table = findTableNode(editor);
  const index = currentCellIndex(editor);
  if (!table || !index) return false;
  const rows = tableRows(table.node);
  const width = rows[0]?.childCount ?? 0;
  const to = index.col + dir;
  if (index.col < 0 || to < 0 || to >= width) return false;

  const nextRows = rows.map((row) => {
    const cells: PMNode[] = [];
    row.forEach((cell) => cells.push(cell));
    if (index.col >= cells.length || to >= cells.length) return row;
    const arr = cells.slice();
    const [moved] = arr.splice(index.col, 1);
    arr.splice(to, 0, moved);
    return row.copy(Fragment.fromArray(arr));
  });

  replaceTableRows(editor, table.pos, table.node, nextRows);
  return true;
}

/** 按光标所在列排序（第一行当表头，不参与排序） */
function sortTableByColumn(editor: Editor, ascending: boolean): boolean {
  const table = findTableNode(editor);
  const index = currentCellIndex(editor);
  if (!table || !index) return false;
  const rows = tableRows(table.node);
  if (rows.length < 3) return false;

  const [header, ...body] = rows;
  const cellText = (row: PMNode, col: number) => {
    const cell = row.child(col);
    return cell ? cell.textContent.trim() : '';
  };

  body.sort((a, b) => {
    const cmp = cellText(a, index.col).localeCompare(cellText(b, index.col), 'zh-Hans-CN', { numeric: true });
    return ascending ? cmp : -cmp;
  });

  replaceTableRows(editor, table.pos, table.node, [header, ...body]);
  return true;
}

/** 导出成 CSV 文本（跟 Excel / 表格软件对接） */
function tableToCsv(editor: Editor): string {
  try {
    const at = editor.view.domAtPos(editor.state.selection.from).node as Node;
    const element = at.nodeType === Node.TEXT_NODE ? at.parentElement : (at as HTMLElement);
    const table = element?.closest('table');
    if (!table) return '';
    return [...table.querySelectorAll('tr')]
      .map((tr) =>
        [...tr.querySelectorAll('th, td')]
          .map((cell) => {
            const text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(',')
      )
      .join('\n');
  } catch {
    return '';
  }
}

/** 📊 表格工具条：光标在表格里时出现在编辑器工具栏里（对标 Obsidian 的 Advanced Tables） */
function TableToolsBar({ editor }: { editor: Editor }) {
  return (
    <div className="table-tools">
      <button type="button" data-tip="上方插入一行（Ctrl+Alt+Shift+↑）" aria-label="上方插入一行" onClick={() => editor.chain().focus().addRowBefore().run()}>
        <Rows3 size={13} /><ArrowUp size={11} />
      </button>
      <button type="button" data-tip="下方插入一行（Ctrl+Alt+Shift+↓）" aria-label="下方插入一行" onClick={() => editor.chain().focus().addRowAfter().run()}>
        <Rows3 size={13} /><ArrowDown size={11} />
      </button>
      <button type="button" data-tip="删除本行（Ctrl+Alt+Backspace）" aria-label="删除本行" onClick={() => editor.chain().focus().deleteRow().run()}>
        <Rows3 size={13} /><Trash2 size={11} />
      </button>
      <span className="sep" />
      <button type="button" data-tip="左侧插入一列（Ctrl+Alt+Shift+←）" aria-label="左侧插入一列" onClick={() => editor.chain().focus().addColumnBefore().run()}>
        <Columns3 size={13} /><ArrowLeft size={11} />
      </button>
      <button type="button" data-tip="右侧插入一列（Ctrl+Alt+Shift+→）" aria-label="右侧插入一列" onClick={() => editor.chain().focus().addColumnAfter().run()}>
        <Columns3 size={13} /><ArrowRight size={11} />
      </button>
      <button type="button" data-tip="删除本列（Ctrl+Alt+Delete）" aria-label="删除本列" onClick={() => editor.chain().focus().deleteColumn().run()}>
        <Columns3 size={13} /><Trash2 size={11} />
      </button>
      <span className="sep" />
      <button type="button" data-tip="本行上移（Ctrl+Alt+↑）" aria-label="本行上移" onClick={() => moveTableRow(editor, -1)}>
        <ArrowUp size={13} />
      </button>
      <button type="button" data-tip="本行下移（Ctrl+Alt+↓）" aria-label="本行下移" onClick={() => moveTableRow(editor, 1)}>
        <ArrowDown size={13} />
      </button>
      <button type="button" data-tip="本列左移（Ctrl+Alt+←）" aria-label="本列左移" onClick={() => moveTableColumn(editor, -1)}>
        <ArrowLeft size={13} />
      </button>
      <button type="button" data-tip="本列右移（Ctrl+Alt+→）" aria-label="本列右移" onClick={() => moveTableColumn(editor, 1)}>
        <ArrowRight size={13} />
      </button>
      <span className="sep" />
      <button type="button" data-tip="本列左对齐（Ctrl+L）" aria-label="本列左对齐" onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <AlignLeft size={13} />
      </button>
      <button type="button" data-tip="本列居中（Ctrl+E）" aria-label="本列居中" onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <AlignCenter size={13} />
      </button>
      <button type="button" data-tip="本列右对齐（Ctrl+R）" aria-label="本列右对齐" onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <AlignRight size={13} />
      </button>
      <span className="sep" />
      <button type="button" data-tip="按本列升序（A→Z / 小→大）（表格内 Ctrl+Alt+1）" aria-label="按本列升序（A→Z / 小→大）" onClick={() => sortTableByColumn(editor, true)}>
        <ArrowUpDown size={13} /><span>A→Z</span>
      </button>
      <button type="button" data-tip="按本列降序（Z→A / 大→小）（表格内 Ctrl+Alt+2）" aria-label="按本列降序（Z→A / 大→小）" onClick={() => sortTableByColumn(editor, false)}>
        <ArrowUpDown size={13} /><span>Z→A</span>
      </button>
      <span className="sep" />
      <button type="button" data-tip="表头行开关（Ctrl+Alt+H）" aria-label="表头行开关" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
        <TableIcon size={13} />
      </button>
      <button
        type="button"
        data-tip="复制为 CSV（可直接粘进 Excel）（Ctrl+Alt+K）" aria-label="复制为 CSV（可直接粘进 Excel）"
        onClick={() => {
          const csv = tableToCsv(editor);
          if (csv) void copyToClipboard(csv);
        }}
      >
        <Copy size={13} /><span>CSV</span>
      </button>
      <button type="button" data-tip="删除整张表格（Ctrl+Alt+Shift+Delete）" aria-label="删除整张表格" onClick={() => editor.chain().focus().deleteTable().run()}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

const lowlight = createLowlight({
  bash, c, cpp, csharp, css, diff, dockerfile, dos, go, ini, java, javascript, json,
  lua, markdown, matlab, nginx, php, powershell, python, rust, sql, typescript, xml, yaml,
  // ⚠️ plaintext 必须注册：下面的 defaultLanguage 指着它。
  //    没注册的话 lowlight 找不到这门语言，会退回**自动猜色** ——
  //    表现就是"选了纯文本，代码块第一行却被染成绿色"（被猜成 HTML 的属性名了）。
  plaintext,
});

/** 内部用 plaintext 当兜底（避开 tiptap 的 highlightAuto 自动猜色），对外一律显示成"没选语言" */
const normalizeLang = (raw: unknown): string => {
  const value = String(raw || '').trim();
  return value.toLowerCase() === 'plaintext' ? '' : value;
};

/** 代码块语言取出来给人看的样子（空 = 不标） */
const codeBlockLangLabel = (node: { attrs: Record<string, unknown> }) =>
  prettyLang(String(node.attrs.language || ''));

/**
 * 代码块 + 右上角复制按钮。
 *
 * 为什么不沿用前台那套「客户端扫 DOM 塞按钮」：编辑器是 ProseMirror 托管的
 * contenteditable，往里插 DOM 会被它当成文档内容解析掉（或者下一个 transaction
 * 直接清掉）。所以这里走正规的 NodeView —— 按钮是 NodeView 自己的 DOM，
 * 用 stopEvent 挡掉点击，用 ignoreMutation 告诉 ProseMirror「这块不关你的事」。
 */
const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
    // ⚠️ NodeView 不会自动带上 configure 里配的 HTMLAttributes（背景色那些），
    //    必须自己合并，否则代码块会变成透明底 + 亮灰字，和预览长得不一样。
    const baseAttributes = {
      ...(((this.options as { HTMLAttributes?: Record<string, unknown> }).HTMLAttributes) || {}),
    };

    return ({ node, HTMLAttributes, getPos, editor }) => {
      let current = node;

      const merged = { ...baseAttributes, ...((HTMLAttributes || {}) as Record<string, unknown>) };

      const wrap = document.createElement('div');
      wrap.className = 'cc-wrap';

      const pre = document.createElement('pre');
      Object.entries(merged).forEach(([key, value]) => {
        if (key === 'class' || value == null) return;
        pre.setAttribute(key, String(value));
      });
      if (merged.class) pre.className = String(merged.class);

      const code = document.createElement('code');
      // 和预览一样给 code 挂上 language-xxx（前台复制按钮、着色工具都认这个）
      const initialLanguage = normalizeLang(current.attrs.language);
      if (initialLanguage) code.className = `language-${initialLanguage}`;
      pre.appendChild(code);
      wrap.appendChild(pre);

      /* ---------- 右上角工具条：语言下拉 + 复制按钮 ---------- */
      const tools = document.createElement('div');
      tools.className = 'cc-tools';
      tools.setAttribute('contenteditable', 'false');

      /**
       * 每个代码块自己的语言下拉。
       * 编辑器是所见即所得，围栏不显示、也没法"打 ```powershell"，
       * 所以就靠这个下拉单独设置这一块的语法高亮（改完立刻高亮 + 落盘时写进围栏）。
       */
      const picker = document.createElement('select');
      picker.className = 'cc-lang-pick';
      picker.title = '这个代码块的语法高亮语言（也会写进 Markdown 围栏）';
      picker.setAttribute('aria-label', '代码块语言');

      const fillPicker = (lang: string) => {
        picker.textContent = '';

        // 「自定义…」放第一位（常用操作，别埋在最后）
        const custom = document.createElement('option');
        custom.value = CUSTOM_LANG_VALUE;
        custom.textContent = '自定义…';
        picker.appendChild(custom);

        // 当前是自定义语言的话，把它紧跟在「自定义…」后面，一眼能看到、也能再选中
        if (lang && !CODE_LANGUAGES.some((item) => item.value === lang)) {
          const current = document.createElement('option');
          current.value = lang;
          current.textContent = lang;
          picker.appendChild(current);
        }

        CODE_LANGUAGES.forEach((item) => {
          const option = document.createElement('option');
          option.value = item.value;
          option.textContent = item.label;
          picker.appendChild(option);
        });

        picker.value = lang;
      };

      const applyLanguage = (value: string) => {
        try {
          const pos = typeof getPos === 'function' ? getPos() : null;
          if (pos == null) return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language: value || null })
          );
        } catch {
          /* 节点已经不在文档里了，忽略 */
        }
      };

      /** 选了「自定义…」就把下拉就地换成输入框：预设之外的语言自己打 */
      const openCustomInput = () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cc-lang-input';
        input.placeholder = '输入语言，如 powershell';
        input.value = String(current.attrs.language || '');
        input.setAttribute('contenteditable', 'false');
        input.setAttribute('spellcheck', 'false');

        let done = false;
        const close = (apply: boolean) => {
          if (done) return;
          done = true;
          const value = input.value.trim().toLowerCase();
          if (input.parentNode === tools) tools.replaceChild(picker, input);
          if (apply) applyLanguage(value);
          else fillPicker(String(current.attrs.language || ''));
        };

        input.addEventListener('keydown', (event) => {
          // 别让按键跑到 ProseMirror 里（否则回车会在代码块里换行）
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            close(true);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            close(false);
          }
        });
        input.addEventListener('blur', () => close(true));

        tools.replaceChild(input, picker);
        input.focus();
        input.select();
      };

      picker.addEventListener('change', () => {
        if (picker.value === CUSTOM_LANG_VALUE) {
          openCustomInput();
          return;
        }
        applyLanguage(picker.value);
      });

      tools.appendChild(picker);

      let bar = createCopyBar(codeBlockLangLabel(current), () => current.textContent);
      bar.classList.add('cc-bar--inline');
      tools.appendChild(bar);
      wrap.appendChild(tools);

      /**
       * 📏 长代码块在编辑器里也能展开/收起，走的和前台**完全同一份**逻辑
       * （attachCodeFold），所以按钮长相、折叠行数、渐变都一样。
       * 行数是会变的（在代码块里打字、粘贴），所以交给 refresh() 自己装上/卸掉。
       */
      // 默认**收起**（跟前台一致）：超过 10 行的块一进来就是折起来的。
      // 光标点进代码块会自动展开（看不见正在编辑的行更糟），所以不影响打字。
      const fold = attachCodeFold(wrap, pre, code, tools);
      const onFocusIn = () => fold.expand();
      code.addEventListener('focusin', onFocusIn);

      fillPicker(initialLanguage);

      // ⚠️ 必须**延后一拍**再数行数：NodeView 刚创建时 code 还是空的
      //    （ProseMirror 随后才把内容填进 contentDOM），当场数会得到 0 行 →
      //    折叠/展开按钮不出现，非得在代码块里敲一下（触发 update）才冒出来。
      const settle = () => fold.refresh();
      const rafId = requestAnimationFrame(settle);
      const settleTimer = window.setTimeout(settle, 150);

      return {
        dom: wrap,
        contentDOM: code,
        /** NodeView 被拆掉时，把我们自己挂的监听也摘干净 */
        destroy: () => {
          code.removeEventListener('focusin', onFocusIn);
          cancelAnimationFrame(rafId);
          window.clearTimeout(settleTimer);
        },
        /** 我们插的那一圈壳（工具条、折叠按钮、渐变）上的事件一律不给 ProseMirror，
            否则点一下光标就跑了 / 下拉打不开；代码本体照常交给它 */
        stopEvent: (event) => {
          const target = event.target as Node;
          return wrap.contains(target) && !code.contains(target);
        },
        /** 我们自己插的工具条变动别让它回写文档 */
        ignoreMutation: (mutation) => !code.contains(mutation.target as Node),
        update: (updated) => {
          if (updated.type !== current.type) return false;
          current = updated;

          const nextLanguage = normalizeLang(updated.attrs.language);
          if (nextLanguage) code.className = `language-${nextLanguage}`;
          else code.removeAttribute('class');
          if (picker.value !== nextLanguage) fillPicker(nextLanguage);

          const nextLabel = codeBlockLangLabel(updated);
          const shown = bar.querySelector('.cc-lang')?.textContent || '';
          if (nextLabel !== shown) {
            const fresh = createCopyBar(nextLabel, () => current.textContent);
            fresh.classList.add('cc-bar--inline');
            tools.replaceChild(fresh, bar);
            bar = fresh;
          }
          // 行数变了（打字/粘贴）→ 折叠按钮跟着装上或卸掉
          fold.refresh();
          return true;
        },
      };
    };
  },
});

/** 下拉里那一项「自定义…」的值（不是真的语言名） */
const CUSTOM_LANG_VALUE = '__custom__';

/**
 * 工具栏里代码块的语言候选。
 * value 就是最终写进围栏里的名字（```powershell），也是前台代码块复制按钮上显示的那个。
 * 想加语言往这里加一行就行。
 */
const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: '', label: '纯文本' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'cmd', label: 'Cmd / Batch' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'tsx', label: 'TSX' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'XML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'ini', label: 'INI / Conf' },
  { value: 'nginx', label: 'Nginx' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'diff', label: 'Diff' },
  { value: 'lua', label: 'Lua' },
  { value: 'vue', label: 'Vue' },
  { value: 'matlab', label: 'MATLAB' },
];

const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        renderHTML: attributes => ({
          style: `width: ${attributes.width}; height: auto; display: block; margin: 2rem 0; border-radius: 2rem; box-shadow: 0 20px 50px rgba(0,0,0,0.15);`
        })
      }
    };
  },
});

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() { return [{ types: this.options.types, attributes: { fontSize: { default: null, parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''), renderHTML: attributes => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {} } } }]; },
  addCommands() { return { setFontSize: (fontSize: string) => ({ chain }) => chain().setMark('textStyle', { fontSize }).run() }; },
});

// ═══════════════ ⏎ 引用块里按回车「出引用」 ═══════════════
/**
 * 引用块里的**空行**上再按一次回车 → 直接跳出引用（和 Obsidian / Word 一样）。
 *
 * 以前：第一下回车在引用里生成一个空行，第二下回车**还是**在引用里再生成一个 ✗
 *       想出来只能手动按 Del 删掉那个空行 —— 又麻烦，而且那一行带着引用的内边距，
 *       看起来比正常空行"胖"一圈（用户："回车两下还残留着引用块，还得按 Del"）✗
 *
 * 现在：在空段落上按回车 = 把这一段**抬出引用** ✓ 两下回车就干净地在外面了 ✓
 *
 * 只处理「空的、且**直接**在 blockquote 里的段落」；其它情况一律 return false，
 * 交给默认回车行为（拆分段落）✓（priority 调高，保证抢在 StarterKit 的 Enter 前面）
 */
const ExitQuoteOnEmptyEnter = Extension.create({
  name: 'exitQuoteOnEmptyEnter',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;

        const { $from } = selection;
        const para = $from.parent;
        if (para.type.name !== 'paragraph' || para.content.size !== 0) return false;

        // 光标这一段必须直接在 blockquote 里（引用里再套列表的情况不插手）
        const depth = $from.depth;
        if (depth < 2) return false;
        if ($from.node(depth - 1).type.name !== 'blockquote') return false;

        // 抬出去；抬不动就交回默认行为
        return this.editor.chain().lift('blockquote').run();
      },
    };
  },
});

// ═══════════════ 📏 行号 ═══════════════
// 逻辑跟 Obsidian 一致：
//   · 主行号按「书写行」编号 —— 一段/一个标题/一个列表项各算一行，
//     段落太长自动折行时**不会**多给一个号（和 Obsidian 的软换行一样）。
//   · 代码块按**内部真实行数**编号（Obsidian 也这样）：写了 4 行就占外面 4 个号，
//     同时块内那套 1、2、3… 的编号照旧（两套编号并存）。
// ProseMirror 插件活在 React 之外，所以开关放在这个共享对象里给它读。
const lineNumberPrefs = { enabled: true };

/**
 * 一行行号要量的目标。
 *   · node     —— 整块（段落/标题/分隔线/图片/表格行）：直接量它自己的行盒
 *   · caret    —— 段落里被硬换行 `<br>` 分出来的**后续**行：ProseMirror 里它还是同一个段落，
 *                 但 Obsidian 里那就是独立的一行（粘贴时 breaks:true 就是这么进来的），
 *                 所以也各占一个号；位置用插入符量，再按行高补回上下半个行距
 *   · codeLine —— 代码块内部的行：块里有几行就占外面几个号
 */
type LineTarget =
  | { kind: 'node'; pos: number }
  | { kind: 'caret'; pos: number; nodePos: number }
  | { kind: 'codeLine'; prePos: number; line: number };

/** 按 Markdown 的书写行收集位置：条目里的嵌套列表也会各自算一行 */
const collectLineTargets = (parent: PMNode, base: number, out: LineTarget[]) => {
  parent.forEach((child, offset) => {
    const childPos = base + offset;
    // 代码块要拆成「一行一个号」（Obsidian 行为）：块里有几行就占外面几个号
    if (child.type.name === 'codeBlock') {
      const lineCount = (child.textContent || '').split('\n').length;
      for (let i = 0; i < lineCount; i += 1) out.push({ kind: 'codeLine', prePos: childPos, line: i });
      return;
    }
    if (child.isTextblock) {
      out.push({ kind: 'node', pos: childPos }); // 段落/标题：量它自己的行盒
      // 段落内部的硬换行（`<br>`）之后的每一行也算一行（软换行不算，和以前一样）
      child.forEach((inline, inlineOffset) => {
        if (inline.type.name === 'hardBreak') {
          out.push({ kind: 'caret', pos: childPos + 1 + inlineOffset + 1, nodePos: childPos });
        }
      });
      return;
    }
    if (child.isLeaf) { out.push({ kind: 'node', pos: childPos }); return; } // 分隔线/图片这种整块，量它本身
    // 表格：按"行"编号（每行一个），不要递归进单元格 —— 否则一行里每个单元格都冒一个编号、还压在边框上
    if (child.type.name === 'table') {
      child.forEach((_row, rowOffset) => {
        out.push({ kind: 'node', pos: childPos + 1 + rowOffset });
      });
      return;
    }
    collectLineTargets(child, childPos + 1, out);                           // 列表、引用继续往里走
  });
};

/**
 * 量一行的行盒（top/bottom，视口坐标）。
 *
 * ⚠️ 以前这里是 `view.coordsAtPos(段落起点)` —— 拿回来的是**插入符矩形**（高 23px），
 *    而段落的行盒是 26px（prose-lg 的 1.75 行高）。两个数都不是一回事，于是行号
 *    每行只往下走 23px、正文走 26px —— 攒到二三十行就整片错位 ✗
 *    （线上还叠加了 .line-no 的 position:absolute 没生效，数字干脆变成文档流堆叠）
 * 现在：整块一律量 DOM 节点的行盒，只有 `<br>` 分出来的行才退回插入符 + 行距补偿。
 */
const measureLineBox = (view: EditorView, t: LineTarget): { top: number; bottom: number } | null => {
  if (t.kind === 'codeLine') {
    const pre = view.nodeDOM(t.prePos) as HTMLElement | null;
    const code = (pre?.querySelector('code') as HTMLElement | null) || pre;
    if (!code) return null;
    const cs = getComputedStyle(code);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 20;

    // 首选：直接量块内那个行号 widget（.code-line-no 是零宽 + vertical-align:top，
    // 它的 top 就是本行行盒的顶边）—— 跟里面那套编号同一个基准，两套自然对齐。
    // ⚠️ 以前是 `code.getBoundingClientRect().top + line * 行高`：
    //    <code> 是 inline 元素，它 rect 的顶边是**字形区域**的顶边、比行盒顶边低半个行距，
    //    于是外面那套编号整体比块内那套低一截 —— 就是"编辑器里外两套行号对不上"的来源。
    // ⛔ 收起的代码块：只给前 FOLD_AFTER 行编号。
    //    规则和预览里那条 CSS 严格对齐 ——
    //      `.cc-wrap[data-cc-fold="closed"] > .cc-lines > span:nth-child(n + 11) { display: none; }`
    //    预览露 10 行就标 10 个号，编辑器必须一样。
    //    被折起来的行**不画号**，但它们**照样占文档行数**，所以紧跟代码块的那一行会接着往下数
    //    （例：30 行的代码块收起后只画第 1~10 号，块后面第一行正文就是第 31 号）。
    const foldWrap = pre?.closest('.cc-wrap') as HTMLElement | null;
    if (foldWrap?.dataset.ccFold === 'closed' && t.line >= FOLD_AFTER) return null;

    // 再补一道位置兜底（折叠属性还没落上的那一瞬间）：被 pre 裁到下边界之外的行也不画。
    //    `.code-line-no` 只是被 max-height + overflow:hidden **裁掉显示**了，位置还在往下排，
    //    照原样画，这些号就会跑出代码块、压到下面那段内容上，和它自己的行号叠成一团。
    //    pre 的 rect 是 max-height 生效之后的实际高度，拿它当可见下边界最准。
    const preRect = pre?.getBoundingClientRect();
    const visibleBottom = preRect && preRect.height ? preRect.bottom : Number.POSITIVE_INFINITY;

    const mark = code.querySelectorAll('.code-line-no')[t.line] as HTMLElement | undefined;
    if (mark) {
      const mr = mark.getBoundingClientRect();
      if (mr.top >= visibleBottom - 1) return null;
      return { top: mr.top, bottom: mr.top + lh };
    }

    const r = code.getBoundingClientRect();
    if (!r.height) return null;
    const top = r.top + t.line * lh;
    if (top >= visibleBottom - 1) return null;
    return { top, bottom: top + lh };
  }

  if (t.kind === 'node') {
    const el = view.nodeDOM(t.pos) as HTMLElement | null;
    const r = el?.getBoundingClientRect?.();
    if (!r || !r.height) return null;
    // 文本块只取**第一行**那一行的高度：软换行不多给号，所以行号就贴在第一行上
    const lh = parseFloat(getComputedStyle(el as HTMLElement).lineHeight);
    const h = Number.isFinite(lh) && lh > 0 && lh < r.height ? lh : r.height;
    return { top: r.top, bottom: r.top + h };
  }

  // caret：段落里 <br> 之后那一行
  const c = view.coordsAtPos(t.pos);
  const nodeEl = view.nodeDOM(t.nodePos) as HTMLElement | null;
  const lh = nodeEl ? parseFloat(getComputedStyle(nodeEl).lineHeight) : NaN;
  const caretH = c.bottom - c.top;
  const pad = Number.isFinite(lh) && lh > caretH ? (lh - caretH) / 2 : 0;
  return { top: c.top - pad, bottom: c.bottom + pad };
};

/** 代码块内部行号：每行开头塞一个零宽 widget，序号由 CSS 的 attr() 显示 */
const CodeLineNumbers = Extension.create({
  name: 'codeLineNumbers',
  addProseMirrorPlugins() {
    // 缓存上一次的结果：文档对象没变（ProseMirror 的 doc 是不可变的，没改动时身份不变）
    // 就原样返回同一个 DecorationSet，避免每敲一个字都把 widget 的 DOM 重建一遍 ——
    // 那种重建正好会打断输入法组合。
    let cachedDoc: unknown = null;
    let cachedSet: DecorationSet | null = null;

    return [
      new Plugin({
        key: new PluginKey('codeLineNumbers'),
        props: {
          decorations(state) {
            if (!lineNumberPrefs.enabled) {
              cachedDoc = null;
              cachedSet = null;
              return null;
            }
            if (cachedSet && cachedDoc === state.doc) return cachedSet;

            const widgets: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'codeBlock') return true;
              const lines = node.textContent.split('\n');
              let offset = 0;
              for (let i = 0; i < lines.length; i += 1) {
                widgets.push(
                  Decoration.widget(
                    pos + 1 + offset,
                    () => {
                      const el = document.createElement('span');
                      el.className = 'code-line-no';
                      el.setAttribute('data-n', String(i + 1));
                      return el;
                    },
                    { side: -1 }
                  )
                );
                offset += lines[i].length + 1;
              }
              return false; // 代码块内部不用再往下遍历
            });
            const set = DecorationSet.create(state.doc, widgets);
            cachedDoc = state.doc;
            cachedSet = set;
            return set;
          },
        },
      }),
    ];
  },
});

// 🌟 终极修复：彻底废弃 absolute 下拉框，升级为 Fixed 居中模态框 (Modal)！
// 这样就能 100% 逃脱父级容器的 overflow 限制，绝对不可能再被遮挡！
const CustomColorPicker = ({ activeColor, onSelect, onConfirm, recentColors, onClose }: any) => {
  const presets = ['#000000', '#6366F1', '#EC4899', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];
  const [hex, setHex] = useState(activeColor);
  return (
    <>
      {/* 带有毛玻璃模糊效果的全屏遮罩 */}
      <div className="fixed inset-0 z-[9990] bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm transition-all" onClick={onClose} />

      {/* 永远居中显示的调色板面板 */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl rounded-[32px] p-6 shadow-2xl border border-white/40 dark:border-white/10 z-[9999] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Color Palette</span>
            <button onClick={() => onConfirm(hex)} className="w-8 h-8 flex items-center justify-center bg-indigo-500 text-white rounded-full hover:scale-110 transition-transform">
              <Check size={16}/>
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {presets.map(c => (
              <button
                key={c}
                onClick={() => { setHex(c); onSelect(c); }}
                className="w-full aspect-square rounded-xl border border-white/20 hover:scale-110 hover:shadow-md transition-all"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 p-3 rounded-2xl border border-white/10 shadow-inner">
            <Hash size={14} className="text-slate-400" />
            <input
              type="text"
              value={(hex || '').replace('#','')}
              onChange={(e) => { const val = '#' + e.target.value; setHex(val); if(val.length === 7) onSelect(val); }}
              className="bg-transparent w-full text-sm font-black outline-none uppercase text-slate-800 dark:text-slate-200"
            />
          </div>
          {recentColors && recentColors.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200/50 dark:border-white/10">
              {recentColors.map((c: string) => (
                <button
                  key={c}
                  onClick={() => { setHex(c); onSelect(c); }}
                  className="w-6 h-6 rounded-full border border-white/40 shadow-sm hover:scale-125 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/**
 * 打开外部链接。
 *
 * 控制台是 pywebview 窗口，优先交给 Python 用**系统默认浏览器**打开：
 * 既不会把控制台这个窗口自己导航走，也不会在 WebView 里弹出一个功能残缺的子窗口。
 * 普通浏览器里（比如开发时直接开页面）就退回 window.open 新标签页。
 */
const openExternal = (href: string) => {
  try {
    const api = (window as unknown as { pywebview?: { api?: { open_external?: (u: string) => unknown } } }).pywebview?.api;
    if (api && typeof api.open_external === 'function') {
      api.open_external(href);
      return;
    }
  } catch { /* 没接上就落到浏览器方案 */ }
  try {
    window.open(href, '_blank', 'noopener,noreferrer');
  } catch { /* 打不开就算了，不要影响编辑 */ }
};

export interface RichTextEditorHandle {
  insertImage: (url: string) => void;
  getContent: () => string;
}
interface EditorProps {
  title: string;
  setTitle: (val: string) => void;
  initialContent?: string;
  onOpenImageTool: () => void;
  isTitleLocked?: boolean;
  onChange?: () => void;
}

const RichTextEditor = forwardRef<RichTextEditorHandle, EditorProps>(({ title, setTitle, initialContent, onOpenImageTool, isTitleLocked, onChange }, ref) => {
  const [textColors, setTextColors] = useState<string[]>(['#6366F1', '#000000']);
  const [highlightColors, setHighlightColors] = useState<string[]>(['#FEF08A', '#BBF7D0']);
  const [showTextPicker, setShowTextPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);

  const loadedContentRef = useRef<string | null>(null);
  const [renderTrigger, setRenderTrigger] = useState(0);

  const editor = useEditor({
    extensions: [
      // ⏎ 引用块里的空行上按回车 = 跳出引用（要抢在 StarterKit 的 Enter 前面，所以放第一个 ✓）
      ExitQuoteOnEmptyEnter,
      /**
       * 🌟 粘贴 Markdown 时按 Markdown 解析。
       *
       * 之前只 import 了这个扩展却没启用，而且 tiptap-markdown 的
       * transformPastedText 默认是 false —— 所以从 Obsidian 全选复制过来的内容，
       * `# 标题` 只会变成一行普通文字、`- 列表` 也不会成列表。
       * 现在打开它：标题/列表/引用/围栏代码块都能正确还原。
       */
      Markdown.configure({
        transformPastedText: true,
        // 从编辑器复制走时不做 Markdown 化，粘到别处仍是原来的富文本/纯文本行为
        transformCopiedText: false,
        // 粘贴内容里的裸 HTML 不解析（安全）
        html: false,
        tightLists: true,
        linkify: true,
        /**
         * ⚠️ breaks 必须是 **true**：粘贴 Markdown 时，**单个换行**要变成真正的换行。
         *
         * 以前是 false —— markdown-it 会把段落里的单个换行当空格（软换行）✗，
         * 于是从 Obsidian 复制进来的 `> 第一行 ↵ 第二行` 会被**并成一行** ✗
         * （用户："我直接复制粘贴文章内容"——那这条路必须和 Obsidian 一样 ✓）
         * 控制台预览走 nl2br、前端走 remarkHardBreaks，两边都是"每个回车都换行"，
         * 这里改成 true 之后三边终于一致 ✓
         */
        breaks: true,
      }),
      StarterKit.configure({
        // ⚠️ 别限制成 [1,2,3]：Markdown 里 #### 很常见（Obsidian 笔记尤其），
        //    限了之后粘贴/打开时 <h4> 不在 schema 里，会被拍平成普通段落，
        //    表现就是"我明明写了 # 怎么变成纯文本了"。
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        // ⚠️ StarterKit v3 自带 Link 和 Underline，这里必须关掉自带的，统一用下面单独配置的那两个。
        // 否则会有两套同名的 Link 插件（控制台里一直有那条 "Duplicate extension names" 警告）：
        // 自带那套 openOnClick 默认是 true，单击链接就直接 window.open 开走了 ——
        // 单独配的那份 openOnClick: false 根本管不住它。
        link: false,
        underline: false,
        /**
         * ⚠️ StarterKit v3 默认开着 TrailingNode：只要文档**最后一个块不是段落**，
         *    它就自动在末尾补一个空段落。于是「把最后一行设成标题」就会当场多出一行空行，
         *    而且光标会被映射进那个新空段落（看着就是"下一行被选中"）；
         *    再对着这行新空行按一次标题，又补一行 —— 一直套娃。
         *    标题后面不需要这个补位（想接着写按回车就行），这里禁掉。
         *    代码块 / 表格 / 图片后面的补位保留，否则最后放个表格就没地方落光标了。
         */
        trailingNode: { notAfter: ['heading'] },
      }),
      CodeBlockWithCopy.configure({
        lowlight,
        // ⚠️ 这里以前是 defaultLanguage: 'cpp' —— 会给每个代码块偷偷写死 C++，
        // 保存成 ```cpp 之后前台复制按钮就会标着 C++（哪怕里面是 PowerShell）。
        // 现在默认不带语言，由工具栏的语言选择器或粘贴的围栏决定。
        defaultLanguage: 'plaintext',
        HTMLAttributes: {
          class: 'bg-[#282c34] text-[#abb2bf] p-6 rounded-[1.5rem] font-mono my-6 overflow-x-auto shadow-inner'
        },
      }),
      Underline, Subscript, Superscript, TextStyle, Color, FontSize, CustomImage,
      Link.configure({
        openOnClick: false,
        // 直接手打 URL 时的自动识别：默认是 'http'，站点上 https 后会造成混合内容告警，统一用 https
        defaultProtocol: 'https',
        HTMLAttributes: { class: 'text-indigo-500 underline cursor-pointer font-bold' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TaskList.configure({ HTMLAttributes: { class: 'not-prose space-y-3' } }),
      TaskItem.configure({ nested: true }),
      /**
       * 📊 表格。
       * 预览端一直支持表格（python-markdown 的 tables 扩展 / 前台的 remark-gfm），
       * 但编辑器之前没有表格节点，粘进来的 <table> 无处安放会被拍平成一行文字，
       * 保存时表格就没了。装上这个才形成闭环：粘 Markdown 表格 → 真表格 → 存回 Markdown 表格。
       */
      Table.configure({ resizable: false, HTMLAttributes: { class: 'editor-table' } }),
      TableRow,
      TableHeader,
      TableCell,
      CodeLineNumbers,
      CalloutDecoration,
    ],
    // ⚠️ 初始内容留空，交给下面的 effect 灌（Markdown 扩展会把 content 字符串按 Markdown 解析，
    //    文章存的是 HTML，直接塞进来会先渲染出一堆字面标签再被覆盖）。
    content: '',
    immediatelyRender: false,
    onUpdate: () => {
      if (onChange) onChange();
    },
    onTransaction: ({ editor: ed }) => {
      // ⚠️ 输入法正在组合（拼音还没上屏）时**不要**触发 React 重渲染。
      // 组合期间动到编辑器，浏览器会把还没上屏的拼音当成普通文字提交，
      // 表现就是「打着打着前面多出来几个拼音字母」。
      // 组合结束时会再走一次 transaction，那时再刷新工具栏状态即可。
      if (ed.view.composing) return;

      // 代码块里不该带文字颜色/高亮：清掉待输入格式，否则纯文本代码块里打字会带上颜色
      if (ed.isActive('codeBlock') && (ed.state.storedMarks?.length ?? 0) > 0) {
        ed.view.dispatch(ed.state.tr.setStoredMarks([]));
      }

      setRenderTrigger(v => v + 1);
    },
    editorProps: {
      attributes: { class: 'prose prose-slate dark:prose-invert prose-lg max-w-none w-full focus:outline-none min-h-full pb-60 font-serif leading-relaxed px-4 editor-content-area', spellcheck: 'false' },
      /**
       * 粘贴处理，两件事：
       *
       * ① 整段恰好是一个 ```围栏 → 直接建成带语言的代码块（见下）。
       * ② 看起来是 Markdown 源码 → 强制按 Markdown 解析。
       *    为什么需要②：tiptap-markdown 的 clipboardTextParser 只在剪贴板里**没有 HTML**
       *    时才解析 Markdown，而 Obsidian 这类软件复制时 HTML 和纯文本是一起给的，
       *    结果就是源码被当成普通文字。这里在「有围栏、或至少两种 Markdown 特征、
       *    且 HTML 里没有真正的富内容」时，主动走一次 Markdown 解析。
       *    从网页复制富文本（有 h1/ul/img/a 那些）仍然走默认的 HTML 解析，不会退化。
       */
      handlePaste(view, event) {
        const clipboard = event.clipboardData;
        const raw = clipboard?.getData('text/plain') || '';
        if (!raw.trim()) return false;

        // ① 整段就是一个围栏
        const fenced = raw.match(/^\s*```([^\n`]*)\r?\n([\s\S]*?)\r?\n?```\s*$/);
        if (fenced) {
          const language = (fenced[1] || '').trim().toLowerCase();
          // 末尾空行一起吃掉，免得代码块被撑出一大截空白
          const body = fenced[2].replace(/[\s\u00a0]+$/, '');
          const codeBlockType = view.state.schema.nodes.codeBlock;
          if (!codeBlockType) return false;

          const node = codeBlockType.createAndFill(
            { language: language || null },
            body ? view.state.schema.text(body) : undefined
          );
          if (!node) return false;

          view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
          return true;
        }

        // ② Markdown 源码（源码粘贴即可用，不用手动改格式）
        const hasFence = /^ {0,3}(```|~~~)/m.test(raw);
        /**
         * ⚠️ 每一类特征都**允许行首先有若干层 `> `**。
         * 因为 Obsidian 的 callout 长这样：
         *     > [!note] 计算方法
         *     > 1. CIDR表示法 /N
         * 之前只认「行首就是列表标记」，这种内容连一个特征都数不到。
         *
         * ✅ 判定门槛：**只要命中任意一条**（signals >= 1）就按 Markdown 解析，
         *    不再要求"至少两个特征"—— 只要文本里出现过 Markdown 语法符号就识别。
         */
        const signals =
          (/^ {0,3}(?:> ?)*#{1,6}\s+\S/m.test(raw) ? 1 : 0) +           // 标题 #
          (/^ {0,3}(?:> ?)*(?:[-*+]|\d+\.)\s+\S/m.test(raw) ? 1 : 0) +   // 列表 - * + 1.
          (/^ {0,3}>/m.test(raw) ? 1 : 0) +                              // 引用 >
          (/^ {0,3}(?:> ?)*\[!\w+\]/m.test(raw) ? 1 : 0) +               // callout [!note]
          (/^ {0,3}(?:[-*_]\s*){3,}$/m.test(raw) ? 1 : 0) +              // 分隔线 --- *** ___
          (/`[^`\n]+`/.test(raw) ? 1 : 0) +                              // 行内代码 `x`
          (/(\*\*|__)[^\n]+?\1/.test(raw) ? 1 : 0) +                     // 粗体 **x**
          (/~~[^\n]+?~~/.test(raw) ? 1 : 0) +                            // 删除线 ~~x~~
          (/!?\[[^\]\n]*\]\([^)\n]+\)/.test(raw) ? 1 : 0) +              // 链接 / 图片
          (/^ {0,3}\|.*\|/m.test(raw) ? 1 : 0);                          // 表格 | a | b |
        /**
         * ✅ 按需求：**只要文本里出现任意 Markdown 语法符号，就一律按 Markdown 解析**。
         *    （不再要求"剪贴板里没有富 HTML" —— 很多编辑器复制时会同时给一份残缺的 HTML，
         *     那份 HTML 里的引用块/列表结构反而是坏的，照着它粘才出问题。）
         *
         * 这里**自己解析**，不走 tiptap-markdown 的 clipboardTextParser：
         *   markdown-it 出 HTML  →  ProseMirror 自己的 DOMParser 建 slice（闭合的）
         * 这样引用块、列表、表格都是真正的节点，不会被拆平。
         */
        if (hasFence || signals >= 1) {
          view.dispatch(view.state.tr.replaceSelection(markdownToSlice(view.state.schema, raw)).scrollIntoView());
          return true;
        }

        // 文本里没有任何 Markdown 语法符号 → 交给默认的 HTML / 纯文本粘贴
        return false;
      },
    },
  });

  useImperativeHandle(ref, () => ({
    insertImage: (url: string) => {
      if (editor) {
        editor.chain().focus().setImage({ src: url }).run();
        if (onChange) onChange();
      }
    },
    getContent: () => {
      if (!editor) return '';
      let html = editor.getHTML();

      html = html.replace(/<p><\/p>/gi, '<br>&zwj;');
      html = html.replace(/<p><br><\/p>/gi, '<br>&zwj;');

      html = html.replace(/\s*language-plaintext\b/g, '');

      // 代码块末尾的空行（复制粘贴最容易带进来，编辑区里看着就是一大坨空白）统一清掉
      html = html.replace(
        /(<pre\b[^>]*>\s*<code\b[^>]*>)([\s\S]*?)(<\/code>\s*<\/pre>)/gi,
        (_m, open: string, body: string, close: string) => open + body.replace(/[\s\u00a0]+$/, '') + close
      );

      return html;
    }
  }), [editor, onChange]);

  useEffect(() => {
    if (!editor) return;
    // 🌟 注意：initialContent 为空字符串时也必须同步！
    // 否则从「有内容的文章」切到「空文章」时，编辑器会继续显示上一篇的内容。
    const next = initialContent ?? '';
    if (loadedContentRef.current !== next) {
      const safeContent = next
        .replace(/~~([\s\S]*?)~~/g, '<s>$1</s>')
        // 代码块末尾的换行在编辑器里会多显示成一行空行（预览里不会），进来时统一去掉，
        // 保证「编辑时看到的 = 发出去的」
        .replace(
          /(<pre\b[^>]*>\s*<code\b[^>]*>)([\s\S]*?)(<\/code>\s*<\/pre>)/gi,
          (_m, open: string, body: string, close: string) => open + body.replace(/[\s\u00a0]+$/, '') + close
        );

      /**
       * ⚠️ 这里**不能**用 editor.commands.setContent(html字符串)。
       *
       * 启用 Markdown 扩展（为了粘贴 Markdown 源码）之后，tiptap-markdown 会劫持 setContent，
       * 把字符串参数一律按 Markdown 解析；而文章存的是 HTML，且我们把 html 选项关着，
       * 结果整篇文章会变成一堆字面的 <p> 标签 —— 也就是「点开编辑全乱了」。
       *
       * 所以这里自己解析成文档再灌进去，绕开那个补丁（语义和 setContent(..., false) 一致：
       * 不触发 onUpdate，不写进撤销历史）。
       */
      const dom = new window.DOMParser().parseFromString(safeContent, 'text/html');
      /**
       * 🧩 callout 的 div 壳要还原成引用块再灌进去。
       *    后端给的 HTML 里 callout 是 <div class="callout"><div class="callout-title">…</div>…</div>，
       *    而 schema 里没有 div —— 不还原的话编辑器会把两层 div 拆掉、callout 散成一堆普通段落
       *    （预览里却是个整整齐齐的框，两边对不上），一保存 callout 还会彻底丢掉 ✗
       */
      calloutDivsToBlockquotes(dom.body);
      // ⚠️ 这里**不要**用 preserveWhitespace: 'full' —— 那会把块与块之间的换行也当内容保留，
      //    每个空隙都变成一个空段落（表现就是"每段之间凭空多出空行"）。
      //    tiptap 默认加载用的就是空 parseOptions，跟着它来。
      const parsed = PMDOMParser.fromSchema(editor.schema).parse(dom.body);
      editor.view.dispatch(
        editor.state.tr
          .replaceWith(0, editor.state.doc.content.size, parsed.content)
          .setMeta('preventUpdate', true)
      );

      loadedContentRef.current = next;
    }
  }, [editor, initialContent]);

  // 🔗 超链接弹窗：贴着「光标所在那一行的上方」出现（和删除确认气泡一个路子）
  const linkBoxRef = useRef<HTMLDivElement>(null);
  const [linkDialog, setLinkDialog] = useState<{ url: string; x: number; y: number; above: boolean } | null>(null);

  const openLinkDialog = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href || '';
    let x = typeof window !== 'undefined' ? window.innerWidth / 2 : 200;
    let y = typeof window !== 'undefined' ? window.innerHeight / 2 : 200;
    try {
      const { from, to } = editor.state.selection;
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      x = Math.min(start.left, end.left);
      y = start.top; // 光标那一行的上沿
    } catch {
      /* 拿不到坐标就退到屏幕中间 */
    }
    setLinkDialog({ url: previousUrl, x, y, above: y > 200 });
  };

  /**
   * ⌨️ 快捷键总表（对齐 Obsidian 习惯；tiptap 自带的不重复绑）
   *   自带：Ctrl+B/I/U 加粗斜体下划线 · Ctrl+Z / Ctrl+Shift+Z 撤销重做
   *   文本：Ctrl+\ 引用 · Ctrl+/ 代码块 · Ctrl+E 行内代码 · Ctrl+. 上标 · Ctrl+, 下标
   *         Ctrl+Shift+7/8/9 有序/无序/任务列表 · Ctrl+Shift+X 删除线 · Ctrl+Shift+H 高亮
   *         Ctrl+Shift+Backspace 清除格式 · Ctrl+L 链接
   *   对齐：Ctrl+Alt+L / C / R 左 / 中 / 右       颜色：Ctrl+Alt+0 自动颜色
   *   标题：Ctrl+Alt+1 ~ 6 一~六级标题（原来 1/2 被表格排序抢了，已还回来）
   *   插入：Ctrl+Alt+I 图片 · Ctrl+Shift+T 表格     行号：Ctrl+Alt+N 显示/隐藏
   *   表格：Ctrl+Alt+↑/↓ 本行上移下移 · Ctrl+Alt+←/→ 本列左右移
   *         Ctrl+Alt+Shift+↑/↓ 上下插入行 · Ctrl+Alt+Shift+←/→ 左右插入列
   *         Ctrl+Alt+Backspace 删行 · Ctrl+Alt+Delete 删列 · Ctrl+Alt+Shift+Delete 删表
   *         Ctrl+Alt+1 / 2（光标在表格里时）按本列升/降序 · Ctrl+Alt+H 表头行开关 · Ctrl+Alt+K 复制 CSV
   */
  useEffect(() => {
    if (!editor) return;

    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!editor.isFocused) return; // 在标题/弹窗输入框里打字时不抢按键

      const key = event.key;
      const lower = key.toLowerCase();
      // 数字键：优先看物理按键（event.code），免得某些键盘布局下 Ctrl+Alt+数字 的 key 不是数字
      const digit = /^[1-6]$/.test(key) ? key : (/^Digit([1-6])$/.exec(event.code)?.[1] ?? '');
      const alt = event.altKey;
      const shift = event.shiftKey;
      const chain = () => editor.chain().focus();
      let handled = true;

      if (alt && shift) {
        if (key === 'ArrowUp') chain().addRowBefore().run();
        else if (key === 'ArrowDown') chain().addRowAfter().run();
        else if (key === 'ArrowLeft') chain().addColumnBefore().run();
        else if (key === 'ArrowRight') chain().addColumnAfter().run();
        else if (key === 'Delete') chain().deleteTable().run();
        else handled = false;
      } else if (alt) {
        if (key === 'ArrowUp') moveTableRow(editor, -1);
        else if (key === 'ArrowDown') moveTableRow(editor, 1);
        else if (key === 'ArrowLeft') moveTableColumn(editor, -1);
        else if (key === 'ArrowRight') moveTableColumn(editor, 1);
        else if (key === 'Backspace') chain().deleteRow().run();
        else if (key === 'Delete') chain().deleteColumn().run();
        else if (digit) {
          // ⌨️ Ctrl+Alt+1~6 = 一~六级标题（tiptap 原生就这样绑的，之前被下面的表格排序抢走了 1/2）
          //    只有光标在表格里时，1 / 2 才让给「本列升 / 降序」
          const level = Number(digit) as 1 | 2 | 3 | 4 | 5 | 6;
          if (editor.isActive('table') && (level === 1 || level === 2)) {
            sortTableByColumn(editor, level === 1);
          } else {
            chain().toggleHeading({ level }).run();
          }
        }
        else if (lower === 'h') chain().toggleHeaderRow().run();
        else if (lower === 'k') {
          const csv = tableToCsv(editor);
          if (csv) void copyToClipboard(csv);
        }
        else if (lower === 'i') onOpenImageTool();
        else if (lower === 'e') chain().toggleCode().run();
        else if (key === '0') chain().unsetColor().run();
        else if (lower === 'n') setShowLineNumbers((v) => !v);
        else if (lower === 'l') chain().setTextAlign('left').run();
        else if (lower === 'c') chain().setTextAlign('center').run();
        else if (lower === 'r') chain().setTextAlign('right').run();
        else handled = false;
      } else if (shift) {
        if (lower === 't') chain().insertTable({ rows: 1, cols: 1, withHeaderRow: true }).run();
        else if (key === '7') chain().toggleOrderedList().run();
        else if (key === '8') chain().toggleBulletList().run();
        else if (key === '9') chain().toggleTaskList().run();
        else if (lower === 'h') chain().toggleHighlight().run();
        else if (lower === 'x') chain().toggleStrike().run();
        else if (key === 'Backspace') {
          chain().unsetAllMarks().run();
          chain().clearNodes().run();
        } else handled = false;
      } else {
        if (key === '\\') chain().toggleBlockquote().run();
        else if (key === '/') chain().toggleCodeBlock().run();
        else if (lower === 'l') chain().setTextAlign('left').run();
        else if (lower === 'e') chain().setTextAlign('center').run();
        else if (lower === 'r') chain().setTextAlign('right').run();
        else if (key === '.') chain().toggleSuperscript().run();
        else if (key === ',') chain().toggleSubscript().run();
        else handled = false;
      }

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
        if (onChange) onChange();
      }
    };

    window.addEventListener('keydown', onShortcut, true);
    return () => window.removeEventListener('keydown', onShortcut, true);
    // onOpenImageTool / setShowLineNumbers 在下面才声明，这里不放依赖数组（两者都稳定）
  }, [editor, onChange]);

  // Ctrl / Cmd + K：打开链接弹窗（Ctrl+L/E/R 让给左/中/右对齐了）
  useEffect(() => {
    if (!editor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const isL = e.key === 'k' || e.key === 'K';
      if (!(e.ctrlKey || e.metaKey) || !isL || e.shiftKey || e.altKey) return;
      if (!editor.isFocused) return;
      e.preventDefault();
      e.stopPropagation();
      openLinkDialog();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // 点别处收起弹窗
  useEffect(() => {
    if (!linkDialog) return;
    const onDown = (e: MouseEvent) => {
      if (linkBoxRef.current?.contains(e.target as Node)) return;
      setLinkDialog(null);
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [linkDialog]);

  /**
   * 🔗 编辑器里的超链接：**单击只放光标，按住 Ctrl（或 Mac 的 ⌘）点击才打开**。
   *
   * 光把 tiptap 的 openOnClick 设成 false 是不够的 —— 那只表示「tiptap 不主动去
   * window.open」，它并没有 preventDefault，浏览器对 <a> 的默认跳转照样发生，
   * 于是写着写着一不小心点到链接就跳走了。
   * 这里在捕获阶段拦掉默认行为；只有按住 Ctrl 时才真的打开。
   * 预览模式渲染的是普通 <a>（不在编辑器里），单击跳转不受影响。
   */
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return; // 只管左键
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor || !dom.contains(anchor)) return;
      const href = anchor.getAttribute('href');
      if (!href) return;

      // 一律先掐掉浏览器的默认跳转；放不放光标交给 ProseMirror 自己处理
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        openExternal(href);
      }
    };
    // 捕获阶段：抢在浏览器执行默认行为之前
    dom.addEventListener('click', onClick, true);
    return () => dom.removeEventListener('click', onClick, true);
  }, [editor]);

  // ═══════════════ 📏 行号：主行号量测 ═══════════════
  // 主行号不用 CSS 计数器，因为列表项缩进后列就对不齐了；这里直接量每一行的位置，
  // 统一画在左边固定的一列上（跟 Obsidian 的行号栏一样是一条直线）。
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  /** 工具栏那份语言控件选了「自定义…」时，这里存着正在输入的内容（null = 显示下拉） */
  const [customLangDraft, setCustomLangDraft] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [gutterLines, setGutterLines] = useState<{ n: number; y: number; h: number }[]>([]);
  const [gutterX, setGutterX] = useState(50);
  const rafRef = useRef(0);

  // 记住开关（Obsidian 也是把它当一个设置项）
  useEffect(() => {
    try {
      const saved = localStorage.getItem('editor-line-numbers');
      if (saved !== null) setShowLineNumbers(saved === '1');
    } catch { /* 无痕模式读不到就算了 */ }
  }, []);

  const measureGutter = useCallback(() => {
    const view = editor?.view;
    const scroller = scrollRef.current;
    const dom = view?.dom as HTMLElement | undefined;
    // 预览态编辑器是 display:none，这时候量出来全是 0，直接跳过（切回编辑时 ResizeObserver 会再叫一次）
    if (!view || !scroller || !dom || !dom.clientWidth || !showLineNumbers) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const originY = scrollerRect.top - scroller.scrollTop; // 滚动内容的坐标原点

    const targets: LineTarget[] = [];
    collectLineTargets(editor.state.doc, 0, targets);

    const next: { n: number; y: number; h: number }[] = [];
    targets.forEach((t, i) => {
      let box: { top: number; bottom: number } | null = null;
      try {
        box = measureLineBox(view, t);
      } catch { /* 量不到的行就跳过，不影响其它行 */ }
      if (!box) return;
      // 🔢 序号必须用 targets 的下标 i+1（= 这一行在**文档里的真实行号**），
      //    不能用"已画出的条数"。代码块收起时，被折起来的那些行不画（measureLineBox 返回 null），
      //    但它们**照样占文档的行数** —— 所以紧接着代码块的那一行，编号要接着往下走。
      //    例：代码块 30 行，收起只显示 10 个号（第 1~10 行），块后面第一行正文就该是第 31 号。
      //    h 是为了让行号和这一行的行盒一样高，字号小一点也能和正文对上基线
      next.push({ n: i + 1, y: Math.round(box.top - originY), h: Math.max(14, Math.round(box.bottom - box.top)) });
    });

    setGutterLines((prev) =>
      prev.length === next.length && prev.every((p, i) => p.y === next[i].y && p.h === next[i].h && p.n === next[i].n) ? prev : next
    );

    // 数字右边缘 = 正文左边缘再往左 14px（固定一列，不跟着引用块/列表的缩进跑）
    const textLeft = dom.getBoundingClientRect().left + (parseFloat(getComputedStyle(dom).paddingLeft) || 0);
    const x = Math.round(textLeft - scrollerRect.left - 14);
    setGutterX((prev) => (prev === x ? prev : x));
  }, [editor, showLineNumbers]);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; measureGutter(); });
  }, [measureGutter]);

  // 每次编辑都重新量（用 rAF 合并，不会每敲一个字就同步布局一次）
  // ⚠️ 输入法组合期间跳过：这时候既要读布局、又要 setState 触发重渲染，
  //    都可能打断组合导致拼音被当成普通文字留下。组合结束再补量一次。
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onTx = () => {
      if (editor.view.composing) return;
      scheduleMeasure();
    };
    const onCompositionEnd = () => scheduleMeasure();
    editor.on('transaction', onTx);
    dom.addEventListener('compositionend', onCompositionEnd);
    return () => {
      editor.off('transaction', onTx);
      dom.removeEventListener('compositionend', onCompositionEnd);
    };
  }, [editor, scheduleMeasure]);

  // 尺寸变化 / 字体加载完 / 从预览切回编辑 → 重量
  useEffect(() => {
    if (!editor) return;
    scheduleMeasure();
    const dom = editor.view.dom as HTMLElement;
    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(dom);
    if (scrollRef.current) ro.observe(scrollRef.current);
    window.addEventListener('resize', scheduleMeasure);
    const fonts = (document as any).fonts;
    if (fonts?.ready?.then) fonts.ready.then(() => scheduleMeasure()).catch(() => {});
    return () => { ro.disconnect(); window.removeEventListener('resize', scheduleMeasure); };
  }, [editor, scheduleMeasure]);

  // 开关变化：通知代码块 widget 重新生成，并重量左侧行号
  useEffect(() => {
    lineNumberPrefs.enabled = showLineNumbers;
    try { localStorage.setItem('editor-line-numbers', showLineNumbers ? '1' : '0'); } catch { /* 忽略 */ }
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta('lineNumbers', showLineNumbers));
      // 供 CSS 判断：关掉行号时收掉代码块左边的行号槽，跟预览保持一致
      editor.view.dom.setAttribute('data-code-linenumbers', showLineNumbers ? 'on' : 'off');
    }
    scheduleMeasure();
  }, [showLineNumbers, editor, scheduleMeasure]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  if (!editor) return null;

  const currentFontSize = editor.getAttributes('textStyle').fontSize || "default";

  /**
   * 🎯 字号下拉显示的是**光标所在位置的当前字号**，不是干巴巴一个"字号"两个字。
   *
   *  · 这段文字用工具栏显式设过字号 → 直接显示那个值（如 20px）✓
   *  · 没设过（正文 / 标题这种走 CSS 的）→ 把光标那一段的 `computed font-size` 读出来，
   *    于是标题会显示 35px / 26px / 20px，正文显示 16px ✓ 一眼就知道现在是多大
   */
  const FONT_SIZE_OPTIONS = ['14px', '16px', '18px', '20px', '24px', '32px', '48px'];
  const cursorFontSize = (() => {
    try {
      const { from } = editor.state.selection;
      const at = editor.view.domAtPos(from).node as Node;
      const host = (at.nodeType === 3 ? at.parentElement : at) as HTMLElement | null;
      if (!host || !host.closest('.editor-content-area')) return '';
      const px = parseFloat(window.getComputedStyle(host).fontSize);
      return Number.isFinite(px) ? `${Math.round(px)}px` : '';
    } catch {
      return '';
    }
  })();
  /** 显式设过就用它，否则用光标处的实际字号 */
  const explicitFontSize = currentFontSize !== 'default' ? currentFontSize : '';
  const fontSizeLabel = explicitFontSize || cursorFontSize || '字号';
  /** 给下拉框的 value：能对上选项就对上（好把当前项高亮出来），对不上就谁都不高亮 */
  const fontSizeValue = explicitFontSize || (FONT_SIZE_OPTIONS.includes(cursorFontSize) ? cursorFontSize : '__cursor__');

  /** 工具栏自定义语言：输入框回车/失焦时套用到当前代码块 */
  const applyToolbarLanguage = (value: string) => {
    const language = value.trim().toLowerCase();
    editor.chain().focus().updateAttributes('codeBlock', { language: language || null }).run();
    setCustomLangDraft(null);
    if (onChange) onChange();
  };

  /** 工具栏那份语言下拉的选项：自定义排第一，当前若是自定义语言就紧随其后 */
  const activeCodeLanguage = editor.isActive('codeBlock')
    ? normalizeLang(editor.getAttributes('codeBlock').language)
    : '';
  const codeLanguageOptions =
    !activeCodeLanguage || CODE_LANGUAGES.some((item) => item.value === activeCodeLanguage)
      ? CODE_LANGUAGES
      : [{ value: activeCodeLanguage, label: activeCodeLanguage }, ...CODE_LANGUAGES];

  const toggleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    // 用项目自己的弹窗（不再是浏览器原生 prompt）
    openLinkDialog();
  };

  /** 应用弹窗里填的链接 */
  const applyLink = () => {
    if (!linkDialog) return;
    const url = linkDialog.url.trim();
    setLinkDialog(null);
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    /**
     * 链接地址补全规则（⚠️ 这里错过一次，别再简化）：
     *   · 已经有协议（http: / https: / mailto: / tel: …）→ 原样保留
     *   · **站内相对路径**（`/posts/x`、`./x`、`../x`、`#锚点`）→ 原样保留！
     *     之前是无脑补 `https://`，把 `/posts/x` 拼成了 `https:///posts/x`，
     *     浏览器再把三斜杠规范化成 //，结果 `posts` 变成主机名 →
     *     点进去直接跑到 `https://posts/xxx` 这种打不开的地址（实测复现过）。
     *   · 忘了写开头斜杠的站内路径（`posts/x`）→ 补一根斜杠变成 `/posts/x`
     *   · 只写了个裸域名（example.com / localhost:3000）→ 才补 `https://`
     */
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(url);
    const isSiteRelative = /^(\/|\.\.?\/|#)/.test(url);
    const firstSegment = url.split('/')[0];
    const looksLikeHost = /\.[a-z]{2,}$/i.test(firstSegment) || /^localhost(:\d+)?$/i.test(firstSegment);
    const safeUrl = hasScheme || isSiteRelative
      ? url
      : (looksLikeHost || !url.includes('/')) ? `https://${url}` : `/${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: safeUrl }).run();
  };

  // 所有工具栏按钮统一走这里：title 同时当作自定义气泡（data-tip）和无障碍标签，
  // 原生 title 要等一秒才出来、还会被面板的 overflow:hidden 裁掉，所以用自己画的。
  const Btn = ({ onClick, active, children, title }: any) => (
    <button
      onClick={onClick}
      title={title}
      data-tip={title}
      aria-label={title}
      className={`p-2.5 max-lg:p-1 rounded-xl transition-all duration-300 ease-out flex items-center justify-center 
        ${active ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/40 scale-110' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col h-full w-full min-h-0 bg-transparent relative">
      {/* ✍️ 编辑器正文区的样式（h1~h6 字号、引用块、pre、行号 .line-no …）现在在
          app/globals.css 里 —— 之前写成内联 <style dangerouslySetInnerHTML> 时，
          线上渲染成了 <style>false</style>，整段 CSS 一条都没生效（行号错位、字号乱）。 */}

      {/* 📱 手机上标题区收一收（原来 px-12 pt-14 + text-5xl 光标题就吃掉一百多 px），
          省下来的高度全给正文 —— 键盘一弹出来，正文能多看三四行 */}
      <div className="shrink-0 px-12 pt-14 pb-4 max-lg:px-4 max-lg:pt-5 max-lg:pb-2 flex items-center gap-4">
        <input
          type="text"
          value={title}
          onChange={(e) => !isTitleLocked && setTitle(e.target.value)}
          readOnly={isTitleLocked}
          placeholder="文章大标题..."
          className={`flex-1 text-5xl max-lg:text-3xl font-black bg-transparent border-none outline-none transition-all tracking-tighter 
            ${isTitleLocked ? 'text-slate-400 dark:text-slate-600 cursor-default select-none' : 'text-slate-900 dark:text-white placeholder:text-slate-200 dark:placeholder:text-slate-800'}
          `}
        />
        {isTitleLocked && (
          <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center gap-2 text-slate-400 border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-right duration-500">
            <Lock size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">System Locked</span>
          </div>
        )}
      </div>

      {/* 📱 手机端**整体缩小**（按钮内边距 / 栏内边距 / 间隔一起收一档），一屏能同时塞下工具栏和更多正文。
          ⚠️ 不要改成"一行 + 横向滚动"：那样要滑来滑去找按钮，反而更慢。 */}
      <div className="shrink-0 px-8 py-2.5 border-y border-white/20 dark:border-white/10 flex flex-wrap items-center gap-1.5 bg-white/10 dark:bg-black/20 backdrop-blur-md z-50 max-lg:px-2 max-lg:py-1 max-lg:gap-1">
        <div className="flex items-center gap-1"><Btn onClick={() => editor.chain().focus().undo().run()} title="撤销 (Ctrl+Z)"><Undo2 size={16}/></Btn><Btn onClick={() => editor.chain().focus().redo().run()} title="重做 (Ctrl+Shift+Z)"><Redo2 size={16}/></Btn><Btn onClick={() => editor.chain().focus().unsetAllMarks().run()} title="清除格式（Ctrl+Shift+Backspace）"><RemoveFormatting size={16}/></Btn></div>
        <div className="w-px h-6 max-lg:h-4 bg-slate-400/20 mx-1 max-lg:mx-0.5" />

        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-xl px-2">
          {/* 🎛️ 用主题化下拉，不用原生 <select>：原生那个弹出列表是白底 + 浅色字，深色模式看不清 ✗
              显示的是**光标处当前字号**（没设过字号就按标题/正文的实际 CSS 大小算）✓ */}
          <ThemedSelect
            value={fontSizeValue}
            label={fontSizeLabel}
            onChange={(v) => { editor.chain().focus().setFontSize(v).run(); }}
            title="字号（当前光标位置）"
            className="text-[10px] font-black p-2 max-lg:p-1"
            panelClassName="min-w-[5.5rem]"
            options={[
              ...FONT_SIZE_OPTIONS.map((s) => ({ value: s, label: s })),
              ...(explicitFontSize && !FONT_SIZE_OPTIONS.includes(explicitFontSize)
                ? [{ value: explicitFontSize, label: explicitFontSize }]
                : []),
            ]}
          />
        </div>

        <div className="flex items-center gap-1">
          <Btn onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph') && !editor.isActive('heading')} title="正文"><Type size={18}/></Btn>
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="一级标题 (#)">
            <div className="flex items-center gap-1 font-black"><Heading1 size={16}/><span className="text-[10px] opacity-60 max-lg:hidden">#</span></div>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="二级标题 (##)">
            <div className="flex items-center gap-1 font-black"><Heading2 size={16}/><span className="text-[10px] opacity-60 max-lg:hidden">##</span></div>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="三级标题 (###)">
            <div className="flex items-center gap-1 font-black"><Heading3 size={16}/><span className="text-[10px] opacity-60 max-lg:hidden">###</span></div>
          </Btn>
          {/* H4–H6：Markdown 里 #### 很常见，层级支持到 6 级 */}
          {[4, 5, 6].map((level) => (
            <Btn
              key={level}
              onClick={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run()}
              active={editor.isActive('heading', { level })}
              title={`${['', '一', '二', '三', '四', '五', '六'][level]}级标题 (${'#'.repeat(level)})`}
            >
              <span className="font-black text-[11px]">{'H' + level}</span>
            </Btn>
          ))}
        </div>

        <div className="w-px h-6 max-lg:h-4 bg-slate-400/20 mx-1 max-lg:mx-0.5" />
        <div className="flex items-center gap-1">
          <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="加粗 (Ctrl+B)"><Bold size={16}/></Btn>
          <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体 (Ctrl+I)"><Italic size={16}/></Btn>
          <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线 (Ctrl+U)"><UnderlineIcon size={16}/></Btn>
          <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线 (Ctrl+Shift+X)"><Strikethrough size={16}/></Btn>
          <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="代码块 (Ctrl+/)"><Code2 size={16}/></Btn>
          {/* 📊 一键插入 1×1 表格（相当于 Obsidian Advanced Tables 的 Create table），行/列自己后面加 */}
          {/* 💡 插入 Obsidian 风格标注块（callout）：写成引用 + [!类型] 标记，前台/预览渲染成带图标的框 */}
          <Btn
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent([
                  {
                    type: 'blockquote',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: '[!note] 标题' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: '正文……' }] },
                    ],
                  },
                ])
                .run()
            }
            title="插入标注块（> [!note] 标题）"
          >
            <Info size={16}/>
          </Btn>
                    <Btn
            onClick={() => editor.chain().focus().insertTable({ rows: 1, cols: 1, withHeaderRow: true }).run()}
            active={editor.isActive('table')}
            title="插入表格 1×1（Ctrl+Shift+T）"
          >
            <TableIcon size={16}/>
          </Btn>
          {/* 光标在代码块里时才出现：显示并修改这个代码块的语言
              （每个代码块右上角还有一份一样的控件，就近改更方便） */}
          {editor.isActive('codeBlock') && (
            customLangDraft !== null ? (
              <input
                type="text"
                autoFocus
                value={customLangDraft}
                placeholder="输入语言，如 powershell"
                onChange={(e) => setCustomLangDraft(e.target.value)}
                onBlur={() => applyToolbarLanguage(customLangDraft)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); applyToolbarLanguage(customLangDraft); }
                  else if (e.key === 'Escape') { e.preventDefault(); setCustomLangDraft(null); }
                }}
                className="h-7 w-32 rounded-xl bg-white/70 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-600 px-2 text-[11px] font-bold outline-none"
              />
            ) : (
              <select
                value={normalizeLang(editor.getAttributes('codeBlock').language)}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_LANG_VALUE) {
                    setCustomLangDraft((editor.getAttributes('codeBlock').language as string) || '');
                    return;
                  }
                  editor.chain().focus().updateAttributes('codeBlock', { language: e.target.value || null }).run();
                  if (onChange) onChange();
                }}
                title="代码块语言：决定语法高亮，也会标在前台代码块的复制按钮上"
                className="h-7 rounded-xl bg-white/70 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-2 text-[11px] font-bold outline-none cursor-pointer"
              >
                <option value={CUSTOM_LANG_VALUE}>自定义…</option>
                {codeLanguageOptions.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            )
          )}
          <Btn onClick={() => setShowLineNumbers(v => !v)} active={showLineNumbers} title={showLineNumbers ? '隐藏行号' : '显示行号'}><Hash size={16}/></Btn>
        </div>
        <div className="w-px h-6 max-lg:h-4 bg-slate-400/20 mx-1 max-lg:mx-0.5" />
        <div className="flex items-center gap-1"><Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="左对齐 (Ctrl+L)"><AlignLeft size={16}/></Btn><Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="居中 (Ctrl+E)"><AlignCenter size={16}/></Btn><Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="右对齐 (Ctrl+R)"><AlignRight size={16}/></Btn></div>
        <div className="w-px h-6 max-lg:h-4 bg-slate-400/20 mx-1 max-lg:mx-0.5" />
        <div className="flex items-center gap-1"><Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表 (Ctrl+Shift+8)"><List size={16}/></Btn><Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表 (Ctrl+Shift+7)"><ListOrdered size={16}/></Btn><Btn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="任务列表 (Ctrl+Shift+9)"><ListTodo size={16}/></Btn><Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用 (Ctrl+\)"><Quote size={16}/></Btn></div>
        <div className="w-px h-6 max-lg:h-4 bg-slate-400/20 mx-1 max-lg:mx-0.5" />

        <div className="flex items-center gap-1">
          <Btn onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} title="上标（Ctrl+.）"><SupIcon size={16}/></Btn>
          <Btn onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} title="下标（Ctrl+,）"><SubIcon size={16}/></Btn>
          <Btn onClick={toggleLink} active={editor.isActive('link')} title="插入 / 编辑链接 (Ctrl+K)"><Link2 size={16}/></Btn>
          <Btn onClick={onOpenImageTool} title="插入图片（Ctrl+Alt+I）"><ImageIcon size={16} className="text-indigo-500"/></Btn>
        </div>

        {editor.isActive('image') && <div className="flex items-center gap-1 ml-4 bg-indigo-500/10 p-1 px-3 rounded-2xl border border-indigo-500/20 border-dashed animate-in slide-in-from-left">{['25%', '50%', '75%', '100%'].map(s => <button key={s} onClick={() => editor.chain().focus().updateAttributes('image', { width: s }).run()} title={"图片宽度 " + s} data-tip={"图片宽度 " + s} className="px-2 py-1 text-[9px] font-bold hover:bg-white rounded-lg transition-all">{s}</button>)}</div>}
        <div className="flex-1" />

        {/* 📊 光标在表格里时，表格工具条就地出现在工具栏右侧（对标 Obsidian 的 Advanced Tables） */}
        {editor.isActive('table') && <TableToolsBar editor={editor} />}

        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1.5 px-3 rounded-2xl border border-white/10 shadow-inner">
              {/* 🎨 这个调色板图标可以点：把文字颜色恢复成「自动」（跟随主题色）。
                  unsetColor 只清掉颜色属性，字号/粗体之类的格式都会保留。
                  （背景底色那边不加，按需求保持原样） */}
              <button
                type="button"
                onClick={() => editor.chain().focus().unsetColor().run()}
                title="自动颜色（跟随主题色，不影响其它格式）" data-tip="自动颜色（跟随主题色，不影响其它格式）"
                className="mr-1 p-1 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              >
                <Palette size={14} />
              </button>
              <div className="flex items-center gap-1 pr-2 border-r border-white/10">
                {textColors.map(c => <button key={c} onClick={() => editor.chain().focus().setColor(c).run()} onContextMenu={(e) => { e.preventDefault(); setTextColors(prev => prev.filter(col => col !== c)); }} title={c} data-tip={c} className="w-4 h-4 rounded-full border border-white/40 hover:scale-125 transition-all shadow-sm" style={{ backgroundColor: c }} />)}
              </div>
              <button onClick={() => { setShowTextPicker(true); setShowHighlightPicker(false); }} title="自定义文字颜色" data-tip="自定义文字颜色" className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 shadow-xl flex items-center justify-center border border-indigo-500/30 ml-1">
                <Pipette size={14} className="text-indigo-500" />
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1.5 px-3 rounded-2xl border border-white/10 shadow-inner">
              <Highlighter size={14} className="text-slate-400 mr-2" />
              <div className="flex items-center gap-1 pr-2 border-r border-white/10">
                {highlightColors.map(c => <button key={c} onClick={() => editor.chain().focus().setHighlight({ color: c }).run()} onContextMenu={(e) => { e.preventDefault(); setHighlightColors(prev => prev.filter(col => col !== c)); }} title={c} data-tip={c} className="w-4 h-4 rounded-md border border-white/40 hover:scale-125 transition-all shadow-sm" style={{ backgroundColor: c }} />)}
              </div>
              <button onClick={() => { setShowHighlightPicker(true); setShowTextPicker(false); }} title="自定义高亮颜色" data-tip="自定义高亮颜色" className="w-8 h-8 rounded-xl bg-yellow-400 shadow-xl flex items-center justify-center border border-white/20 ml-1">
                <Highlighter size={14} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 将弹窗从 Toolbar 结构中抽离出来，独立于 Flex 布局之外！ */}
      {showTextPicker && <CustomColorPicker activeColor="#6366F1" recentColors={textColors} onClose={() => setShowTextPicker(false)} onSelect={(c: string) => editor.chain().focus().setColor(c).run()} onConfirm={(c: string) => { if(!textColors.includes(c)) setTextColors(p => [c, ...p].slice(0, 6)); setShowTextPicker(false); }} />}
      {showHighlightPicker && <CustomColorPicker activeColor="#FEF08A" recentColors={highlightColors} onClose={() => setShowHighlightPicker(false)} onSelect={(c: string) => editor.chain().focus().setHighlight({ color: c }).run()} onConfirm={(c: string) => { if(!highlightColors.includes(c)) setHighlightColors(p => [c, ...p].slice(0, 6)); setShowHighlightPicker(false); }} />}

      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-8 pb-12 pl-1 pr-12 custom-scrollbar relative">
        {/* 📏 主行号：跟着内容一起滚，所以放在滚动容器里 */}
        {showLineNumbers && gutterLines.length > 0 && (
          <div data-line-gutter aria-hidden="true" className="absolute inset-0 pointer-events-none select-none" style={{ zIndex: 5 }}>
            {gutterLines.map((l) => (
              <div
                key={l.n}
                data-line-no={l.n}
                className="line-no"
                style={{ top: l.y, height: l.h, lineHeight: `${l.h}px`, left: gutterX - 40, width: 40 }}
              >
                {l.n}
              </div>
            ))}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* 📊 表格工具条已经挪到编辑器工具栏里（光标在表格里时出现），不再悬浮 */}

      {/* 🔗 光标在 GitHub/Gitee 的仓库或主页链接里时，旁边浮出「卡片 / 编辑」胶囊，
          点「卡片」在链接下方浮出卡片（点卡片=新标签页跳转）。
          它挂在 body 下、**不占文档流**，所以左侧行号一行都不用改 —— 详见该组件顶部说明。 */}
      <LinkCardTool editor={editor} onEditLink={openLinkDialog} />

      {/* 🔗 超链接弹窗：贴着光标所在那一行的上方出现（上方放不下就翻到下方） */}
      {linkDialog && typeof document !== 'undefined' && createPortal(
        <motion.div
          ref={linkBoxRef}
          data-link-dialog
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.08, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(linkDialog.x, window.innerWidth - 396)),
            top: linkDialog.above ? linkDialog.y - 10 : linkDialog.y + 28,
            transform: linkDialog.above ? 'translateY(-100%)' : 'none',
            zIndex: 9999,
          }}
          className="w-[380px] max-w-[92vw] rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl p-4"
        >
          <h3 className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-100 mb-2.5">
            <Link2 size={14} /> 设置超链接
          </h3>
          <input
            autoFocus
            value={linkDialog.url}
            onChange={(e) => setLinkDialog({ ...linkDialog, url: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
              if (e.key === 'Escape') { e.preventDefault(); setLinkDialog(null); }
            }}
            placeholder="https://example.com 或站内路径 /posts/xxx"
            className="w-full px-3 py-2 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300/60 dark:border-white/10 text-xs outline-none focus:border-indigo-400 text-slate-800 dark:text-slate-100 transition-colors"
          />
          <p className="mt-1.5 text-[11px] text-slate-400">留空点确定 = 去掉这段链接 · 快捷键 Ctrl+L</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setLinkDialog(null)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={applyLink}
              className="px-3 py-1.5 rounded-xl bg-indigo-500 text-white text-[11px] font-black shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 transition-colors"
            >
              确定
            </button>
          </div>
        </motion.div>,
        document.body
      )}
    </div>
  );
});

RichTextEditor.displayName = 'RichTextEditor';
export default RichTextEditor;

