"use client";

import { useEffect } from 'react';

/**
 * 🖱️ 触摸设备上彻底关掉「悬停态」（用户 2026-10-22 要求）
 *
 * 现象：手机上点一个链接跳走、再返回，那条链接一直保持悬停样式
 *       （下划线变实线 + 下移），必须点一下别处才恢复 ✗
 *
 * 为什么不能直接"清掉 :hover"：
 *   :hover 是浏览器内部的指针状态，**没有任何 JS API 能清除它** ✗
 *   （element.blur() 清的是 :focus，跟 :hover 是两个东西）
 *
 * 所以做法是：**一旦这台设备用过触摸，就把 <html> 挂上 .force-unhover**，
 *   由 CSS 把链接按普通态画（没有 :hover 那一套）✓ 触屏本来也没有"悬停"这回事 ✓
 *
 * 为什么之前那版手机上没效果（两个坑，都踩过）：
 *   ① iOS Safari 的 click 事件是 MouseEvent，**没有 pointerType**、
 *      也没有 sourceCapabilities → "是不是触摸"判断永远为假 ✗
 *      → 现在改用 touchstart / pointerdown(pointerType=touch|pen) 记录"最近发生过触摸" ✓
 *   ② 有些手机浏览器（开"桌面版网站"、三星浏览器等）会报告 `hover: hover`，
 *      纯 CSS 的 `@media (hover: none)` 不命中 ✗
 *      → 现在不靠 media query 判断，而是运行时真的观察到触摸 ✓
 *
 * 记在 localStorage 里：返回上一页、整页刷新、重开标签页都还生效 ✓
 * 什么时候恢复（有鼠标的设备）：真的收到 pointerType === 'mouse' 的 pointermove 才摘掉 ✓
 *   （不监听 mousemove：Safari 触摸后会补发兼容鼠标事件，会把状态误摘 ✗）
 */
const CLASS = 'force-unhover';
const STORAGE_KEY = 'xh-force-unhover';

export default function ClickUnhover() {
  useEffect(() => {
    const root = document.documentElement;

    const apply = (on: boolean) => {
      root.classList.toggle(CLASS, on);
      try {
        if (on) localStorage.setItem(STORAGE_KEY, '1');
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* 隐私模式禁写 localStorage 也不影响本次页面 */
      }
    };

    // 之前用过触摸 → 这次打开就直接按触摸设备处理（返回/刷新都有效）
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') apply(true);
    } catch {
      /* 忽略 */
    }

    let lastTouchAt = 0;

    const markTouch = () => {
      lastTouchAt = Date.now();
      apply(true);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') markTouch();
    };

    const onTouchStart = () => markTouch();

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLElement | null;
      if (!anchor) return;

      const pointerType = (event as MouseEvent & { pointerType?: string }).pointerType;
      const byTouch =
        pointerType === 'touch' ||
        pointerType === 'pen' ||
        Date.now() - lastTouchAt < 1000;   // ← iOS Safari 没有 pointerType，靠这一条兜住
      if (!byTouch) return;

      anchor.blur();   // 顺手清掉焦点态（iOS 点链接会留焦点）
      apply(true);
    };

    const onPointerMove = (event: PointerEvent) => {
      // 只有真的在用鼠标 → 才恢复正常 hover（触摸的 pointermove 是 pointerType === 'touch'）
      if (event.pointerType === 'mouse') apply(false);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('click', onClick, true);
    window.addEventListener('pointermove', onPointerMove, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('pointermove', onPointerMove, true);
    };
  }, []);

  return null;
}
