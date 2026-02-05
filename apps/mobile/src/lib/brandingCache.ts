import type { MobileBrandingDto } from "./branding";

type CacheEntry = {
  value: MobileBrandingDto;
  storedAtMs: number;
};

const KEY = "__LR_BRANDING_CACHE__";

function nowMs(): number {
  return Date.now();
}

function getStore(): { entry: CacheEntry | null } {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[KEY]) g[KEY] = { entry: null };
  return g[KEY] as { entry: CacheEntry | null };
}

export function getBrandingFromCache(ttlMs: number): MobileBrandingDto | null {
  const store = getStore();
  const e = store.entry;
  if (!e) return null;
  if (nowMs() - e.storedAtMs > ttlMs) return null;
  return e.value;
}

export function setBrandingCache(value: MobileBrandingDto): void {
  const store = getStore();
  store.entry = { value, storedAtMs: nowMs() };
}

export function clearBrandingCache(): void {
  const store = getStore();
  store.entry = null;
}
