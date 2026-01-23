type CacheEntry<T> = { ts: number; value: T };

const mem = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string, maxAgeMs: number): T | undefined {
  const e = mem.get(key) as CacheEntry<T> | undefined;
  if (!e) return undefined;
  if (Date.now() - e.ts > maxAgeMs) return undefined;
  return e.value;
}

export function cacheSet<T>(key: string, value: T) {
  mem.set(key, { ts: Date.now(), value });
}

export function cacheClear(prefix?: string) {
  if (!prefix) {
    mem.clear();
    return;
  }
  for (const k of mem.keys()) {
    if (k.startsWith(prefix)) mem.delete(k);
  }
}
