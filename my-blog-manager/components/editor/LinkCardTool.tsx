"use client";


import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { parseRepoLink, type RepoCardData } from '../../lib/repoCard';
import { buildCard, fetchCard } from '../RepoCard';

type Anchor = { left: number; top: number; bottom: number; right: number };

export default function LinkCardTool({ editor, onEditLink }: { editor: Editor | null; onEditLink: () => void }) {
  const [link, setLink] = useState<{ url: string } | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [card, setCard] = useState<{ data: RepoCardData; left: number; top: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef(false);

  const readSelection = useCallback((): { href: string; a: Anchor } | null => {
    if (!editor || editor.isDestroyed) return null;
    const host = editor.view.dom as HTMLElement;
    if (!host.clientWidth || !host.clientHeight) return null;
    if (!editor.isActive('link')) return null;
    const href = String(editor.getAttributes('link').href || '');
    if (!href) return null;
    try {
      const { from, to } = editor.state.selection;
      const s = editor.view.coordsAtPos(from);
      const e = to > from ? editor.view.coordsAtPos(to) : s;
      if (!Number.isFinite(s.left) || !Number.isFinite(s.top) || (s.left === 0 && s.top === 0)) return null;
      return { href, a: { left: s.left, top: s.top, bottom: e.bottom, right: e.right } };
    } catch {
      return null;
    }
  }, [editor]);

  const sync = useCallback(() => {
    const hit = readSelection();
    if (!hit) {
      setLink(null);
      setAnchor(null);
      setCard(null);
      return;
    }
    const parsed = parseRepoLink(hit.href);
    if (!parsed) {
      setLink(null);
      setAnchor(null);
      setCard(null);
      return;
    }
    setLink({ url: parsed.url });
    setAnchor(hit.a);
  }, [readSelection]);

  useEffect(() => {
    if (!editor) return;
    const onTx = () => sync();
    editor.on('transaction', onTx);
    editor.on('selectionUpdate', onTx);
    const onScroll = () => { keepRef.current = true; sync(); keepRef.current = false; };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    sync();
    return () => {
      editor.off('transaction', onTx);
      editor.off('selectionUpdate', onTx);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [editor, sync]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom as HTMLElement;
    const ro = new ResizeObserver(() => {
      if (!dom.clientWidth || !dom.clientHeight) {
        setLink(null);
        setAnchor(null);
        setCard(null);
      } else {
        sync();
      }
    });
    ro.observe(dom);
    return () => ro.disconnect();
  }, [editor, sync]);

  useEffect(() => {
    if (!card) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (keepRef.current) return;
      if (t && (t.closest('[data-repo-card-scope]') || t.closest('[data-link-card-pill]'))) return;
      setCard(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCard(null); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [card]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren(card ? buildCard(card.data) : document.createTextNode(''));
  }, [card]);

  const toggleCard = async () => {
    if (card) { setCard(null); return; }
    if (!link || !anchor) return;
    keepRef.current = true;
    setLoading(true);
    const data = await fetchCard(link.url);
    setLoading(false);
    keepRef.current = false;
    if (!data) return;
    setCard({ data, left: anchor.left, top: anchor.bottom + 8 });
  };

  if (typeof document === 'undefined') return null;
  if (!editor || !link || !anchor) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const compact = vw < 640;
  const btn = compact ? 34 : 28;

  const pillStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(anchor.right + 8, vw - (btn * 2 + 18))),
    top: Math.max(8, Math.min(anchor.top - 2, vh - 44)),
    zIndex: 9998,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: 3,
    borderRadius: 999,
  };

  const cardW = Math.min(340, vw - 16);
  const cardBoxStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(card ? card.left : anchor.left, vw - cardW - 8)),
    top: Math.max(8, Math.min(card ? card.top : anchor.bottom + 8, vh - 120)),
    width: cardW,
    zIndex: 9997,
  };

  return createPortal(
    <>
      <style>{PILL_STYLE}</style>

      <span data-link-card-pill className="link-card-pill" style={pillStyle}>
        <button
          type="button"
          className="link-card-btn"
          style={{ height: btn, minWidth: compact ? 64 : 58 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleCard}
          title=""
          aria-label="查看链接卡片"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />
          </svg>
          <span>{loading ? '读取…' : card ? '收起' : '卡片'}</span>
        </button>
        <button
          type="button"
          className="link-card-btn"
          style={{ height: btn, minWidth: btn }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setCard(null); onEditLink(); }}
          aria-label="编辑链接"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </span>

      {
}
      {card && (
        <div data-repo-card-scope style={cardBoxStyle}>
          <div ref={hostRef} />
        </div>
      )}
    </>,
    document.body,
  );
}

const PILL_STYLE = `
  .link-card-pill {
    background: rgba(99, 102, 241, 0.16);
    border: 1px solid rgba(99, 102, 241, 0.55);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(6px);
  }
  .link-card-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 4px;
    padding: 0 8px; border-radius: 999px;
    font-size: .72rem; font-weight: 800; line-height: 1;
    color: #4f46e5; background: transparent; border: 0; cursor: pointer;
    transition: background-color .15s ease, color .15s ease;
  }
  .link-card-btn:hover { background: rgba(99, 102, 241, 0.22); }
  .dark .link-card-pill { background: rgba(129, 140, 248, 0.18); border-color: rgba(129, 140, 248, 0.5); }
  .dark .link-card-btn { color: #c7d2fe; }
  .dark .link-card-btn:hover { background: rgba(129, 140, 248, 0.26); }
`;