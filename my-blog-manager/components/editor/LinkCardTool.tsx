"use client";

/**
 * 🔗 编辑器里的「链接卡片浮层」（桌面 / 手机同一套，**完全不依赖悬停**）。
 *
 * ── 为什么是浮层，而不是插在链接下面的一行 ──────────────────────
 * 编辑器里同一块东西不能同时承担两个点击语义（"点它展开" vs "点它跳转"）。
 * 所以这里把职责拆开：
 *   · 链接文字 = 普通文本，照常编辑、照常选中，**点它只是把光标放进去**；
 *   · 光标落进链接后，旁边浮出一个小胶囊：[</> 卡片] [✎ 编辑]；
 *       - 「卡片」→ 在链接下方浮出卡片（点卡片 = 新标签页跳转）
 *       - 「编辑」→ 打开编辑器原有的链接弹窗（和 Ctrl+L 同一个）
 *   · 再点一次胶囊 / 点别处 / Esc → 收起。
 *
 * 浮层挂在 body 下（Portal），**不在编辑器 DOM 里**：
 *   · ProseMirror 看不到它，不会被当成文档内容，也不会被下一个 transaction 清掉；
 *   · 它不占文档流，所以**左侧行号一行都不用改**（插一行到文档里就得给行号开特例，
 *     那正是最容易把行号搞坏的地方）；
 *   · 展开/收起不推挤正文，滚动位置不会跳。
 *
 * 📱 手机上没有任何悬停：手指点进链接 → 胶囊出现 → 点「卡片」→ 点卡片跳转，
 *    全过程都是"点"，和桌面同一套逻辑。按钮在窄屏会放大到 34px 便于点按。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { parseRepoLink, type RepoCardData } from '../../lib/repoCard';
import { buildCard, fetchCard } from '../RepoCard';

type Anchor = { left: number; top: number; bottom: number; right: number };

export default function LinkCardTool({ editor, onEditLink }: { editor: Editor | null; onEditLink: () => void }) {
  /** 光标所在链接（不是仓库/主页链接时为 null） */
  const [link, setLink] = useState<{ url: string } | null>(null);
  /** 胶囊位置（视口坐标） */
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  /** 展开的卡片：数据 + 挂载位置 */
  const [card, setCard] = useState<{ data: RepoCardData; left: number; top: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  /** 防止"点了卡片"被当成"点了外面"而立刻收起 */
  const keepRef = useRef(false);

  /** 读当前选区：光标在链接里就返回 href + 坐标，否则返回 null */
  const readSelection = useCallback((): { href: string; a: Anchor } | null => {
    if (!editor || editor.isDestroyed) return null;
    // ⛔ 编辑器被藏起来时（控制台资源页默认就是预览态、外层 display:none）一律不认：
    //    隐藏元素上 coordsAtPos 会返回 0，胶囊会被钳到**页面左上角**去（实测踩过 ——
    //    表现就是"我根本没进编辑模式，左上角却挂着一个「卡片」按钮"）。
    //    这一条必须放在 readSelection 里，光靠下面那个尺寸观察器拦不全：
    //    隐藏状态下任何一次 transaction 都会再调一次 sync，又把胶囊放回去。
    const host = editor.view.dom as HTMLElement;
    if (!host.clientWidth || !host.clientHeight) return null;
    if (!editor.isActive('link')) return null;
    const href = String(editor.getAttributes('link').href || '');
    if (!href) return null;
    try {
      const { from, to } = editor.state.selection;
      const s = editor.view.coordsAtPos(from);
      const e = to > from ? editor.view.coordsAtPos(to) : s;
      // 坐标不可信（0 或 NaN）也不显示，免得又飘到左上角
      if (!Number.isFinite(s.left) || !Number.isFinite(s.top) || (s.left === 0 && s.top === 0)) return null;
      return { href, a: { left: s.left, top: s.top, bottom: e.bottom, right: e.right } };
    } catch {
      return null;   // 拿不到坐标（编辑器还没布局）就先不显示
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
    if (!parsed) {                    // 普通链接：不显示胶囊，也不显示卡片
      setLink(null);
      setAnchor(null);
      setCard(null);
      return;
    }
    setLink({ url: parsed.url });
    setAnchor(hit.a);
  }, [readSelection]);

  // 光标一动就重新判断；滚动/改窗口大小要重新算位置
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

  // ⚠️ 切到「预览态」时，编辑器外层只是被 display:none 藏起来，**光标还在链接里**，
  //    而且这种切换不产生任何 transaction / selectionUpdate —— 光靠上面那两个事件，
  //    胶囊会**残留在预览页面上**（实测踩过）。
  //    所以再盯一下编辑器自身的尺寸：一旦归零（被藏起来）就全部收起，切回编辑再重新判断。
  //    行号那边判断"预览态"用的也是同一个信号，所以这条一定可靠。
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

  // 点别处 / Esc 收起卡片（手机上必须靠"点外面"收起，没有 Esc）
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

  // 把卡片 DOM 塞进浮层容器（卡片是 imperative 造的，和读态共用同一个 buildCard）
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren(card ? buildCard(card.data) : document.createTextNode(''));
  }, [card]);

  const toggleCard = async () => {
    if (card) { setCard(null); return; }
    if (!link || !anchor) return;
    keepRef.current = true;           // 这一下点击不算"点外面"
    setLoading(true);
    const data = await fetchCard(link.url);
    setLoading(false);
    keepRef.current = false;
    if (!data) return;                // 抓不到就什么都不显示，链接文字照旧可编辑
    setCard({ data, left: anchor.left, top: anchor.bottom + 8 });
  };

  if (typeof document === 'undefined') return null;
  if (!editor || !link || !anchor) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 手机/窄屏按钮做大一点，便于手指点
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

  // 卡片宽度：窄屏贴边但不能出界，右边留 8px 边距
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

      {/* 胶囊：只有光标在「仓库/主页链接」里时才出现 */}
      <span data-link-card-pill className="link-card-pill" style={pillStyle}>
        <button
          type="button"
          className="link-card-btn"
          style={{ height: btn, minWidth: compact ? 64 : 58 }}
          onMouseDown={(e) => e.preventDefault()}      // 别抢走编辑器焦点
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

      {/* 卡片浮层：data-repo-card-scope 是和 CARD_STYLE 约定的作用域名（见 RepoCard.tsx），
          卡片挂在 body 下、不在 .prose/.resource-preview 里，靠这个作用域才吃得到样式 */}
      {card && (
        <div data-repo-card-scope style={cardBoxStyle}>
          <div ref={hostRef} />
        </div>
      )}
    </>,
    document.body,
  );
}

/**
 * 胶囊自己的样式（卡片样式在 RepoCard 的 CARD_STYLE 里，两边共用）。
 * 配色跟编辑器工具栏一致；深浅色都够对比度。
 */
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
