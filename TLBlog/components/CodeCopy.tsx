"use client";


import { useEffect } from 'react';

const SELECTOR = '.prose pre, .resource-preview pre';
const SKIP_INSIDE = '.editor-content-area, [data-no-code-copy]';

const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11.5" height="11.5" rx="2.5"/><path d="M6.5 15.5h-1A1.5 1.5 0 0 1 4 14V4.5A1.5 1.5 0 0 1 5.5 3H15a1.5 1.5 0 0 1 1.5 1.5v1"/></svg>`;

const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6.5 9.2 17.3 4 12.1"/></svg>`;

const CHEVRON_DOWN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9.5 6 6 6-6"/></svg>`;

export const FOLD_AFTER = 10;
const FOLD_GAP = 12;

const LANG_NAMES: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  ruby: 'Ruby',
  rs: 'Rust',
  rust: 'Rust',
  go: 'Go',
  golang: 'Go',
  java: 'Java',
  kt: 'Kotlin',
  kotlin: 'Kotlin',
  swift: 'Swift',
  php: 'PHP',
  cs: 'C#',
  csharp: 'C#',
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  objc: 'Objective-C',
  lua: 'Lua',
  dart: 'Dart',
  scala: 'Scala',
  r: 'R',
  matlab: 'MATLAB',
  sh: 'Bash',
  bash: 'Bash',
  shell: 'Bash',
  zsh: 'Zsh',
  ps: 'PowerShell',
  ps1: 'PowerShell',
  powershell: 'PowerShell',
  cmd: 'Cmd',
  bat: 'Batch',
  batch: 'Batch',
  dos: 'DOS',
  html: 'HTML',
  xml: 'XML',
  svg: 'SVG',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  json: 'JSON',
  jsonc: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  ini: 'INI',
  conf: 'Conf',
  sql: 'SQL',
  graphql: 'GraphQL',
  md: 'Markdown',
  markdown: 'Markdown',
  tex: 'LaTeX',
  latex: 'LaTeX',
  diff: 'Diff',
  patch: 'Diff',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  makefile: 'Makefile',
  make: 'Makefile',
  nginx: 'Nginx',
  vim: 'Vim',
  vue: 'Vue',
  svelte: 'Svelte',
  arduino: 'Arduino',
  asm: 'Assembly',
  wasm: 'WASM',
  nix: 'Nix',
  groovy: 'Groovy',
  perl: 'Perl',
  pl: 'Perl',
  razor: 'Razor',
  cshtml: 'Razor',
  http: 'HTTP',
  properties: 'Properties',
  '1c': '1C',
};

const NO_LABEL = ['none', 'nohighlight', 'plain', 'plaintext', 'text', 'txt', 'hljs', 'null', 'undefined'];

export function prettyLang(raw: string): string {
  const key = raw.toLowerCase();
  if (key in LANG_NAMES) return LANG_NAMES[key];
  if (NO_LABEL.includes(key)) return '';
  return raw;
}

function explicitLang(code: Element): string {
  const el = code as HTMLElement;
  if (el.dataset.ccLang) return prettyLang(el.dataset.ccLang);
  if (el.dataset.ccDetected === '1') return '';
  const matched = (code.className || '').match(/language-([A-Za-z0-9_+#.\-]+)/);
  return matched ? prettyLang(matched[1]) : '';
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
}

function withTempNode<T extends HTMLElement>(node: T, extraStyle: string, select: (el: T) => void): boolean {
  document.querySelectorAll('[data-cc-temp]').forEach((stale) => stale.remove());

  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('data-cc-temp', '1');
  node.tabIndex = -1;
  node.style.cssText = [
    'position:fixed',
    'top:50%',
    'left:50%',
    'width:1px',
    'height:1px',
    'padding:0',
    'margin:0',
    'border:0',
    'outline:none',
    'box-shadow:none',
    'background:transparent',
    'color:transparent',
    'opacity:0.01',
    'z-index:-1',
    'overflow:hidden',
    'pointer-events:none',
    'font-size:16px',
    extraStyle,
  ]
    .filter(Boolean)
    .join(';');

  document.body.appendChild(node);

  const selection = window.getSelection();
  const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

  let ok = false;
  try {
    select(node);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  if (selection) {
    selection.removeAllRanges();
    if (savedRange) selection.addRange(savedRange);
  }
  window.setTimeout(() => {
    node.remove();
  }, 120);

  return ok;
}

function copyViaTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.readOnly = true;
  return withTempNode(ta, '', (el) => {
    el.focus({ preventScroll: true });
    el.select();
    if (typeof el.setSelectionRange === 'function') el.setSelectionRange(0, text.length);
  });
}

function copyViaContentEditable(text: string): boolean {
  const div = document.createElement('div');
  div.textContent = text;
  div.setAttribute('contenteditable', 'true');
  return withTempNode(div, 'white-space:pre', (el) => {
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
}

function legacyCopy(text: string): boolean {
  try {
    if (isIOS()) {
      return copyViaContentEditable(text) || copyViaTextarea(text);
    }
    return copyViaTextarea(text) || copyViaContentEditable(text);
  } catch {
    return false;
  }
}

type PywebviewBridge = {
  api?: { copy_to_clipboard?: (text: string) => Promise<boolean> | boolean };
};

function nativeCopy(text: string): Promise<boolean> | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { pywebview?: PywebviewBridge }).pywebview?.api;
  if (!api || typeof api.copy_to_clipboard !== 'function') return null;
  try {
    return Promise.resolve(api.copy_to_clipboard(text))
      .then((ok) => ok === true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

function browserCopy(text: string): Promise<boolean> {
  const canUseApi =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    typeof window !== 'undefined' &&
    window.isSecureContext;

  if (canUseApi) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}

export function copyToClipboard(text: string): Promise<boolean> {
  const native = nativeCopy(text);
  if (native) return native.then((ok) => (ok ? true : browserCopy(text)));
  return browserCopy(text);
}

export function createCopyBar(lang: string, getText: () => string): HTMLButtonElement {
  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'cc-bar';
  bar.setAttribute('aria-label', '复制代码');
  bar.setAttribute('contenteditable', 'false');

  if (lang) {
    const label = document.createElement('span');
    label.className = 'cc-lang';
    label.textContent = lang;
    bar.appendChild(label);
  }

  const icon = document.createElement('span');
  icon.className = 'cc-ic';
  icon.innerHTML = COPY_ICON;
  bar.appendChild(icon);

  let resetTimer = 0;

  bar.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.clearTimeout(resetTimer);

    const text = (getText() || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    void copyToClipboard(text).then((ok) => {
      bar.dataset.state = ok ? 'ok' : 'err';
      icon.innerHTML = ok ? CHECK_ICON : COPY_ICON;

      const tip = ok ? '已复制' : '复制失败';
      let label = bar.querySelector<HTMLElement>('.cc-lang');
      if (label) {
        if (!label.dataset.original) label.dataset.original = label.textContent || '';
        label.textContent = tip;
      } else {
        label = document.createElement('span');
        label.className = 'cc-lang';
        label.textContent = tip;
        bar.insertBefore(label, icon);
      }

      resetTimer = window.setTimeout(() => {
        bar.removeAttribute('data-state');
        icon.innerHTML = COPY_ICON;
        const current = bar.querySelector<HTMLElement>('.cc-lang');
        if (current) {
          if (current.dataset.original) current.textContent = current.dataset.original;
          else current.remove();
        }
      }, 1600);
    });
  });

  return bar;
}

function countLines(code: Element): number {
  const text = (code.textContent || '').replace(/\n+$/, '');
  return text ? text.split('\n').length : 0;
}

function usedLineHeight(cs: CSSStyleDeclaration): number {
  const fontSize = parseFloat(cs.fontSize) || 14;
  const raw = parseFloat(cs.lineHeight);
  if (!Number.isFinite(raw) || raw <= 0) return fontSize * 1.5;
  return raw < 4 ? fontSize * raw : raw;
}

function collapsedHeight(pre: HTMLPreElement, code: Element): number {
  const ps = getComputedStyle(pre);
  const cs = getComputedStyle(code);
  const line = Math.max(usedLineHeight(ps), usedLineHeight(cs));
  const top = parseFloat(ps.paddingTop) || 0;
  return Math.round(top + line * FOLD_AFTER + FOLD_GAP);
}

function createFoldBar(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cc-fold';
  btn.setAttribute('contenteditable', 'false');

  const label = document.createElement('span');
  label.className = 'cc-fold-text';
  const icon = document.createElement('span');
  icon.className = 'cc-ic';
  icon.innerHTML = CHEVRON_DOWN;
  btn.append(label, icon);
  return btn;
}

function attachGutter(wrap: HTMLElement, pre: HTMLPreElement, code: Element) {
  const text = (code.textContent || '').replace(/\n+$/, '');
  if (!text) return;
  const lines = text.split('\n');
  if (lines.length <= 1) return;

  const gutter = document.createElement('div');
  gutter.className = 'cc-lines';
  gutter.setAttribute('aria-hidden', 'true');

  const pieces: { start: number; node: Text }[] = [];
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    if (tn.length) {
      pieces.push({ start: acc, node: tn });
      acc += tn.length;
    }
  }
  if (!pieces.length) return;

  const locate = (index: number) => {
    for (let i = pieces.length - 1; i >= 0; i -= 1) {
      const p = pieces[i];
      if (index >= p.start) return { node: p.node, offset: Math.min(index - p.start, p.node.length) };
    }
    return { node: pieces[0].node, offset: 0 };
  };

  const ps = getComputedStyle(pre);
  const cs = getComputedStyle(code);
  const lineHeight = Math.max(usedLineHeight(ps), usedLineHeight(cs));
  const padTop = parseFloat(ps.paddingTop) || 0;

  const items = lines.map((_line, i) => {
    const item = document.createElement('span');
    item.textContent = String(i + 1);
    gutter.appendChild(item);
    return item;
  });

  wrap.appendChild(gutter);
  wrap.dataset.ccLines = '1';
  wrap.style.setProperty('--cc-line', `${lineHeight}px`);
  wrap.style.setProperty('--cc-top', `${padTop}px`);

  const place = () => {
    if (!wrap.isConnected) return;
    const wrapTop = wrap.getBoundingClientRect().top;
    let cursor = 0;
    let nextTop = padTop;

    lines.forEach((line, i) => {
      const item = items[i];
      if (!item) return;

      const at = locate(cursor);

      if (line.length && at.node.length) {
        const end = Math.min(at.offset + 1, at.node.length);
        if (end > at.offset) {
          const range = document.createRange();
          range.setStart(at.node, at.offset);
          range.setEnd(at.node, end);
          const rect = range.getBoundingClientRect();
          if (rect.height || rect.top) nextTop = rect.top - wrapTop;
        }
      }
      item.style.top = `${nextTop}px`;

      if (line.length) {
        const s = locate(cursor);
        const e = locate(cursor + line.length);
        let bottom = 0;
        try {
          const r = document.createRange();
          r.setStart(s.node, s.offset);
          r.setEnd(e.node, e.offset);
          bottom = r.getBoundingClientRect().bottom;
        } catch {
          bottom = 0;
        }
        nextTop = bottom ? bottom - wrapTop : nextTop + lineHeight;
      } else {
        nextTop += lineHeight;
      }

      cursor += line.length + 1;
    });
  };

  place();

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      place();
    });
  };

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(schedule).observe(code);
  }
  window.addEventListener('resize', schedule, { passive: true });
  if (document.fonts?.ready) void document.fonts.ready.then(schedule).catch(() => {});
}

export type CodeFold = { refresh: () => void; expand: () => void };

export function attachCodeFold(
  wrap: HTMLElement,
  pre: HTMLPreElement,
  code: Element,
  host: HTMLElement,
  startOpen = false
): CodeFold {
  let top: HTMLButtonElement | null = null;
  let fade: HTMLDivElement | null = null;
  let bottom: HTMLButtonElement | null = null;
  let open = false;

  const apply = () => {
    if (!top || !bottom) return;
    wrap.dataset.ccFold = open ? 'open' : 'closed';
    const text = open ? '收起' : '展开';
    for (const btn of [top, bottom]) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', `${text}代码块`);
      const label = btn.querySelector<HTMLElement>('.cc-fold-text');
      if (label) label.textContent = text;
    }

  };

  const toggle = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    open = !open;
    apply();
  };

  const measure = () => {
    const marks = wrap.querySelectorAll('.cc-lines > span');
    const next = marks[FOLD_AFTER] as HTMLElement | undefined;
    const raw = next && next.style.top ? parseFloat(next.style.top) : NaN;
    const nextTop = Number.isFinite(raw) && raw > FOLD_GAP ? raw : NaN;
    wrap.style.setProperty(
      '--cc-max',
      (Number.isFinite(nextTop) ? Math.round(nextTop + FOLD_GAP) : collapsedHeight(pre, code)) + 'px'
    );
    if (fade) {
      const ps = getComputedStyle(pre);
      fade.style.borderRadius = `0 0 ${ps.borderBottomRightRadius} ${ps.borderBottomLeftRadius}`;
    }
    const bg = getComputedStyle(pre).backgroundColor;
    const opaque = !!bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0(\.0+)?\)$/.test(bg);
    wrap.style.setProperty('--cc-bg', opaque ? bg : '#1e293b');
  };

  const mount = () => {
    top = createFoldBar();
    top.classList.add('cc-fold-top');
    bottom = createFoldBar();
    bottom.classList.add('cc-fold-bottom');
    fade = document.createElement('div');
    fade.className = 'cc-fade';
    fade.setAttribute('aria-hidden', 'true');

    measure();

    top.addEventListener('click', toggle);
    bottom.addEventListener('click', toggle);
    host.insertBefore(top, host.firstChild);
    wrap.append(fade, bottom);
    open = startOpen;
    apply();
  };

  const unmount = () => {
    top?.removeEventListener('click', toggle);
    bottom?.removeEventListener('click', toggle);
    top?.remove();
    bottom?.remove();
    fade?.remove();
    delete wrap.dataset.ccFold;
    wrap.style.removeProperty('--cc-max');
    top = null;
    bottom = null;
    fade = null;
    open = false;
  };

  let measuredLines = -1;

  return {
    refresh: () => {
      const total = countLines(code);
      const long = total > FOLD_AFTER;
      if (long && !top) {
        mount();
        measuredLines = total;
      } else if (!long && top) {
        unmount();
        measuredLines = -1;
      } else if (long && total !== measuredLines) {
        measuredLines = total;
        measure();
      }
    },
    expand: () => {
      if (top && !open) {
        open = true;
        apply();
      }
    },
  };
}

function enhance(pre: HTMLPreElement) {
  const code = pre.querySelector('code');
  if (!code) return;
  pre.dataset.ccReady = '1';

  const wrap = document.createElement('div');
  wrap.className = 'cc-wrap';
  pre.parentNode?.insertBefore(wrap, pre);
  wrap.appendChild(pre);

  attachGutter(wrap, pre, code);

  const actions = document.createElement('div');
  actions.className = 'cc-actions';
  wrap.appendChild(actions);
  actions.appendChild(createCopyBar(explicitLang(code), () => code.textContent || ''));
  attachCodeFold(wrap, pre, code, actions).refresh();
}

const STYLE = `
  .cc-wrap { position: relative; }
  .cc-wrap > pre[data-cc-ready] { padding-top: 2.75rem !important; }
  
  .cc-wrap[data-cc-lines="1"] > pre[data-cc-ready] { padding-left: 3.2rem !important; }
  
  .cc-wrap > pre[data-cc-ready],
  .cc-wrap > pre[data-cc-ready] > code {
    white-space: pre-wrap !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    overflow-x: hidden !important;
  }
  @media (hover: none) {
    .cc-wrap > pre[data-cc-ready] { padding-top: 3rem !important; }
  }
  .cc-bar {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    z-index: 5;
    display: inline-flex;
    align-items: center;
    gap: 0.36rem;
    max-width: calc(100% - 1.2rem);
    min-height: 1.8rem;
    padding: 0.3rem 0.6rem;
    border: 0;
    border-radius: 999px;
    
    background: rgba(17, 24, 39, 0.55);
    color: #e2e8f0;
    font-family: 'JetBrains Mono','Fira Code','Cascadia Code',Menlo,Consolas,ui-monospace,monospace;
    font-size: 0.7rem;
    font-weight: 500;
    line-height: 1;
    letter-spacing: 0.02em;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-user-drag: none;
    -webkit-touch-callout: none;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    opacity: 0.72;
    
    transition: opacity .2s ease, background-color .2s ease, color .2s ease, border-color .2s ease,
                transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .cc-wrap:hover .cc-bar { opacity: 1; }
  .cc-bar:hover,
  .cc-bar:focus-visible { background: rgba(17, 24, 39, 0.82); color: #ffffff; outline: none; }
  .cc-bar:active { background: rgba(17, 24, 39, 0.95); transform: scale(0.97); }
  @media (prefers-reduced-motion: reduce) {
    .cc-bar { transition: opacity .2s ease, background-color .2s ease, color .2s ease, border-color .2s ease; }
    .cc-bar:active { transform: none; }
  }
  .cc-bar .cc-lang { max-width: 9rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .cc-bar .cc-ic { display: inline-flex; width: 0.9rem; height: 0.9rem; flex: 0 0 auto; }
  .cc-bar .cc-ic svg { display: block; width: 100%; height: 100%; }
  .cc-bar[data-state="ok"] {
    color: #4ade80;
    border-color: rgba(74,222,128,0.45);
    background: rgba(74,222,128,0.14);
    opacity: 1;
  }
  .cc-bar[data-state="err"] {
    color: #fca5a5;
    border-color: rgba(248,113,113,0.45);
    background: rgba(248,113,113,0.14);
    opacity: 1;
  }
  
  @media (hover: none) {
    .cc-bar { opacity: 0.9; min-height: 2rem; padding: 0.35rem 0.65rem; }
    
    .cc-bar::after {
      content: '';
      position: absolute;
      top: -0.45rem;
      right: -0.4rem;
      bottom: -0.45rem;
      left: -0.4rem;
    }
  }
  @media (max-width: 520px) {
    .cc-bar { top: 0.45rem; right: 0.45rem; font-size: 0.66rem; }
    .cc-bar .cc-lang { max-width: 6.5rem; }
    .cc-bar .cc-ic { width: 0.85rem; height: 0.85rem; }
  }

  
  
  .cc-actions {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: calc(100% - 1.2rem);
  }
  
  .cc-actions > .cc-bar { position: static; top: auto; right: auto; }
  
  .cc-actions > .cc-bar { max-width: none; }
  
  .cc-actions > .cc-bar::after { display: none; }
  
  .cc-actions > .cc-bar,
  .cc-actions > .cc-fold { flex: 0 0 auto; }

  .cc-fold {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.7rem;
    padding: 0.28rem 0.72rem;
    border: 0;
    border-radius: 999px;
    background: rgba(17, 24, 39, 0.55);
    color: #e2e8f0;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1;
    letter-spacing: 0.03em;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-user-drag: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    box-shadow: 0 1px 1px rgba(0,0,0,0.12);
    opacity: 0.82;
    transition: opacity .2s ease, background-color .2s ease, color .2s ease, transform .18s ease, box-shadow .22s ease;
  }
  .cc-wrap:hover .cc-fold { opacity: 1; }
  .cc-fold:hover,
  .cc-fold:focus-visible {
    background: rgba(17, 24, 39, 0.82);
    color: #ffffff;
    outline: none;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.26);
  }
  .cc-fold:active { background: rgba(17, 24, 39, 0.95); transform: translateY(0) scale(0.97); }
  .cc-fold .cc-ic {
    display: inline-flex;
    width: 0.8rem;
    height: 0.8rem;
    flex: 0 0 auto;
    transition: transform .28s cubic-bezier(.22,1,.36,1);
  }
  .cc-fold .cc-ic svg { display: block; width: 100%; height: 100%; }
  
  .cc-wrap[data-cc-fold="open"] .cc-fold .cc-ic { transform: rotate(180deg); }

  
  .cc-wrap[data-cc-fold="closed"] > pre {
    max-height: var(--cc-max, 22rem);
    overflow-x: auto;
    overflow-y: hidden;
  }

  
  .cc-lines {
    position: absolute;
    
    top: 0;
    left: 0;
    width: 3.2rem;
    z-index: 1;
    font-family: ui-monospace, 'JetBrains Mono', 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: var(--cc-line, 1.5);
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.64);
    -webkit-user-select: none;
    user-select: none;
    pointer-events: none;
  }
  .cc-lines > span { position: absolute; right: 0.8rem; }
  
  .cc-wrap[data-cc-fold="closed"] > .cc-lines {
    
    height: var(--cc-max, 22rem);
    overflow: hidden;
  }
  .cc-wrap[data-cc-fold="closed"] > .cc-lines > span:nth-child(n + 11) { display: none; }

  .cc-fade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4.2rem;
    z-index: 2;
    display: none;
    pointer-events: none;
    
    background: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 46%, #000 100%);
  }
  
  .cc-wrap[data-cc-fold="closed"] > .cc-fade { display: block; }

  .cc-wrap > .cc-fold-bottom {
    display: none;
    width: fit-content;
  }
  .cc-wrap[data-cc-fold="closed"] > .cc-fold-bottom {
    display: flex;
    position: absolute;
    
    left: 0;
    right: 0;
    bottom: 0.4rem;
    margin: 0 auto;
    width: fit-content;
    z-index: 3;
    opacity: 0.95;
  }
  
  .cc-wrap > .cc-fold-bottom {
    background: rgba(99, 102, 241, 0.18);
    border: 1px solid #6366f1;
    color: #c7d2fe;
    box-shadow: 0 2px 10px rgba(79, 70, 229, 0.22);
  }
  .cc-wrap[data-cc-fold="open"] > .cc-fold-bottom { color: #4f46e5; }
  .dark .cc-wrap[data-cc-fold="open"] > .cc-fold-bottom { color: #c7d2fe; }
  .cc-wrap > .cc-fold-bottom:hover,
  .cc-wrap > .cc-fold-bottom:focus-visible {
    background: rgba(99, 102, 241, 0.32);
    border-color: #818cf8;
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
  }
  .cc-wrap[data-cc-fold="open"] > .cc-fold-bottom {
    display: flex;
    position: static;
    left: auto;
    right: auto;
    transform: none;
    margin: 0.75rem auto 0.15rem;
  }

  @media (hover: none) {
    .cc-fold { opacity: 0.9; min-height: 2rem; padding: 0.35rem 0.6rem; }
  }
  @media (max-width: 520px) {
    .cc-actions { top: 0.45rem; right: 0.45rem; gap: 0.3rem; }
    .cc-fold { font-size: 0.66rem; padding: 0.28rem 0.5rem; }
  }
`;

export default function CodeCopy() {
  useEffect(() => {
    let frame = 0;
    const enhanceAll = () => {
      frame = 0;
      const blocks = document.querySelectorAll<HTMLPreElement>(SELECTOR);
      blocks.forEach((pre) => {
        if (pre.dataset.ccReady === '1') return;
        if (pre.closest(SKIP_INSIDE)) return;
        enhance(pre);
      });
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(enhanceAll);
    };

    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: STYLE }} />;
}