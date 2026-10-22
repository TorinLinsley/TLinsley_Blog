"use client";

import { useEffect } from 'react';

/**
 * 🖱️ 点完链接立刻把「悬停态」按普通态画（用户 2026-10-22 要求）
 *
 * 背景：手机上点一个链接跳走、再返回，那条链接会一直保持悬停样式
 *       （下划线变实线 + 下移），必须点一下别处才恢复 ✗
 *       原因：触摸没有"移开"这个动作，浏览器把最后点过的元素一直当成 :hover ✗
 *
 * 为什么不能直接"清掉 :hover"：
 *   :hover 是浏览器内部的指针状态，**没有任何 JS API 能清除它** ✗
 *   （element.blur() 清的是 :focus，跟 :hover 是两个东西）
 *
 * 所以用等效做法：点击的那一刻给 <html> 挂一个 .force-unhover，
 *   由 CSS 把"悬停样式"强制画成普通样式 ✓ 视觉上等于当场取消了悬停 ✓
 * 什么时候摘掉：
 *   · 下一次 pointerdown（别人要开始新交互了）→ 先摘掉，避免影响新点击 ✓
 *   · 鼠标一动（pointermove）→ 说明有指针在移动，交给正常的 :hover 逻辑 ✓
 *
 * ⚠️ 只处理**触摸/手写笔**产生的点击 ✓
 *    鼠标点击不用管：鼠标本来就会"移开"，而且按钮/链接的焦点态已经交给 :focus-visible 了
 * ⚠️ 只在组件挂载时挂一次全局监听，卸载时摘干净 ✓
 */
export default function ClickUnhover() {
  useEffect(() => {
    const root = document.documentElement;

    const clear = () => root.classList.remove('force-unhover');

    const onPointerDown = () => clear();

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLElement | null;
      if (!anchor) return;

      /* 只有触摸/笔才需要：鼠标点击本来就会随指针移开自动恢复 */
      const ev = event as MouseEvent & {
        pointerType?: string;
        sourceCapabilities?: { firesTouchEvents?: boolean };
      };
      const byTouch =
        ev.pointerType === 'touch' ||
        ev.pointerType === 'pen' ||
        ev.sourceCapabilities?.firesTouchEvents === true;
      if (!byTouch) return;

      anchor.blur();                 // 顺手把焦点态也清掉（iOS 上点链接会留焦点）
      root.classList.add('force-unhover');
    };

    const onPointerMove = () => clear();

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('pointermove', onPointerMove, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      root.classList.remove('force-unhover');
    };
  }, []);

  return null;
}
