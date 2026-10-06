"use client";
import { useEffect } from 'react';
import { installAdminKeyFetch } from '../lib/adminKey';

/**
 * 🔑 尽早装上「给后端请求自动加管理密钥」的 fetch 包装。
 *
 * ⚠️ 必须在**模块加载时**就装，不能只放在 useEffect 里 ——
 *    控制台里很多组件是"一挂载就发请求"，那可能比 layout 的 effect 还早，
 *    晚装一步就会漏掉几个没带钥匙的请求（表现为个别面板报 401）。
 *    模块级这行在客户端 chunk 一加载就执行，抢在所有页面代码之前。
 */
if (typeof window !== 'undefined') {
  installAdminKeyFetch();
}

export default function ApiKeyInjector() {
  // 兜底再装一次（installAdminKeyFetch 是幂等的，重复调用无害）
  useEffect(() => {
    installAdminKeyFetch();
  }, []);
  return null;
}
