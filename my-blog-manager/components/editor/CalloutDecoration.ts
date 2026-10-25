import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { CALLOUT_ICONS, CALLOUT_DEFAULT_ICON } from '../../lib/rehypeCallout';
import { CALLOUT_TYPES, CALLOUT_MARKER } from './calloutBridge';


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
              if (!match) return true;

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

              const titleStart = pos + 2;
              const markerEnd = titleStart + match[0].length;

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