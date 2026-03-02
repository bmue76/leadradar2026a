import * as SecureStore from "expo-secure-store";

const LICENSE_STATE_KEY = "leadradar.licenseState.v1";

export type LicenseStatus = "ACTIVE" | "INACTIVE";

export type LicenseStateV1 = {
  status: LicenseStatus;

  // server-delivered (optional)
  expiresAt?: string; // ISO
  apiKey?: string; // device-bound token/apiKey (falls geliefert)
  licenseKeyId?: string;

  // client meta
  licenseKeyLast4?: string;
  activatedAt?: string; // ISO
  lastCheckedAt?: string; // ISO
};

export type DerivedLicenseGate = {
  ready: boolean;
  active: boolean;
  expired: boolean;
  expiresAt?: Date;
};

export function parseIsoDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

export function deriveLicenseGate(state: LicenseStateV1 | null, now = new Date()): DerivedLicenseGate {
  if (!state) return { ready: false, active: false, expired: false };

  const expiresAt = parseIsoDate(state.expiresAt);
  const expired = !!expiresAt && expiresAt.getTime() < now.getTime();

  const active = state.status === "ACTIVE" && !expired;
  return { ready: true, active, expired, expiresAt };
}

export async function loadLicenseState(): Promise<LicenseStateV1 | null> {
  const raw = await SecureStore.getItemAsync(LICENSE_STATE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const obj = parsed as Record<string, unknown>;
    const status = obj.status;
    if (status !== "ACTIVE" && status !== "INACTIVE") return null;

    const state: LicenseStateV1 = {
      status,
      expiresAt: typeof obj.expiresAt === "string" ? obj.expiresAt : undefined,
      apiKey: typeof obj.apiKey === "string" ? obj.apiKey : undefined,
      licenseKeyId: typeof obj.licenseKeyId === "string" ? obj.licenseKeyId : undefined,
      licenseKeyLast4: typeof obj.licenseKeyLast4 === "string" ? obj.licenseKeyLast4 : undefined,
      activatedAt: typeof obj.activatedAt === "string" ? obj.activatedAt : undefined,
      lastCheckedAt: typeof obj.lastCheckedAt === "string" ? obj.lastCheckedAt : undefined,
    };

    return state;
  } catch {
    return null;
  }
}

export async function saveLicenseState(next: LicenseStateV1): Promise<void> {
  await SecureStore.setItemAsync(LICENSE_STATE_KEY, JSON.stringify(next));
}

export async function clearLicenseState(): Promise<void> {
  await SecureStore.deleteItemAsync(LICENSE_STATE_KEY);
}
