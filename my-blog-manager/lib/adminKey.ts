
const KEY_HEADER = 'X-Admin-Key';

type BackendCfg = { api_port?: number; admin_key?: string };

let installed = false;
let cfgCache: BackendCfg | null = null;
let cfgInflight: Promise<BackendCfg> | null = null;

function fetchCfg(): Promise<BackendCfg> {
  if (cfgCache) return Promise.resolve(cfgCache);
  if (!cfgInflight) {
    cfgInflight = fetch(`/backend_config.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<BackendCfg>)
      .catch(() => ({} as BackendCfg))
      .then((cfg) => {
        cfgInflight = null;
        if (cfg && cfg.admin_key) cfgCache = cfg;
        return cfg;
      });
  }
  return cfgInflight;
}

function withKey(init: RequestInit | undefined, key: string): RequestInit {
  const headers = new Headers(init?.headers || undefined);
  headers.set(KEY_HEADER, key);
  return { ...(init || {}), headers };
}

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

      if (!port || !url.includes(`:${port}/api/`)) return orig(input as RequestInfo, init);

      let res: Response;
      if (cfg?.admin_key) {
        res = await send(input, init, cfg.admin_key);
      } else {
        res = await orig(input as RequestInfo, init);
      }

      if (res.status === 401) {
        cfgCache = null;
        const fresh = await fetchCfg();
        if (fresh?.admin_key && fresh.admin_key !== cfg?.admin_key && fresh.api_port) {
          res = await send(input, init, fresh.admin_key);
        }
      }
      return res;
    } catch {
      return orig(input as RequestInfo, init);
    }
  };
}