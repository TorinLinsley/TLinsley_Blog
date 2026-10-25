"use client";


import { useEffect } from 'react';

const SCOPE = '.prose, .resource-preview';
const SKIP_INSIDE = '.editor-content-area';

const MARKER = /^\s*\[!\s*([A-Za-z0-9_-]+)\s*\]\s*([-+]?)\s*([\s\S]*)$/;

const wrap = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<string, string> = {
  note: wrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/>'),
  tip: wrap('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z"/>'),
  hint: wrap('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z"/>'),
  success: wrap('<path d="M20 6 9 17l-5-5"/>'),
  check: wrap('<path d="M20 6 9 17l-5-5"/>'),
  done: wrap('<path d="M20 6 9 17l-5-5"/>'),
  warning: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  caution: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  attention: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  danger: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  error: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  failure: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  bug: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>'),
  question: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  help: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  faq: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  quote: wrap('<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M15 7h2v4a4 4 0 0 1-4 4"/>'),
  cite: wrap('<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M15 7h2v4a4 4 0 0 1-4 4"/>'),
  example: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  abstract: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  summary: wrap('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  todo: wrap('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>'),
};

const DEFAULT_ICON = ICONS.note;

function convert(blockquote: HTMLElement) {
  if (blockquote.dataset.calloutReady === '1') return;
  if (blockquote.classList.contains('callout')) return;

  const first = Array.from(blockquote.children).find((el) => el.tagName === 'P') as HTMLElement | undefined;
  if (!first) return;

  const match = (first.textContent || '').match(MARKER);
  if (!match) return;

  const type = match[1].toLowerCase();
  const title = (match[3] || '').trim() || type.charAt(0).toUpperCase() + type.slice(1);

  blockquote.dataset.calloutReady = '1';

  const box = document.createElement('div');
  box.className = `callout callout-${type} not-prose`;
  box.setAttribute('data-callout', type);

  const titleRow = document.createElement('div');
  titleRow.className = 'callout-title';
  const icon = document.createElement('span');
  icon.className = 'callout-icon';
  icon.innerHTML = ICONS[type] || DEFAULT_ICON;
  const titleText = document.createElement('span');
  titleText.className = 'callout-title-text';
  titleText.textContent = title;
  titleRow.append(icon, titleText);

  const body = document.createElement('div');
  body.className = 'callout-body';
  Array.from(blockquote.children).forEach((child) => {
    if (child !== first) body.appendChild(child);
  });

  box.appendChild(titleRow);
  if (body.childNodes.length) box.appendChild(body);
  blockquote.replaceWith(box);
}

export default function CalloutRender() {
  useEffect(() => {
    const attach = () => {
      document.querySelectorAll<HTMLElement>(SCOPE).forEach((scope) => {
        if (scope.closest(SKIP_INSIDE)) return;
        scope.querySelectorAll<HTMLElement>('blockquote').forEach((bq) => {
          if (bq.closest(SKIP_INSIDE)) return;
          convert(bq);
        });
      });
    };

    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          attach();
        });
      }
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}