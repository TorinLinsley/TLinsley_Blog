/**
 * 🔌 后端地址 + 读数据的公共小工具。
 *
 * 后端端口写在 `public/backend_config.json` 里（控制台窗口模式和纯网页模式都是这个约定），
 * 主机名跟着当前页面走 —— 所以本地、SSH 隧道、局域网/内网穿透访问都能用同一套代码。
 */

/** 拿到后端基地址，如 `http://127.0.0.1:7646` */
export async function getApiBase(): Promise<string> {
  const res = await fetch(`/backend_config.json?t=${Date.now()}`, { cache: 'no-store' });
  const cfg = await res.json();
  const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  return `http://${host}:${cfg.api_port}`;
}

/**
 * 读后端数据（GET）。
 * 失败（后端没起来 / 老版本没这个接口 / 网络异常）一律返回 null，由调用方决定怎么兜底 ——
 * 这类调用**永远不该把页面搞崩**，拿不到就先用页面里那份编译进去的数据。
 */
export async function fetchBackend<T>(path: string): Promise<T | null> {
  try {
    const base = await getApiBase();
    const res = await fetch(`${base}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
