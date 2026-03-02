import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { apiFetch } from "./api";
import { getAppSettings, normalizeTenantSlug } from "./appSettings";
import { parseProvisionToken } from "./tokenParse";
import { fetchLicense } from "./mobileApi";

import {
  clearLicenseState,
  deriveLicenseGate,
  loadLicenseState,
  saveLicenseState,
  type DerivedLicenseGate,
  type LicenseStateV1,
} from "./licenseState";

export type ActivateResult =
  | { ok: true; traceId?: string; expiresAt?: string; apiKey?: string; deviceId?: string }
  | { ok: false; traceId?: string; message: string; code?: string };

type LicenseGateContextValue = {
  loading: boolean;
  state: LicenseStateV1 | null;
  derived: DerivedLicenseGate;
  activate: (codeRaw: string) => Promise<ActivateResult>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
};

const LicenseGateContext = createContext<LicenseGateContextValue | null>(null);

type ApiOk = { ok: true; data: unknown; traceId?: string };
type ApiErr = { ok: false; error: { code?: string; message?: string; details?: unknown }; traceId?: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isApiOk(v: unknown): v is ApiOk {
  return isRecord(v) && v.ok === true && "data" in v;
}

function isApiErr(v: unknown): v is ApiErr {
  if (!isRecord(v) || v.ok !== false) return false;
  const err = v.error;
  return isRecord(err);
}

function pickTraceId(res: unknown): string | undefined {
  if (!isRecord(res)) return undefined;
  const tid = typeof res.traceId === "string" ? res.traceId : undefined;
  if (tid) return tid;
  const err = res.error;
  if (isRecord(err) && typeof err.traceId === "string") return err.traceId;
  return undefined;
}

function pickString(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined;
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

// apiFetch in TP 9.1 ist 1-arg; wir tippen minimal/kompatibel (ohne any)
type ApiFetchArgs = {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};
const apiFetch1 = apiFetch as unknown as (args: ApiFetchArgs) => Promise<unknown>;

export function LicenseGateProvider(props: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<LicenseStateV1 | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await loadLicenseState();
        if (mounted) setState(s);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const derived = useMemo(() => deriveLicenseGate(state), [state]);

  const clear = useCallback(async () => {
    await clearLicenseState();
    setState(null);
  }, []);

  const refresh = useCallback(async () => {
    const s = await loadLicenseState();
    const nowIso = new Date().toISOString();

    if (!s) {
      setState(null);
      return;
    }

    // Wenn kein apiKey vorhanden ist, können wir /license nicht prüfen.
    if (!s.apiKey) {
      const next = { ...s, lastCheckedAt: nowIso };
      await saveLicenseState(next);
      setState(next);
      return;
    }

    try {
      const settings = await getAppSettings();
      const t = normalizeTenantSlug(settings.tenantSlug);

      const lic = await fetchLicense({ apiKey: s.apiKey, tenantSlug: t || null });

      const next: LicenseStateV1 = {
        ...s,
        status: lic.isActive ? "ACTIVE" : "INACTIVE",
        expiresAt: lic.endsAt ?? undefined,
        lastCheckedAt: nowIso,
      };

      await saveLicenseState(next);
      setState(next);
    } catch {
      // Soft-fail: bleibt im letzten bekannten Zustand, nur lastCheckedAt setzen
      const next = { ...s, lastCheckedAt: nowIso };
      await saveLicenseState(next);
      setState(next);
    }
  }, []);

  const activate = useCallback(async (codeRaw: string): Promise<ActivateResult> => {
    const code = parseProvisionToken(codeRaw);
    if (!code) {
      return { ok: false, message: "Bitte gib einen gültigen Aktivierungscode ein." };
    }

    const nowIso = new Date().toISOString();

    const settings = await getAppSettings();
    const tenantSlug = normalizeTenantSlug(settings.tenantSlug);

    if (!tenantSlug) {
      return { ok: false, code: "TENANT_REQUIRED", message: "Konto-Kürzel ist ungültig. Bitte in den Einstellungen prüfen." };
    }

    try {
      // ✅ Backend-Contract:
      // POST /api/mobile/v1/provisioning/redeem
      // Body: { tenantSlug, code }
      const res = (await apiFetch1({
        path: "/api/mobile/v1/provisioning/redeem",
        method: "POST",
        body: { tenantSlug, code },
      })) as unknown;

      const traceId = pickTraceId(res);

      if (isApiErr(res)) {
        const msg = res.error.message ?? "Aktivierung fehlgeschlagen. Bitte prüfe den Code und versuche es erneut.";
        const errCode = typeof res.error.code === "string" ? res.error.code : undefined;
        return { ok: false, message: msg, code: errCode, traceId };
      }

      if (!isApiOk(res)) {
        return { ok: false, message: "Aktivierung fehlgeschlagen. Unerwartete Server-Antwort.", traceId };
      }

      const data = res.data;

      const apiKey = pickString(data, "apiKey");
      const deviceId = pickString(data, "deviceId");

      if (!apiKey) {
        return { ok: false, message: "Aktivierung fehlgeschlagen. Kein apiKey erhalten.", traceId };
      }

      // Optional: direkt Lizenzstatus prüfen, um expiresAt (endsAt) zu setzen
      let expiresAt: string | undefined;
      try {
        const lic = await fetchLicense({ apiKey, tenantSlug });
        expiresAt = lic.endsAt ?? undefined;

        if (!lic.isActive) {
          // Gate soll greifen -> INACTIVE speichern
          const nextInactive: LicenseStateV1 = {
            status: "INACTIVE",
            apiKey,
            licenseKeyLast4: code.slice(-4),
            activatedAt: nowIso,
            lastCheckedAt: nowIso,
            expiresAt,
          };
          await saveLicenseState(nextInactive);
          setState(nextInactive);

          return {
            ok: false,
            traceId,
            code: "LICENSE_INACTIVE",
            message: "Gerät wurde aktiviert, aber die Lizenz ist nicht aktiv. Bitte Lizenzstatus im Admin prüfen.",
          };
        }
      } catch {
        // Wenn /license nicht erreichbar ist, trotzdem aktivieren (Expiry bleibt unbekannt)
      }

      const next: LicenseStateV1 = {
        status: "ACTIVE",
        apiKey,
        licenseKeyLast4: code.slice(-4),
        activatedAt: nowIso,
        lastCheckedAt: nowIso,
        expiresAt,
      };

      await saveLicenseState(next);
      setState(next);

      return { ok: true, traceId, expiresAt, apiKey, deviceId };
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : "Netzwerkfehler. Bitte Internetverbindung prüfen und erneut versuchen.";
      return { ok: false, message };
    }
  }, []);

  const value: LicenseGateContextValue = useMemo(
    () => ({ loading, state, derived, activate, clear, refresh }),
    [loading, state, derived, activate, clear, refresh]
  );

  return <LicenseGateContext.Provider value={value}>{props.children}</LicenseGateContext.Provider>;
}

export function useLicenseGate(): LicenseGateContextValue {
  const ctx = useContext(LicenseGateContext);
  if (!ctx) throw new Error("useLicenseGate must be used within LicenseGateProvider");
  return ctx;
}
