// apps/mobile/src/lib/brandingCache.ts
export type BrandingCacheDto = {
  tenantName: string;
  accentColor: string | null;
  logoDataUri: string | null;
  updatedAt: string; // ISO
};

const KEY = "lr_branding_cache_v1";

// MVP: no external storage dependency
let memCache: BrandingCacheDto | null = null;

function canUseLocalStorage(): boolean {
  try {
    return typeof globalThis !== "undefined" && !!(globalThis as unknown as { localStorage?: unknown }).localStorage;
  } catch {
    return false;
  }
}

function readLocalStorage(): BrandingCacheDto | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(KEY);
    if (!raw) return null;
    const json = JSON.parse(raw) as BrandingCacheDto;
    if (!json || typeof json.tenantName !== "string") return null;
    return json;
  } catch {
    return null;
  }
}

function writeLocalStorage(dto: BrandingCacheDto): void {
  if (!canUseLocalStorage()) return;
  try {
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(KEY, JSON.stringify(dto));
  } catch {
    // ignore
  }
}

export async function getBrandingFromCache(): Promise<BrandingCacheDto | null> {
  if (memCache) return memCache;
  const ls = readLocalStorage();
  if (ls) memCache = ls;
  return ls;
}

export async function setBrandingCache(dto: BrandingCacheDto): Promise<void> {
  memCache = dto;
  writeLocalStorage(dto);
}
