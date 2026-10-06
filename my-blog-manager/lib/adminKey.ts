/**
 * 🔑 给「后端 API」的请求自动带上管理密钥（X-Admin-Key）。
 *
 * 背景：后端（cms_core）能直接改博客的文件，原先**零鉴权**，只靠"绑在 127.0.0.1"。
 * 加了密钥之后，所有 /api/* 都要带 `X-Admin-Key`。
 *
 * 为什么用"统一包装 window.fetch"而不是去改那几十处 fetch 调用：
 *   · 控制台里有 30+ 处 `fetch(\`http://${host}:${port}/api/...\`)`，逐个改容易漏
 *   · 以后新写的调用点也会自动带上钥匙 —— 不会再有人忘了这件事
 *
 * ⚠️ 两个必须自愈的场景（不然控制台会整片 401 打不开）：
 *   ① 启动竞态：启动脚本 `Start-Console.bat` / `start-console-web.sh` 会**整个覆盖**
 *      backend_config.json（只写 api_port），钥匙要等后端启动时才补回去。
 *      前端如果抢在后端之前发请求，就会读到一个"没有钥匙"的配置。
 *   ② 钥匙轮换：`.admin_key` 被删掉后后端会重新生成，旧钥匙立刻失效。
 *   对策：**只缓存带钥匙的配置**；任何一次 401 都丢掉缓存重读一次并重试。
 */

const KEY_HEADER = 'X-Admin-Key';

type BackendCfg = { api_port?: number; admin_key?: string };

let installed = false;
let cfgCache: BackendCfg | null = null;          // 只存"读到过钥匙"的那份
let cfgInflight: Promise<BackendCfg> | null = null;

function fetchCfg(): Promise<BackendCfg> {
  if (cfgCache) return Promise.resolve(cfgCache);
  if (!cfgInflight) {
    cfgInflight = fetch(`/backend_config.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<BackendCfg>)
      .catch(() => ({} as BackendCfg))
      .then((cfg) => {
        cfgInflight = null;
        // 没钥匙就不缓存 —— 说明后端还没把钥匙写进来（或鉴权没开），
        // 下次请求重新读，等它写好了自然就带上了 ✓
        if (cfg && cfg.admin_key) cfgCache = cfg;
        return cfg;
      });
  }
  return cfgInflight;
}

/** 复制一份 headers 并塞进钥匙（不修改原对象） */
function withKey(init: RequestInit | undefined, key: string): RequestInit {
  const headers = new Headers(init?.headers || undefined);
  headers.set(KEY_HEADER, key);
  return { ...(init || {}), headers };
}

/** 只认「绝对地址 + /api/」——后端调用正好全长这样；
 *  这样 /backend_config.json、图床、Gemini 这些请求一律不碰。 */
const isBackendApi = (url: string) => /^https?:\/\/[^/]+\/api\//i.test(url);

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

export function installAdminKeyFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const orig = window.fetch.bind(window);

  const send = (input: RequestInfo | URL, init: RequestInit | undefined, key: string) => {
    if (typeof input === 'string' || input instanceof URL) {
      return orig(urlOf(input), withKey(init, key));
    }
    // Request 对象：头已经封在对象里了，只能按原样重建一个
    const req = input as Request;
    const headers = new Headers(req.headers);
    headers.set(KEY_HEADER, key);
    return orig(new Request(req, { headers }), init);
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const url = urlOf(input);
      if (!isBackendApi(url)) return orig(input as RequestInfo, init);

      let cfg = await fetchCfg();
      const port = cfg?.api_port;

      // 端口对不上就不动（避免误给别的服务加头）
      if (!port || !url.includes(`:${port}/api/`)) return orig(input as RequestInfo, init);

      let res: Response;
      if (cfg?.admin_key) {
        res = await send(input, init, cfg.admin_key);
      } else {
        res = await orig(input as RequestInfo, init);
      }

      // 🔁 401 → 丢掉缓存重读配置再试一次（覆盖启动竞态和钥匙轮换）
      if (res.status === 401) {
        cfgCache = null;
        const fresh = await fetchCfg();
        if (fresh?.admin_key && fresh.admin_key !== cfg?.admin_key && fresh.api_port) {
          res = await send(input, init, fresh.admin_key);
        }
      }
      return res;
    } catch {
      /* 出任何岔子都退回"原样请求"，绝不能因此把控制台搞挂 */
      return orig(input as RequestInfo, init);
    }
  };
}
