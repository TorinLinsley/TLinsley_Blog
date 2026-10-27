"use client";

import { badgeHtmlToSource } from '../../lib/badgeSource';
import { continueOrderedLists } from '../../lib/repairMarkdown';
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
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { InputRule } from '@tiptap/core';
import ImageEditButton from './ImageEditButton';

import { Markdown } from 'tiptap-markdown';
import MarkdownIt from 'markdown-it';

const PASTE_MD = new MarkdownIt({ html: true, linkify: true, breaks: false });


const YAML_FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function stripFrontmatter(raw: string): string {
  const text = raw.replace(/^\uFEFF/, '');
  const match = YAML_FRONTMATTER.exec(text);
  return match && /^[A-Za-z_][\w-]*[ \t]*:/m.test(match[1]) ? text.slice(match[0].length) : text;
}

function tidyPasteWhitespace(body: HTMLElement) {
  const BLOCK_TAGS = new Set(['P', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'DIV', 'HR',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
  const isBlock = (node: Node | null) =>
    !!node && node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName);

  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);

  texts.forEach(text => {
    if (text.parentElement?.closest('pre')) return;
    const value = text.nodeValue || '';
    if (!/^[ \t\r\n]*$/.test(value)) {
      let next = value;
      if (/^[\r\n]/.test(next) && isBlock(text.previousSibling)) next = next.replace(/^[\r\n]+/, '');
      const atBlockEnd = isBlock(text.nextSibling) ||
        (!text.nextSibling && !!text.parentElement && ['LI', 'TD', 'TH'].includes(text.parentElement.tagName));
      if (/[\r\n]$/.test(next) && atBlockEnd) next = next.replace(/[\r\n]+$/, '');
      if (next !== value) text.nodeValue = next;
      return;
    }
    text.remove();
  });
}

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

function mergeSiblingLists(body: HTMLElement) {
  body.querySelectorAll('ol, ul').forEach(list => {
    for (;;) {
      const next = list.nextElementSibling as HTMLElement | null;
      if (!next || next.tagName !== list.tagName) break;

      if (list.tagName === 'OL') {
        const baseStart = parseInt(list.getAttribute('start') || '1', 10) || 1;
        const nextStart = parseInt(next.getAttribute('start') || '1', 10) || 1;
        const count = Array.from(list.children).filter(el => el.tagName === 'LI').length;
        const continues = nextStart === 1 || nextStart === baseStart + count;
        if (!continues) break;
      }

      while (next.firstChild) list.appendChild(next.firstChild);
      next.remove();
    }
  });
}

function splitCalloutTitle(body: HTMLElement) {
  const doc = body.ownerDocument;
  body.querySelectorAll('blockquote').forEach((bq) => {
    const first = bq.firstElementChild as HTMLElement | null;
    if (!first || first.tagName !== 'P') return;
    if (!/^\s*\[!\w+\]/.test(first.textContent || '')) return;
    const groups: Node[][] = [[]];
    Array.from(first.childNodes).forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR') {
        groups.push([]);
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const parts = (node.nodeValue || '').split('\n');
        parts.forEach((part, index) => {
          if (index > 0) groups.push([]);
          if (part) groups[groups.length - 1].push(doc.createTextNode(part));
        });
        return;
      }
      groups[groups.length - 1].push(node);
    });
    if (groups.length < 2) return;
    first.textContent = '';
    groups[0].forEach((node) => first.appendChild(node));
    let anchor: Node = first;
    groups.slice(1).forEach((nodes) => {
      if (!nodes.length) return;
      const p = doc.createElement('p');
      nodes.forEach((node) => p.appendChild(node));
      bq.insertBefore(p, anchor.nextSibling);
      anchor = p;
    });
  });
}

function trimCodeFences(body: HTMLElement) {
  body.querySelectorAll('pre > code').forEach((code) => {
    const el = code as HTMLElement;
    while (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE && !(el.firstChild.nodeValue || '').trim()) {
      el.removeChild(el.firstChild);
    }
    while (el.lastChild && el.lastChild.nodeType === Node.TEXT_NODE && !(el.lastChild.nodeValue || '').trim()) {
      el.removeChild(el.lastChild);
    }
    const first = el.firstChild as ChildNode | null;
    if (first && first.nodeType === Node.TEXT_NODE) first.nodeValue = (first.nodeValue || '').replace(/^\n+/, '');
    const last = el.lastChild as ChildNode | null;
    if (last && last.nodeType === Node.TEXT_NODE) last.nodeValue = (last.nodeValue || '').replace(/\n+$/, '');
  });
}

function markdownToSlice(schema: Schema, raw: string): Slice {
  const body = new window.DOMParser()
    .parseFromString(PASTE_MD.render(continueOrderedLists(stripFrontmatter(raw))), 'text/html')
    .body;
  tidyPasteWhitespace(body);
  mergeSiblingLists(body);
  convertTaskLists(body);
  splitCalloutTitle(body);
  trimCodeFences(body);
  body.querySelectorAll('pre').forEach(pre => {
    const walker = pre.ownerDocument.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    let lastText: Text | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) lastText = n as Text;
    const value = lastText?.nodeValue || '';
    if (lastText && value.endsWith('\n')) lastText.nodeValue = value.slice(0, -1);
  });
  body.querySelectorAll('img').forEach((img) => {
    const src = (img.getAttribute('src') || '').trim();
    if (src) return;
    const alt = img.getAttribute('alt') || '';
    img.replaceWith(body.ownerDocument.createTextNode(`![${alt}]()`));
  });

  body.querySelectorAll('p').forEach((p) => {
    const kids = Array.from(p.childNodes).filter(
      (n) => !(n.nodeType === Node.TEXT_NODE && !(n.nodeValue || '').trim())
    );
    const onlyImg = kids.length === 1
      && kids[0].nodeType === Node.ELEMENT_NODE
      && (kids[0] as Element).tagName === 'IMG';
    if (onlyImg) p.replaceWith(kids[0]);
  });
  body.querySelectorAll('p').forEach((p) => {
    const empty = !(p.textContent || '').trim()
      && Array.from(p.children).every((c) => c.tagName === 'BR');
    if (!empty) return;
    const prev = p.previousElementSibling;
    const next = p.nextElementSibling;
    if ((prev && prev.tagName === 'IMG') || (next && next.tagName === 'IMG')) p.remove();
  });

  body.querySelectorAll('a').forEach((a) => {
    const kids = Array.from(a.childNodes).filter(
      (n) => !(n.nodeType === 3 && !(n.nodeValue || '').trim())
    );
    if (kids.length !== 1) return;
    const only = kids[0];
    if (only.nodeType !== 1 || (only as Element).tagName !== 'IMG') return;
    const img = only as Element;
    const alt = img.getAttribute('alt') || '';
    const src = img.getAttribute('src') || '';
    const href = a.getAttribute('href') || '';
    a.replaceWith(body.ownerDocument.createTextNode(`[![${alt}](${src})](${href})`));
  });
  return PMDOMParser.fromSchema(schema).parseSlice(body, { preserveWhitespace: true });
}

function normalizePastedInlineHtml(html: string): string {
  if (!html || !/text-decoration|border-bottom|<ins\b/i.test(html)) return html;
  try {
    const doc = new window.DOMParser().parseFromString(html, 'text/html');

    const isAutoColor = (c: string) =>
      !c.trim() || /^(currentcolor|inherit|unset|initial|revert|transparent)$/i.test(c.trim());

    doc.body.querySelectorAll('ins').forEach((ins) => {
      const u = doc.createElement('u');
      Array.from(ins.attributes).forEach((attr) => u.setAttribute(attr.name, attr.value));
      while (ins.firstChild) u.appendChild(ins.firstChild);
      ins.replaceWith(u);
    });

    doc.body.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
      const st = el.style;
      const deco = `${st.textDecoration || ''} ${st.textDecorationLine || ''}`.toLowerCase();
      const underlined = deco.includes('underline');

      const width = parseFloat(st.borderBottomWidth || '0');
      const byBorder = width > 0 && /(solid|dashed|dotted|double)/.test((st.borderBottomStyle || '').toLowerCase());

      if (!underlined && !byBorder) return;

      const rawColor = underlined
        ? (st.textDecorationColor || '')
        : (st.borderBottomColor || '');
      const color = isAutoColor(rawColor) ? '' : rawColor.trim();

      if (byBorder) el.style.borderBottom = 'none';
      el.style.textDecorationLine = 'underline';
      if (!st.textDecoration || !st.textDecoration.toLowerCase().includes('underline')) {
        el.style.setProperty('text-decoration', `${st.textDecoration || ''} underline`.trim());
      }
      if (color) {
        el.style.textDecorationColor = color;
        el.setAttribute('data-underline-color', color);
      } else {
        el.style.removeProperty('text-decoration-color');
        el.removeAttribute('data-underline-color');
      }
    });

    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';

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

import { attachCodeFold, createCopyBar, FOLD_AFTER, prettyLang, copyToClipboard } from '../CodeCopy';
import ThemedSelect from '../ThemedSelect';
import LinkCardTool from './LinkCardTool';
import { CalloutDecoration } from './CalloutDecoration';
import { calloutDivsToBlockquotes } from './calloutBridge';

import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import { DOMParser as PMDOMParser, Fragment, Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';

import {
  Undo2, Redo2, Eraser, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered, ListTodo, 
  IndentIncrease, IndentDecrease,
  Highlighter, Code, Code2, Heading1, Heading2, Heading3,
  Type, ImageIcon, Quote, RemoveFormatting,
  Pipette, Hash, Check, Link2, Superscript as SupIcon, Subscript as SubIcon, Minus, Palette, Lock,
  Table as TableIcon, Trash2, Info, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Plus, Copy, ArrowUpDown, Rows3, Columns3
} from 'lucide-react';


function findTableNode(editor: Editor): { pos: number; node: PMNode } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') return { pos: $from.before(depth), node };
  }
  return null;
}

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

function replaceTableRows(editor: Editor, pos: number, node: PMNode, rows: PMNode[]) {
  const next = node.copy(Fragment.fromArray(rows));
  const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, next);

  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size)), 1));
  } catch {
  }

  editor.view.dispatch(tr);
}

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
  plaintext,
});

const normalizeLang = (raw: unknown): string => {
  const value = String(raw || '').trim();
  return value.toLowerCase() === 'plaintext' ? '' : value;
};

const codeBlockLangLabel = (node: { attrs: Record<string, unknown> }) =>
  prettyLang(String(node.attrs.language || ''));

const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
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
      const initialLanguage = normalizeLang(current.attrs.language);
      if (initialLanguage) code.className = `language-${initialLanguage}`;
      pre.appendChild(code);
      wrap.appendChild(pre);

      const tools = document.createElement('div');
      tools.className = 'cc-tools';
      tools.setAttribute('contenteditable', 'false');

      const picker = document.createElement('select');
      picker.className = 'cc-lang-pick';
      picker.title = '这个代码块的语法高亮语言（也会写进 Markdown 围栏）';
      picker.setAttribute('aria-label', '代码块语言');

      const fillPicker = (lang: string) => {
        picker.textContent = '';

        const custom = document.createElement('option');
        custom.value = CUSTOM_LANG_VALUE;
        custom.textContent = '自定义…';
        picker.appendChild(custom);

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
        }
      };

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

      const fold = attachCodeFold(wrap, pre, code, tools);
      const onFocusIn = () => fold.expand();
      code.addEventListener('focusin', onFocusIn);

      fillPicker(initialLanguage);

      const settle = () => fold.refresh();
      const rafId = requestAnimationFrame(settle);
      const settleTimer = window.setTimeout(settle, 150);

      return {
        dom: wrap,
        contentDOM: code,
        destroy: () => {
          code.removeEventListener('focusin', onFocusIn);
          cancelAnimationFrame(rafId);
          window.clearTimeout(settleTimer);
        },
        stopEvent: (event) => {
          const target = event.target as Node;
          return wrap.contains(target) && !code.contains(target);
        },
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
          fold.refresh();
          return true;
        },
      };
    };
  },
});

const CUSTOM_LANG_VALUE = '__custom__';

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

const IMG_MD_INPUT_RE = /!\[([^\]]*)\]\(\s*(https?:\/\/[^()\s]+)\s*\)$/i;

function convertImageMarkdown(editor: Editor) {
  if (editor.view.composing) return;
  const { state } = editor;
  const { selection } = state;
  if (!selection.empty) return;

  const { $from } = selection;
  if ($from.parent.type.name !== 'paragraph') return;
  if ($from.parentOffset !== $from.parent.content.size) return;

  const inCode = (marks: readonly { type: { name: string } }[] | undefined) =>
    !!marks?.some((m) => m.type.name === 'code');
  if (inCode($from.marks()) || inCode(state.storedMarks ?? undefined)) return;

  const text = $from.parent.textContent.trim();
  const m = /^!\[([^\]]*)\]\(([\s\S]*)\)$/.exec(text);
  if (!m) return;

  const url = /https?:\/\/[^\s()]+/.exec(m[2])?.[0];
  if (!url) return;

  const imageType = state.schema.nodes.image;
  if (!imageType) return;

  const attrs: { src: string; alt?: string } = { src: url };
  if (m[1]) attrs.alt = m[1];

  editor.view.dispatch(
    state.tr
      .replaceWith($from.before($from.depth), $from.after($from.depth), imageType.create(attrs))
      .scrollIntoView()
  );
}

const SUP_SUB_INPUT_RE = /<(sup|sub)>([\s\S]+?)<\/\1>$/i;

function convertSupSubTags(editor: Editor) {
  if (editor.view.composing) return;
  const { state } = editor;
  const { $from } = state.selection;

  if (!$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') return;

  const inCode = (marks: readonly { type: { name: string } }[] | undefined) =>
    !!marks?.some((m) => m.type.name === 'code');
  if (inCode($from.marks()) || inCode(state.storedMarks ?? undefined)) return;

  const text = $from.parent.textContent;
  const re = /<(sup|sub)>([\s\S]+?)<\/\1>/gi;
  const matches = Array.from(text.matchAll(re));
  if (!matches.length) return;

  const base = $from.start();
  let tr = state.tr;

  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const m = matches[i];
    const s = m.index ?? 0;
    const e = s + m[0].length;
    const inner = m[2];
    if (!inner.trim()) continue;

    if ($from.parentOffset > s && $from.parentOffset < e) continue;

    const markType = state.schema.marks[m[1].toLowerCase() === 'sup' ? 'superscript' : 'subscript'];
    if (!markType) continue;

    tr = tr.replaceWith(base + s, base + e, state.schema.text(inner, [markType.create()]));
  }

  if (tr.docChanged) editor.view.dispatch(tr.scrollIntoView());
}

const CustomUnderline = Underline.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.textDecorationColor || el.getAttribute('data-underline-color') || null,
        renderHTML: (attrs: { color?: string | null }) => {
          if (!attrs.color) return {};
          return { style: `text-decoration-color: ${attrs.color}; text-underline-offset: 0.18em; text-decoration-thickness: 3px;` };
        },
      },
    };
  },
});
const BADGE_PREVIEW_RE = /\[!\[([^\]]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)/g;

const BadgePreview = Extension.create({
  name: 'badgePreview',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { $from } = state.selection;
            if (!$from.parent.isTextblock) return null;
            const text = $from.parent.textContent;
            if (!text.includes('[![')) return null;
            const matches = Array.from(text.matchAll(BADGE_PREVIEW_RE));
            if (matches.length === 0) return null;
            const rel = $from.parentOffset;
            const hit = matches.find((m) => rel >= (m.index ?? 0) && rel <= (m.index ?? 0) + m[0].length);
            if (!hit) return null;
            const alt = hit[1] || '';
            const src = hit[2] || '';
            const href = hit[3] || '';
            if (!src) return null;
            const dom = document.createElement('span');
            dom.className = 'badge-preview-row';
            dom.setAttribute('contenteditable', 'false');
            const img = document.createElement('img');
            img.src = src;
            img.alt = alt;
            dom.appendChild(img);
            const tip = document.createElement('span');
            tip.className = 'badge-preview-tip';
            tip.textContent = href;
            dom.appendChild(tip);
            return DecorationSet.create(state.doc, [
              Decoration.widget($from.end() + 1, dom, { side: 1 }),
            ]);
          },
        },
      }),
    ];
  },
});
const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        renderHTML: attributes => ({
          style: `width: ${attributes.width}; height: auto; display: block; margin: 0 0 2rem 0; border-radius: 2rem; box-shadow: 0 20px 50px rgba(0,0,0,0.15);`
        })
      },
      referrerpolicy: {
        default: 'no-referrer',
        parseHTML: () => 'no-referrer',
        renderHTML: () => ({ referrerpolicy: 'no-referrer' }),
      },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: IMG_MD_INPUT_RE,
        handler: ({ state, range, match, chain }) => {
          const { $from } = state.selection;

          if ($from.parent.type.name === 'codeBlock') return null;
          const inCode = (marks: readonly { type: { name: string } }[] | undefined) =>
            !!marks?.some((m) => m.type.name === 'code');
          if (inCode($from.marks()) || inCode(state.storedMarks ?? undefined)) return null;

          const attrs: { src: string; alt?: string } = { src: match[2] };
          if (match[1]) attrs.alt = match[1];

          chain().deleteRange(range).setImage(attrs).run();
          return undefined;
        },
      }),
    ];
  },
});

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() { return [{ types: this.options.types, attributes: { fontSize: { default: null, parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''), renderHTML: attributes => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {} } } }]; },
  addCommands() { return { setFontSize: (fontSize: string) => ({ chain }) => chain().setMark('textStyle', { fontSize }).run() }; },
});

function unlistItemAtCursor(editor: any): boolean {
  const { state, view } = editor;
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if ($from.parent.type.name !== 'paragraph') return false;
  if ($from.parentOffset !== 0) return false;
  if ($from.depth < 2) return false;
  if ($from.index($from.depth - 1) !== 0) return false;
  const itemName = $from.node($from.depth - 1).type.name;
  if (itemName === 'taskItem') return editor.commands.liftListItem('taskItem');
  if (itemName !== 'listItem') return false;

  const item = $from.node($from.depth - 1);
  const itemPos = $from.before($from.depth - 1);
  const list = $from.node($from.depth - 2);
  const listPos = $from.before($from.depth - 2);
  const index = $from.index($from.depth - 2);
  const start = list.type.name === 'orderedList' ? (list.attrs.start || 1) : 1;

  const siblings: any[] = [];
  list.forEach((child: any, _offset: number, i: number) => siblings.push({ child, i }));
  const before = siblings.filter((x) => x.i < index).map((x) => x.child);
  const after = siblings.filter((x) => x.i > index).map((x) => x.child);

  const frag: any[] = [];
  let lead = 0;
  if (before.length) {
    const beforeList = list.type.create(list.attrs, before);
    frag.push(beforeList);
    lead = beforeList.nodeSize;
  }
  item.forEach((child: any) => frag.push(child));
  if (after.length) {
    const attrs = list.type.name === 'orderedList' ? { ...list.attrs, start: start + index + 1 } : list.attrs;
    frag.push(list.type.create(attrs, after));
  }
  if (!frag.length) return false;

  const tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, frag);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(listPos + lead + 1, tr.doc.content.size)), 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function toggleListKeepNumbers(editor: any, kind: 'orderedList' | 'bulletList' | 'taskList'): boolean {
  if (kind !== 'taskList' && editor.isActive(kind) && unlistItemAtCursor(editor)) return true;
  if (kind === 'orderedList') return editor.chain().focus().toggleOrderedList().run();
  if (kind === 'bulletList') return editor.chain().focus().toggleBulletList().run();
  return editor.chain().focus().toggleTaskList().run();
}

function indentItemOnce(editor: any): boolean {
  if (!editor.isActive('listItem')) return false;
  return editor.commands.sinkListItem('listItem');
}
const ListIndentKeys = Extension.create({
  name: 'listIndentKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('table')) return false;
        if (this.editor.isActive('codeBlock')) {
          this.editor.commands.insertContent('  ');
          return true;
        }
        if (this.editor.isActive('listItem')) {
          indentItemOnce(this.editor);
        }
        return true;
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('table')) return false;
        if (this.editor.isActive('listItem')) {
          this.editor.commands.liftListItem('listItem');
        }
        return true;
      },
      Backspace: () => unlistItemAtCursor(this.editor),
    };
  },
});

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

        const depth = $from.depth;
        if (depth < 2) return false;
        if ($from.node(depth - 1).type.name !== 'blockquote') return false;

        return this.editor.chain().lift('blockquote').run();
      },
    };
  },
});

const lineNumberPrefs = { enabled: true };

type LineTarget =
  | { kind: 'node'; pos: number }
  | { kind: 'caret'; pos: number; nodePos: number }
  | { kind: 'codeLine'; prePos: number; line: number };

const collectLineTargets = (parent: PMNode, base: number, out: LineTarget[]) => {
  parent.forEach((child, offset) => {
    const childPos = base + offset;
    if (child.type.name === 'codeBlock') {
      const lineCount = (child.textContent || '').split('\n').length;
      for (let i = 0; i < lineCount; i += 1) out.push({ kind: 'codeLine', prePos: childPos, line: i });
      return;
    }
    if (child.isTextblock) {
      out.push({ kind: 'node', pos: childPos });
      child.forEach((inline, inlineOffset) => {
        if (inline.type.name === 'hardBreak') {
          out.push({ kind: 'caret', pos: childPos + 1 + inlineOffset + 1, nodePos: childPos });
        }
      });
      return;
    }
    if (child.isLeaf) { out.push({ kind: 'node', pos: childPos }); return; }
    if (child.type.name === 'table') {
      child.forEach((_row, rowOffset) => {
        out.push({ kind: 'node', pos: childPos + 1 + rowOffset });
      });
      return;
    }
    collectLineTargets(child, childPos + 1, out);
  });
};

const measureLineBox = (view: EditorView, t: LineTarget): { top: number; bottom: number } | null => {
  if (t.kind === 'codeLine') {
    const pre = view.nodeDOM(t.prePos) as HTMLElement | null;
    const code = (pre?.querySelector('code') as HTMLElement | null) || pre;
    if (!code) return null;
    const cs = getComputedStyle(code);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 20;

    const foldWrap = pre?.closest('.cc-wrap') as HTMLElement | null;
    if (foldWrap?.dataset.ccFold === 'closed' && t.line >= FOLD_AFTER) return null;

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
    if (!el || !r || !r.height) return null;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6 || 20;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const content = Math.max(0, r.height - padTop - padBottom);
    const top = r.top + padTop + Math.min(0, content - lh) / 2;
    return { top, bottom: top + Math.min(lh, content || lh) };
  }

  const c = view.coordsAtPos(t.pos);
  const nodeEl = view.nodeDOM(t.nodePos) as HTMLElement | null;
  const lh = nodeEl ? parseFloat(getComputedStyle(nodeEl).lineHeight) : NaN;
  const caretH = c.bottom - c.top;
  const pad = Number.isFinite(lh) && lh > caretH ? (lh - caretH) / 2 : 0;
  return { top: c.top - pad, bottom: c.bottom + pad };
};

const CodeLineNumbers = Extension.create({
  name: 'codeLineNumbers',
  addProseMirrorPlugins() {
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
              return false;
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

function UnderlineColorButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(['#818CF8', '#EC4899', '#10B981']);

  useEffect(() => {
    try { const raw = localStorage.getItem('underline-recent'); if (raw) setRecent((JSON.parse(raw) as string[]).slice(0, 3)); } catch {  }
  }, []);

  const current = (editor?.getAttributes('underline')?.color as string | undefined) || '';
  const canApply = !!editor && !editor.state.selection.empty;

  const apply = (c: string | null) => {
    if (!editor || editor.state.selection.empty) return;
    editor.chain().focus().setMark('underline', { color: c }).run();
    if (c) {
      setRecent((prev) => {
        const next = [c, ...prev.filter((x) => x !== c)].slice(0, 3);
        try { localStorage.setItem('underline-recent', JSON.stringify(next)); } catch {  }
        return next;
      });
    }
  };

  return (
    <div className={`flex items-center gap-1 rounded-2xl p-1.5 px-3 border border-white/40 dark:border-white/10 bg-black/5 dark:bg-white/5 `}>
      <button type="button" onClick={() => apply(null)} title="自动（跟随主题）" className="px-1.5 py-0.5 text-[9px] font-bold rounded-md text-slate-500 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700/70 transition-colors">自动</button>
      {recent.length === 0 && <span className="w-4 h-4 rounded-full border border-dashed border-slate-400/50" />}
      {recent.map((c) => (
        <button key={c} type="button" onClick={() => apply(c)} title={c} className="w-4 h-4 rounded-full border border-white/60 shadow-sm hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
      ))}
      <button type="button" onClick={() => setOpen(true)} title="更多颜色 / 自定义" className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/70 dark:bg-slate-700/70 hover:bg-white dark:hover:bg-slate-600 transition-colors">
        <span className="w-3 h-3 rounded-full" style={{ background: current || 'linear-gradient(135deg,#818CF8,#6366F1)' }} />
      </button>
      {open && typeof document !== 'undefined' && createPortal((
        <CustomColorPicker
          activeColor={current || '#6366F1'}
          presets={['#6366F1', '#818CF8', '#4F46E5', '#8B5CF6', '#A78BFA', '#EC4899', '#F43F5E', '#F59E0B', '#EAB308', '#10B981', '#06B6D4', '#3B82F6', '#64748B']}
          onSelect={(c: string) => apply(c)}
          onConfirm={(c: string) => { apply(c); setOpen(false); }}
          onAuto={() => { apply(null); setOpen(false); }}
          recentColors={recent}
          onClose={() => setOpen(false)}
        />
      ), document.body)}
    </div>
  );
}

const CustomColorPicker = ({ activeColor, onSelect, onConfirm, recentColors, onClose, presets: presetList, onAuto }: any) => {
  const presets: string[] = presetList ?? ['#000000', '#6366F1', '#EC4899', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];
  const [hex, setHex] = useState(activeColor);
  return (
    <>
      <div className="fixed inset-0 z-[9990] bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm transition-all" onClick={onClose} />

      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 max-h-[88vh] overflow-y-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl rounded-[32px] p-6 shadow-2xl border border-white/40 dark:border-white/10 z-[9999] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Color Palette</span>{onAuto && (<button onClick={onAuto} className="ml-auto mr-2 px-2 py-1 text-[10px] font-bold rounded-lg bg-black/5 dark:bg-white/10 text-slate-500 dark:text-slate-300 hover:bg-black/10 dark:hover:bg-white/20">自动</button>)}
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

const openExternal = (href: string) => {
  try {
    const api = (window as unknown as { pywebview?: { api?: { open_external?: (u: string) => unknown } } }).pywebview?.api;
    if (api && typeof api.open_external === 'function') {
      api.open_external(href);
      return;
    }
  } catch {  }
  try {
    window.open(href, '_blank', 'noopener,noreferrer');
  } catch {  }
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
      ListIndentKeys,
      ExitQuoteOnEmptyEnter,
      Markdown.configure({
        transformPastedText: true,
        transformCopiedText: false,
        html: false,
        tightLists: true,
        linkify: true,
        breaks: true,
      }),
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        link: false,
        underline: false,
        trailingNode: { notAfter: ['heading'] },
      }),
      CodeBlockWithCopy.configure({
        lowlight,
        defaultLanguage: 'plaintext',
        HTMLAttributes: {
          class: 'bg-[#282c34] text-[#abb2bf] p-6 rounded-[1.5rem] font-mono my-6 overflow-x-auto shadow-inner'
        },
      }),
      CustomUnderline, Subscript, Superscript, TextStyle, Color, FontSize, CustomImage, BadgePreview,
      Link.configure({
        openOnClick: false,
        defaultProtocol: 'https',
        HTMLAttributes: { class: 'text-indigo-500 underline cursor-pointer font-bold' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TaskList.configure({ HTMLAttributes: { class: 'not-prose space-y-3' } }),
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false, HTMLAttributes: { class: 'editor-table' } }),
      TableRow,
      TableHeader,
      TableCell,
      CodeLineNumbers,
      CalloutDecoration,
    ],
    content: '',
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      if (ed.view.composing) return;
      convertImageMarkdown(ed);
      convertSupSubTags(ed);
      if (onChange) onChange();
    },
    onTransaction: ({ editor: ed }) => {
      if (ed.view.composing) return;

      if (ed.isActive('codeBlock') && (ed.state.storedMarks?.length ?? 0) > 0) {
        ed.view.dispatch(ed.state.tr.setStoredMarks([]));
      }

      setRenderTrigger(v => v + 1);
    },
    editorProps: {
      attributes: { class: 'prose prose-slate dark:prose-invert prose-lg max-w-none w-full focus:outline-none min-h-full pb-60 font-serif leading-relaxed px-4 editor-content-area', spellcheck: 'false' },
      transformPastedHTML: (html: string) => normalizePastedInlineHtml(html),
      handlePaste(view, event) {
        const clipboard = event.clipboardData;
        const raw = clipboard?.getData('text/plain') || '';
        if (!raw.trim()) return false;
        const clipboardHtml = clipboard?.getData('text/html') || '';
        if (clipboardHtml && /callout/i.test(clipboardHtml) && raw.trim()) {
          view.dispatch(view.state.tr.replaceSelection(markdownToSlice(view.state.schema, raw)).scrollIntoView());
          if (onChange) onChange();
          return true;
        }
        if (/<(u|ins|mark|sub|sup)\b|text-decoration\s*:|border-bottom\s*:/i.test(clipboardHtml)) {
          return false;
        }
        const pasted = raw.trim();
        if (/^https?:\/\/\S+$/i.test(pasted)) {
          const { state } = view;
          const { $from } = state.selection;
          if (state.selection.empty && $from.parent.type.name === 'paragraph') {
            const inCode = (marks: readonly { type: { name: string } }[] | undefined) =>
              !!marks?.some((m) => m.type.name === 'code');
            if (!inCode($from.marks()) && !inCode(state.storedMarks ?? undefined)) {
              const text = $from.parent.textContent;
              const joined = text.slice(0, $from.parentOffset) + pasted + text.slice($from.parentOffset);
              const m = /^!\[([^\]]*)\]\(\s*(https?:\/\/[^()\s]+)\s*\)$/i.exec(joined.trim());
              const imageType = state.schema.nodes.image;
              if (m && imageType) {
                const attrs: { src: string; alt?: string } = { src: m[2] };
                if (m[1]) attrs.alt = m[1];
                const tr = state.tr.replaceWith($from.before($from.depth), $from.after($from.depth), imageType.create(attrs));
                view.dispatch(tr.scrollIntoView());
                if (onChange) onChange();
                return true;
              }
            }
          }
        }

        const fenced = raw.match(/^\s*```([^\n`]*)\r?\n([\s\S]*?)\r?\n?```\s*$/);
        if (fenced) {
          const language = (fenced[1] || '').trim().toLowerCase();
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

        const hasFence = /^ {0,3}(```|~~~)/m.test(raw);
        const signals =
          (/^ {0,3}(?:> ?)*#{1,6}\s+\S/m.test(raw) ? 1 : 0) +
          (/^ {0,3}(?:> ?)*(?:[-*+]|\d+\.)\s+\S/m.test(raw) ? 1 : 0) +
          (/^ {0,3}>/m.test(raw) ? 1 : 0) +
          (/^ {0,3}(?:> ?)*\[!\w+\]/m.test(raw) ? 1 : 0) +
          (/^ {0,3}(?:[-*_]\s*){3,}$/m.test(raw) ? 1 : 0) +
          (/`[^`\n]+`/.test(raw) ? 1 : 0) +
          (/(\*\*|__)[^\n]+?\1/.test(raw) ? 1 : 0) +
          (/~~[^\n]+?~~/.test(raw) ? 1 : 0) +
          (/!?\[[^\]\n]*\]\([^)\n]+\)/.test(raw) ? 1 : 0) +
          (/^ {0,3}\|.*\|/m.test(raw) ? 1 : 0);
        const inCodeBlock = view.state.selection.$from.parent.type.name === 'codeBlock';
        const inlineHtmlInText = !inCodeBlock
          && !clipboardHtml.trim()
          && /<\/?(u|ins|mark|sub|sup|span)\b[^>]*>/i.test(raw);
        if (hasFence || signals >= 1 || inlineHtmlInText) {
          view.dispatch(view.state.tr.replaceSelection(markdownToSlice(view.state.schema, raw)).scrollIntoView());
          return true;
        }

        return false;
      },
    },
  });

  useImperativeHandle(ref, () => ({
    insertImage: (url: string) => {
      if (editor) {
        editor.chain().focus().setImage({ src: url }).run();

        try {
          const { state } = editor;
          const from = state.selection.from;
          const $from = state.doc.resolve(from);
          const img = $from.nodeBefore;
          if (img && img.type.name === 'image') {
            const imgStart = from - img.nodeSize;
            const before = state.doc.resolve(imgStart).nodeBefore;
            if (before && before.type.name === 'paragraph' && before.content.size === 0) {
              editor.view.dispatch(state.tr.delete(imgStart - before.nodeSize, imgStart).scrollIntoView());
            }
          }
        } catch {
        }

        if (onChange) onChange();
      }
    },
    getContent: () => {
      if (!editor) return '';
      let html = editor.getHTML();

      html = html.replace(/<p><\/p>/gi, '<br>&zwj;');
      html = html.replace(/<p><br><\/p>/gi, '<br>&zwj;');

      html = html.replace(/\s*language-plaintext\b/g, '');

      html = html.replace(
        /(<pre\b[^>]*>\s*<code\b[^>]*>)([\s\S]*?)(<\/code>\s*<\/pre>)/gi,
        (_m, open: string, body: string, close: string) => open + body.replace(/[\s\u00a0]+$/, '') + close
      );

      return html;
    }
  }), [editor, onChange]);

  useEffect(() => {
    if (!editor) return;
    const next = badgeHtmlToSource(initialContent ?? '');
    if (loadedContentRef.current !== next) {
      const safeContent = next
        .replace(/~~([\s\S]*?)~~/g, '<s>$1</s>')
        .replace(
          /(<pre\b[^>]*>\s*<code\b[^>]*>)([\s\S]*?)(<\/code>\s*<\/pre>)/gi,
          (_m, open: string, body: string, close: string) => open + body.replace(/[\s\u00a0]+$/, '') + close
        );

      const dom = new window.DOMParser().parseFromString(safeContent, 'text/html');
      const BLOCKS = new Set(['P', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'DIV', 'HR',
        'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IMG', 'FIGURE', 'SECTION', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
      const isBlockEl = (n: Node | null) =>
        !!n && n.nodeType === Node.ELEMENT_NODE && BLOCKS.has((n as Element).tagName.toUpperCase());

      {
        const walker = dom.createTreeWalker(dom.body, NodeFilter.SHOW_TEXT);
        const texts: Text[] = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
        texts.forEach((t) => {
          if (t.parentElement?.closest('pre')) return;
          if (!/^[\s\u00a0\u3000]*$/.test(t.nodeValue || '')) return;
          if (isBlockEl(t.previousSibling) || isBlockEl(t.nextSibling)) t.remove();
        });
      }

      const holdsImg = (n: Element | null) =>
        !!n && (n.tagName.toUpperCase() === 'IMG' || !!n.querySelector('img'));
      Array.from(dom.body.querySelectorAll('p')).forEach((p) => {
        if (p.querySelector('img')) return;
        if ((p.textContent || '').replace(/[\s\u00a0\u3000\u200b\u200d\ufeff]/g, '')) return;
        if (!p.querySelector('br') && p.childElementCount > 0) return;
        if (holdsImg(p.nextElementSibling) || holdsImg(p.previousElementSibling)) p.remove();
      });

      calloutDivsToBlockquotes(dom.body);
      const parsed = PMDOMParser.fromSchema(editor.schema).parse(dom.body);
      const order: PMNode[] = [];
      parsed.content.forEach((node) => order.push(node));
      const drop = new Set<number>();
      order.forEach((node, i) => {
        if (node.type.name !== 'paragraph') return;
        if ((node.textContent || '').replace(/[\s\u00a0\u3000\u200b\u200d\ufeff]/g, '')) return;
        if (node.content.size > 1) return;
        if (order[i - 1]?.type.name === 'image' || order[i + 1]?.type.name === 'image') drop.add(i);
      });
      const cleaned = drop.size
        ? parsed.type.create(parsed.attrs, order.filter((_, i) => !drop.has(i)), parsed.marks)
        : parsed;

      editor.view.dispatch(
        editor.state.tr
          .replaceWith(0, editor.state.doc.content.size, cleaned.content)
          .setMeta('preventUpdate', true)
      );

      loadedContentRef.current = next;
    }
  }, [editor, initialContent]);

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
      y = start.top;
    } catch {
    }
    setLinkDialog({ url: previousUrl, x, y, above: y > 200 });
  };

  useEffect(() => {
    if (!editor) return;

    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!editor.isFocused) return;

      const key = event.key;
      const lower = key.toLowerCase();
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
        else if (key === '7') toggleListKeepNumbers(editor, 'orderedList');
        else if (key === '8') toggleListKeepNumbers(editor, 'bulletList');
        else if (key === '9') toggleListKeepNumbers(editor, 'taskList');
        else if (lower === 'h') chain().toggleHighlight().run();
        else if (lower === 'x') chain().toggleStrike().run();
        else if (lower === 'e') chain().toggleCode().run();
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
  }, [editor, onChange]);

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

  useEffect(() => {
    if (!linkDialog) return;
    const onDown = (e: MouseEvent) => {
      if (linkBoxRef.current?.contains(e.target as Node)) return;
      setLinkDialog(null);
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [linkDialog]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor || !dom.contains(anchor)) return;
      const href = anchor.getAttribute('href');
      if (!href) return;

      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        openExternal(href);
      }
    };
    dom.addEventListener('click', onClick, true);
    return () => dom.removeEventListener('click', onClick, true);
  }, [editor]);

  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [customLangDraft, setCustomLangDraft] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [gutterLines, setGutterLines] = useState<{ n: number; y: number; h: number }[]>([]);
  const [gutterX, setGutterX] = useState(50);
  const rafRef = useRef(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('editor-line-numbers');
      if (saved !== null) setShowLineNumbers(saved === '1');
    } catch {  }
  }, []);

  const measureGutter = useCallback(() => {
    const view = editor?.view;
    const scroller = scrollRef.current;
    const dom = view?.dom as HTMLElement | undefined;
    if (!view || !scroller || !dom || !dom.clientWidth || !showLineNumbers) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const originY = scrollerRect.top - scroller.scrollTop;

    const targets: LineTarget[] = [];
    collectLineTargets(editor.state.doc, 0, targets);

    const next: { n: number; y: number; h: number }[] = [];
    let lastBottom = 0;
    targets.forEach((t, i) => {
      let box: { top: number; bottom: number } | null = null;
      try {
        box = measureLineBox(view, t);
      } catch {  }
      if (!box) {
        const top = lastBottom || originY;
        box = { top, bottom: top + 20 };
      }
      lastBottom = box.bottom;
      next.push({ n: i + 1, y: Math.round(box.top - originY), h: Math.max(14, Math.round(box.bottom - box.top)) });
    });

    setGutterLines((prev) =>
      prev.length === next.length && prev.every((p, i) => p.y === next[i].y && p.h === next[i].h && p.n === next[i].n) ? prev : next
    );

    const textLeft = dom.getBoundingClientRect().left + (parseFloat(getComputedStyle(dom).paddingLeft) || 0);
    const x = Math.round(textLeft - scrollerRect.left - 14);
    setGutterX((prev) => (prev === x ? prev : x));
  }, [editor, showLineNumbers]);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; measureGutter(); });
  }, [measureGutter]);

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

  useEffect(() => {
    lineNumberPrefs.enabled = showLineNumbers;
    try { localStorage.setItem('editor-line-numbers', showLineNumbers ? '1' : '0'); } catch {  }
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta('lineNumbers', showLineNumbers));
      editor.view.dom.setAttribute('data-code-linenumbers', showLineNumbers ? 'on' : 'off');
    }
    scheduleMeasure();
  }, [showLineNumbers, editor, scheduleMeasure]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  if (!editor) return null;

  const currentFontSize = editor.getAttributes('textStyle').fontSize || "default";

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
  const explicitFontSize = currentFontSize !== 'default' ? currentFontSize : '';
  const fontSizeLabel = explicitFontSize || cursorFontSize || '字号';
  const fontSizeValue = explicitFontSize || (FONT_SIZE_OPTIONS.includes(cursorFontSize) ? cursorFontSize : '__cursor__');

  const applyToolbarLanguage = (value: string) => {
    const language = value.trim().toLowerCase();
    editor.chain().focus().updateAttributes('codeBlock', { language: language || null }).run();
    setCustomLangDraft(null);
    if (onChange) onChange();
  };

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
    openLinkDialog();
  };

  const applyLink = () => {
    if (!linkDialog) return;
    const url = linkDialog.url.trim();
    setLinkDialog(null);
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(url);
    const isSiteRelative = /^(\/|\.\.?\/|#)/.test(url);
    const firstSegment = url.split('/')[0];
    const looksLikeHost = /\.[a-z]{2,}$/i.test(firstSegment) || /^localhost(:\d+)?$/i.test(firstSegment);
    const safeUrl = hasScheme || isSiteRelative
      ? url
      : (looksLikeHost || !url.includes('/')) ? `https://${url}` : `/${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: safeUrl }).run();
  };

  const Btn = ({ onClick, active, disabled, children, title }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-tip={title}
      aria-label={title}
      className={`p-2.5 max-lg:p-1 rounded-xl transition-all duration-300 ease-out flex items-center justify-center ${disabled ? 'opacity-30 cursor-default ' : ''}
        ${active ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/40 scale-110' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col h-full w-full min-h-0 bg-transparent relative">
      {
}

      {
}
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

      {
}
      <div className="shrink-0 px-8 py-2.5 border-y border-white/20 dark:border-white/10 flex flex-wrap items-center gap-1.5 bg-white/10 dark:bg-black/20 backdrop-blur-md z-50 max-lg:px-2 max-lg:py-1 max-lg:gap-1">
        <div className="flex items-center gap-1"><Btn onClick={() => editor.chain().focus().undo().run()} title="撤销 (Ctrl+Z)"><Undo2 size={16}/></Btn><Btn onClick={() => editor.chain().focus().redo().run()} title="重做 (Ctrl+Shift+Z)"><Redo2 size={16}/></Btn><Btn onClick={() => editor.chain().focus().unsetAllMarks().run()} title="清除格式（Ctrl+Shift+Backspace）"><RemoveFormatting size={16}/></Btn></div>
        <div className="w-px h-6 max-lg:h-4 bg-slate-400/20 mx-1 max-lg:mx-0.5" />

        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-xl px-2">
          {
}
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
          <Btn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="行内代码 (Ctrl+Shift+E)"><Code size={15} /></Btn>
                <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="代码块 (Ctrl+/)"><Code2 size={16}/></Btn>
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
          {
}
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
        <div className="flex items-center gap-1"><Btn onClick={() => toggleListKeepNumbers(editor, 'bulletList')} active={editor.isActive('bulletList')} title="无序列表 (Ctrl+Shift+8)"><List size={16}/></Btn><Btn onClick={() => toggleListKeepNumbers(editor, 'orderedList')} active={editor.isActive('orderedList')} title="有序列表 (Ctrl+Shift+7)"><ListOrdered size={16}/></Btn><Btn onClick={() => toggleListKeepNumbers(editor, 'taskList')} active={editor.isActive('taskList')} title="任务列表 (Ctrl+Shift+9)"><ListTodo size={16}/></Btn><Btn onClick={() => indentItemOnce(editor)} disabled={!editor.can().sinkListItem('listItem')} title="增加缩进 (Tab)"><IndentIncrease size={16}/></Btn><Btn onClick={() => editor.chain().focus().liftListItem('listItem').run()} disabled={!editor.can().liftListItem('listItem')} title="减少缩进 (Shift+Tab)"><IndentDecrease size={16}/></Btn><Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用 (Ctrl+\)"><Quote size={16}/></Btn></div>
        <div className="w-px h-6 max-lg:h-4 bg-slate-400/20 mx-1 max-lg:mx-0.5" />

        <div className="flex items-center gap-1">
          <Btn onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} title="上标（Ctrl+.）"><SupIcon size={16}/></Btn>
          <Btn onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} title="下标（Ctrl+,）"><SubIcon size={16}/></Btn>
          <Btn onClick={toggleLink} active={editor.isActive('link')} title="插入 / 编辑链接 (Ctrl+K)"><Link2 size={16}/></Btn>
          <Btn onClick={onOpenImageTool} title="插入图片（Ctrl+Alt+I）"><ImageIcon size={16} className="text-indigo-500"/></Btn>
          {
}
          <ImageEditButton editor={editor} />
        </div>

        {editor.isActive('image') && <div className="flex items-center gap-1 ml-4 bg-indigo-500/10 p-1 px-3 rounded-2xl border border-indigo-500/20 border-dashed animate-in slide-in-from-left">{['25%', '50%', '75%', '100%'].map(s => <button key={s} onClick={() => editor.chain().focus().updateAttributes('image', { width: s }).run()} title={"图片宽度 " + s} data-tip={"图片宽度 " + s} className="px-2 py-1 text-[9px] font-bold hover:bg-white rounded-lg transition-all">{s}</button>)}</div>}
        <div className="flex-1" />

        {editor.isActive('table') && <TableToolsBar editor={editor} />}

        <div className="flex items-center gap-4">
          <UnderlineColorButton editor={editor} />
          <div className="relative">
            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1.5 px-3 rounded-2xl border border-white/10 shadow-inner">
              {
}
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

      {showTextPicker && <CustomColorPicker activeColor="#6366F1" recentColors={textColors} onClose={() => setShowTextPicker(false)} onSelect={(c: string) => editor.chain().focus().setColor(c).run()} onConfirm={(c: string) => { if(!textColors.includes(c)) setTextColors(p => [c, ...p].slice(0, 6)); setShowTextPicker(false); }} />}
      {showHighlightPicker && <CustomColorPicker activeColor="#FEF08A" recentColors={highlightColors} onClose={() => setShowHighlightPicker(false)} onSelect={(c: string) => editor.chain().focus().setHighlight({ color: c }).run()} onConfirm={(c: string) => { if(!highlightColors.includes(c)) setHighlightColors(p => [c, ...p].slice(0, 6)); setShowHighlightPicker(false); }} />}

      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-8 pb-12 pl-1 pr-12 custom-scrollbar relative">
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


      {
}
      <LinkCardTool editor={editor} onEditLink={openLinkDialog} />

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
