import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { CALLOUT_ICONS, CALLOUT_DEFAULT_ICON } from '../../lib/rehypeCallout';
import { CALLOUT_TYPES, CALLOUT_MARKER } from './calloutBridge';

/**
 * 编辑器里的 Callout 外观（Obsidian 的 > [!note] 标题）。
 *
 * 只加**装饰**，不动文档结构也不动文本：
 *   - 引用块上挂 class="callout callout-<type>"（画框）
 *   - 第一个段落上挂 class="callout-title"（画标题行底色）
 *   - 标题行最前面塞一个图标（和预览/前台同一个 SVG）
 *   - 标题里那段 `[!type]` 标记默认藏起来 —— 预览里本来就不显示它，
 *     藏着编辑器才和预览长得一样；光标进到这一行时再露出来（跟 Obsidian 一个脾气），
 *     那会儿就能直接改类型字母 ✓
 * 文档里那段文字**始终是真实文本**，保存时照旧按 `> [!info] 标题` 写回 .md。
 */

const calloutKey = new PluginKey('calloutDecoration');

export const CalloutDecoration = Extension.create({
  name: 'calloutDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: calloutKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const { from, to } = state.selection;

            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'blockquote') return true;

              const first = node.firstChild;
              if (!first || first.type.name !== 'paragraph') return true;

              const text = first.textContent || '';
              const match = text.match(CALLOUT_MARKER);
              if (!match) return true; // 普通引用：一个字都不碰

              const kind = match[1].toLowerCase();
              if (!CALLOUT_TYPES.includes(kind)) return true;

              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: `callout callout-${kind}`,
                  'data-callout': kind,
                })
              );
              decorations.push(
                Decoration.node(pos + 1, pos + 1 + first.nodeSize, {
                  class: 'callout-title',
                })
              );

              // 标题行内容从 pos + 2 开始（blockquote 起点 +1，段落起点再 +1）
              const titleStart = pos + 2;
              const markerEnd = titleStart + match[0].length;

              // 光标不在标题这一行 → 藏掉 [!type]，前面补个图标（= 预览的样子）
              const cursorInTitle = from >= titleStart - 1 && to <= titleStart + first.content.size;
              if (!cursorInTitle) {
                if (markerEnd > titleStart) {
                  decorations.push(
                    Decoration.inline(titleStart, markerEnd, { class: 'callout-marker-hidden' })
                  );
                }
                decorations.push(
                  Decoration.widget(
                    titleStart,
                    () => {
                      const el = document.createElement('span');
                      el.className = 'callout-icon';
                      el.setAttribute('aria-hidden', 'true');
                      el.innerHTML = CALLOUT_ICONS[kind] || CALLOUT_DEFAULT_ICON;
                      return el;
                    },
                    { side: -100, ignoreSelection: true, key: `icon-${kind}-${titleStart}` }
                  )
                );
              }

              return true;
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
