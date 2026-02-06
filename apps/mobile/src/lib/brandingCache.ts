// apps/mobile/src/lib/brandingCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

export type BrandingCacheDto = {
  tenantName: string;
  accentColor: string | null; // normalized "#RRGGBB" or null
  logoDataUri: string | null; // "data:image/..;base64,..."
  logoUpdatedAt: string | null; // ISO timestamp from backend (version hint)
  updatedAt: string; // ISO timestamp when cache was written
};

const KEY = "lr_branding_cache_v1";

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function safeTrim(s: string): string {
  return s.trim();
}

function isLikelyDataUri(s: string): boolean {
  return s.startsWith("data:image/");
}

function normalizeHexUpper(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(t)) return null;
  return t.toUpperCase();
}

function validate(dto: unknown): BrandingCacheDto | null {
  if (!dto || typeof dto !== "object") return null;
  const r = dto as Record<string, unknown>;

  const tenantName = isString(r.tenantName) ? safeTrim(r.tenantName) : "";
  if (!tenantName) return null;

  const accentColor = isNullableString(r.accentColor) ? normalizeHexUpper(r.accentColor) : null;

  const logoDataUri =
    isNullableString(r.logoDataUri) && (r.logoDataUri === null || isLikelyDataUri(r.logoDataUri))
      ? r.logoDataUri
      : null;

  const logoUpdatedAt = isNullableString(r.logoUpdatedAt) ? (r.logoUpdatedAt ? safeTrim(r.logoUpdatedAt) : null) : null;

  const updatedAt = isString(r.updatedAt) ? safeTrim(r.updatedAt) : "";
  if (!updatedAt) return null;

  return { tenantName, accentColor, logoDataUri, logoUpdatedAt, updatedAt };
}

export async function getBrandingFromCache(): Promise<BrandingCacheDto | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return validate(parsed);
  } catch {
    return null;
  }
}

export async function setBrandingCache(dto: BrandingCacheDto): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(dto));
  } catch {
    // ignore (best effort cache)
  }
}

export async function clearBrandingCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
