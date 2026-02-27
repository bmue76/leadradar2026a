import * as SecureStore from "expo-secure-store";
import { uuidV4 } from "./uuid";
import { getApiBaseUrl as getEnvApiBaseUrl } from "./env";

const K_BASE_URL = "lr_baseUrl";
// Reuse existing key (shared with mobileStorage) to avoid duplication:
const K_TENANT = "lr_tenantSlug";
const K_DEVICE_UID = "lr_deviceUid";

export type AppSettings = {
  /** Explicit user-configured baseUrl (normalized). Null if not configured. */
  baseUrl: string | null;
  /** Tenant slug (normalized). Null if not configured. */
  tenantSlug: string | null;
  /** Stable client-side device UID (generated once, persisted). */
  deviceUid: string;

  /** Effective base URL used for requests. DEV may fall back to env. */
  effectiveBaseUrl: string | null;
  effectiveBaseUrlSource: "stored" | "dev-env" | "none";
};

let _cache: AppSettings | null = null;
let _inflight: Promise<AppSettings> | null = null;

function isDevRuntime(): boolean {
  const v = (globalThis as unknown as { __DEV__?: unknown }).__DEV__;
  return typeof v === "boolean" ? v : false;
}

function clean(s: string | null | undefined): string {
  return (s ?? "").trim();
}

export function normalizeTenantSlug(input: string | null | undefined): string | null {
  const raw = clean(input);
  if (!raw) return null;
  const slug = raw.toLowerCase();

  // Keep it tolerant but safe: a-z 0-9 -
  const ok = /^[a-z0-9-]+$/.test(slug);
  if (!ok) return null;

  return slug;
}

export function normalizeBaseUrl(input: string | null | undefined): string | null {
  const raw = clean(input);
  if (!raw) return null;

  // Allow user to omit scheme -> assume https
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;

    // Normalize: no trailing slashes
    const normalized = `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, "");
    return normalized;
  } catch {
    return null;
  }
}

async function ensureDeviceUid(): Promise<string> {
  const existing = await SecureStore.getItemAsync(K_DEVICE_UID);
  const v = clean(existing);
  if (v) return v;

  const created = uuidV4();
  await SecureStore.setItemAsync(K_DEVICE_UID, created);
  return created;
}

function resolveEffectiveBaseUrl(stored: string | null): {
  baseUrl: string | null;
  source: AppSettings["effectiveBaseUrlSource"];
} {
  if (stored && stored.trim()) return { baseUrl: stored, source: "stored" };

  // DEV fallback only (as requested)
  if (isDevRuntime()) {
    const env = clean(getEnvApiBaseUrl());
    if (env) return { baseUrl: env, source: "dev-env" };
  }

  return { baseUrl: null, source: "none" };
}

async function loadSettings(): Promise<AppSettings> {
  const [baseUrlRaw, tenantRaw, deviceUid] = await Promise.all([
    SecureStore.getItemAsync(K_BASE_URL),
    SecureStore.getItemAsync(K_TENANT),
    ensureDeviceUid(),
  ]);

  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  const tenantSlug = normalizeTenantSlug(tenantRaw);

  const eff = resolveEffectiveBaseUrl(baseUrl);

  return {
    baseUrl,
    tenantSlug,
    deviceUid,
    effectiveBaseUrl: eff.baseUrl,
    effectiveBaseUrlSource: eff.source,
  };
}

export async function getAppSettings(opts?: { refresh?: boolean }): Promise<AppSettings> {
  if (!opts?.refresh && _cache) return _cache;
  if (!opts?.refresh && _inflight) return _inflight;

  _inflight = (async () => {
    const s = await loadSettings();
    _cache = s;
    _inflight = null;
    return s;
  })();

  return _inflight;
}

export async function setAppSettings(next: { baseUrl?: string | null; tenantSlug?: string | null }): Promise<AppSettings> {
  const current = await getAppSettings();

  const baseUrl = next.baseUrl === undefined ? current.baseUrl : normalizeBaseUrl(next.baseUrl);
  const tenantSlug = next.tenantSlug === undefined ? current.tenantSlug : normalizeTenantSlug(next.tenantSlug);

  await Promise.all([
    baseUrl ? SecureStore.setItemAsync(K_BASE_URL, baseUrl) : SecureStore.deleteItemAsync(K_BASE_URL),
    tenantSlug ? SecureStore.setItemAsync(K_TENANT, tenantSlug) : SecureStore.deleteItemAsync(K_TENANT),
  ]);

  return await getAppSettings({ refresh: true });
}

export async function clearStoredBaseUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(K_BASE_URL);
  await getAppSettings({ refresh: true });
}

export async function clearStoredTenantSlug(): Promise<void> {
  await SecureStore.deleteItemAsync(K_TENANT);
  await getAppSettings({ refresh: true });
}
