
export async function getApiBase(): Promise<string> {
  const res = await fetch(`/backend_config.json?t=${Date.now()}`, { cache: 'no-store' });
  const cfg = await res.json();
  const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  return `http://${host}:${cfg.api_port}`;
}

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