import React, { useEffect, useMemo, useState } from "react";
import type { ImageSourcePropType } from "react-native";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";

import { apiFetch } from "../src/lib/api";
import { BottomSheetModal } from "../src/ui/BottomSheetModal";

import BRAND_LOGO_FALLBACK from "../assets/images/icon.png";

const DEV_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "(unset)";

type ApiErrorShape = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  traceId: string;
};
type ApiOkShape<T> = { ok: true; data: T; traceId: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isApiOk<T>(v: unknown): v is ApiOkShape<T> {
  return isRecord(v) && v.ok === true && "data" in v;
}

function isApiErr(v: unknown): v is ApiErrorShape {
  return isRecord(v) && v.ok === false && "error" in v;
}

function isResponseLike(v: unknown): v is { json: () => Promise<unknown> } {
  if (!isRecord(v)) return false;
  const j = v.json;
  return typeof j === "function";
}

async function asJson(v: unknown): Promise<unknown> {
  if (isResponseLike(v)) return await v.json();
  return v;
}

/**
 * Tolerant unwrap:
 * - If API envelope: ok:true => return data
 * - If API envelope: ok:false => throw
 * - Else: assume it's already the data payload (some apiFetch wrappers do this)
 */
function unwrapData<T>(v: unknown): T {
  if (isApiOk<T>(v)) return v.data;
  if (isApiErr(v)) throw new Error(`${v.error.code}: ${v.error.message}`);
  return v as T;
}

type ActiveEvent = {
  id: string;
  name: string;
  startsAt?: string | null;
  endsAt?: string | null;
  location?: string | null;
};
type EventsActiveResponse = { activeEvent: ActiveEvent | null };

type FormSummary = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
};

type StatsMeResponse = {
  leadsToday: number;
  avgPerHour: number;
  pendingAttachments: number;
  todayHourlyBuckets?: Array<{ hour: number; count: number }>;
};

type BrandingResponse = {
  tenant: { id: string; slug: string; name: string };
  branding: {
    hasLogo: boolean;
    logoMime?: string | null;
    logoSizeBytes?: number | null;
    logoUpdatedAt?: string | null;
  };
  logoBase64Url: string | null;
};

type LogoBase64Response = {
  mime: string;
  base64: string;
};

type EntryMode = "lead" | "card" | "manual";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("unauthorized") ||
    m.includes("network") ||
    m.includes("fetch") ||
    m.includes("timeout") ||
    m.includes("failed") ||
    m.includes("econn") ||
    m.includes("enotfound")
  );
}

function formatEventMeta(
  startsAt?: string | null,
  endsAt?: string | null,
  location?: string | null,
) {
  const parts: string[] = [];
  if (startsAt || endsAt) {
    const s = startsAt ? new Date(startsAt).toLocaleDateString() : "";
    const e = endsAt ? new Date(endsAt).toLocaleDateString() : "";
    const range = s && e ? `${s} – ${e}` : s || e;
    if (range) parts.push(range);
  }
  if (location) parts.push(location);
  return parts.join(" · ");
}

function safeKey(input: string): string {
  return input.replace(/[^a-z0-9]+/gi, "_").slice(0, 80);
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "img";
}

async function cacheDirUri(): Promise<string> {
  // Some toolchains don't expose cacheDirectory/documentDirectory in TS types.
  const fs = FileSystem as unknown as {
    cacheDirectory?: string | null;
    documentDirectory?: string | null;
  };
  return fs.cacheDirectory ?? fs.documentDirectory ?? "file:///";
}

async function bestEffortCleanupOldLogos(prefix: string, keepFile: string) {
  try {
    const dir = await cacheDirUri();
    const files = await FileSystem.readDirectoryAsync(dir);
    const toDelete = files.filter((f) => f.startsWith(prefix) && f !== keepFile);
    await Promise.all(
      toDelete.map(async (f) => {
        const uri = `${dir}${f}`;
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }),
    );
  } catch {
    // ignore
  }
}

async function ensureLogoFile(opts: {
  tenantId: string;
  logoUpdatedAt: string | null | undefined;
  logoBase64Url: string;
}): Promise<{ uri: string } | null> {
  const dir = await cacheDirUri();
  const tag = safeKey(opts.logoUpdatedAt ?? "na");
  const prefix = `lr-tenant-logo-${opts.tenantId}-`;

  const existingCandidates = ["png", "jpg", "webp", "img"].map(
    (ext) => `${prefix}${tag}.${ext}`,
  );

  for (const cand of existingCandidates) {
    try {
      const info = await FileSystem.getInfoAsync(`${dir}${cand}`);
      if (info.exists) {
        await bestEffortCleanupOldLogos(prefix, cand);
        return { uri: info.uri };
      }
    } catch {
      // ignore
    }
  }

  const raw = await apiFetch({ method: "GET", path: opts.logoBase64Url });
  const json = await asJson(raw);
  const data = unwrapData<LogoBase64Response>(json);

  const ext = extFromMime(data.mime);
  const finalName = `${prefix}${tag}.${ext}`;
  const finalUri = `${dir}${finalName}`;

  await FileSystem.writeAsStringAsync(finalUri, data.base64, { encoding: "base64" });

  await bestEffortCleanupOldLogos(prefix, finalName);

  return { uri: finalUri };
}

async function getJson(label: string, path: string): Promise<unknown> {
  try {
    const raw = await apiFetch({ method: "GET", path });
    return await asJson(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error.";
    throw new Error(`${label}: ${msg}`);
  }
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [stats, setStats] = useState<StatsMeResponse | null>(null);

  const [tenantName, setTenantName] = useState<string>("—");
  const [tenantSlug, setTenantSlug] = useState<string>("-");
  const [hasLogo, setHasLogo] = useState<boolean>(false);

  const [logoFileUri, setLogoFileUri] = useState<string | null>(null);
  const [logoMode, setLogoMode] = useState<"file" | "fallback">("fallback");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("lead");

  async function loadOnce() {
    const [evJson, formsJson, statsJson, brandingJson] = await Promise.all([
      getJson("events/active", "/api/mobile/v1/events/active"),
      getJson("forms", "/api/mobile/v1/forms"),
      getJson(
        "stats/me",
        `/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(
          String(tzOffsetMinutes),
        )}`,
      ),
      getJson("branding", "/api/mobile/v1/branding"),
    ]);

    const ev = unwrapData<EventsActiveResponse>(evJson).activeEvent;
    const f = unwrapData<FormSummary[]>(formsJson);
    const s = unwrapData<StatsMeResponse>(statsJson);
    const b = unwrapData<BrandingResponse>(brandingJson);

    setActiveEvent(ev ?? null);
    setForms(Array.isArray(f) ? f : []);
    setStats(s ?? null);

    setTenantName(b.tenant?.name || "—");
    setTenantSlug(b.tenant?.slug || "-");

    const logoWanted = Boolean(b.branding?.hasLogo && b.logoBase64Url && b.tenant?.id);
    setHasLogo(logoWanted);

    if (logoWanted) {
      try {
        const file = await ensureLogoFile({
          tenantId: b.tenant.id,
          logoUpdatedAt: b.branding.logoUpdatedAt,
          logoBase64Url: b.logoBase64Url!,
        });

        if (file?.uri) {
          setLogoFileUri(file.uri);
          setLogoMode("file");
        } else {
          setLogoFileUri(null);
          setLogoMode("fallback");
        }
      } catch {
        setLogoFileUri(null);
        setLogoMode("fallback");
      }
    } else {
      setLogoFileUri(null);
      setLogoMode("fallback");
    }
  }

  async function loadWithRetries(opts: { showLoading: boolean }) {
    if (opts.showLoading) setLoading(true);
    setError(null);

    const maxRetries = 2;

    let lastMsg = "Unknown error.";
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        if (attempt > 0) await sleep(300 + attempt * 350);
        await loadOnce();
        if (opts.showLoading) setLoading(false);
        return;
      } catch (e) {
        lastMsg = e instanceof Error ? e.message : "Unknown error.";
        if (attempt < maxRetries && isTransientError(lastMsg)) continue;
        break;
      }
    }

    setError(lastMsg);
    setHasLogo(false);
    setLogoFileUri(null);
    setLogoMode("fallback");
    if (opts.showLoading) setLoading(false);
  }

  useEffect(() => {
    void loadWithRetries({ showLoading: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadWithRetries({ showLoading: false });
    } finally {
      setRefreshing(false);
    }
  }

  function openCaptureForForm(formId: string, mode: EntryMode) {
    const qp = mode === "lead" ? "" : `?entry=${encodeURIComponent(mode)}`;
    router.push(`/forms/${formId}${qp}`);
  }

  function handlePrimaryCTA() {
    if (forms.length === 0) {
      Alert.alert("Keine Formulare", "Dir sind aktuell keine aktiven Formulare zugewiesen.", [
        { text: "Formulare öffnen", onPress: () => router.push("/forms") },
        { text: "OK" },
      ]);
      return;
    }
    if (forms.length === 1) {
      openCaptureForForm(forms[0].id, "lead");
      return;
    }
    setEntryMode("lead");
    setSheetOpen(true);
  }

  function handleQuick(mode: EntryMode) {
    if (forms.length === 0) {
      Alert.alert("Keine Formulare", "Dir sind aktuell keine aktiven Formulare zugewiesen.", [
        { text: "Formulare öffnen", onPress: () => router.push("/forms") },
        { text: "OK" },
      ]);
      return;
    }
    if (forms.length === 1) {
      openCaptureForForm(forms[0].id, mode);
      return;
    }
    setEntryMode(mode);
    setSheetOpen(true);
  }

  const contentBottomPad = 32 + Math.max(insets.bottom, 0) + 120;

  const headerLogoSource: ImageSourcePropType =
    logoFileUri && logoMode === "file"
      ? { uri: logoFileUri }
      : (BRAND_LOGO_FALLBACK as unknown as ImageSourcePropType);

  const devErr = error ? error.slice(0, 90) : "none";

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: contentBottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View style={styles.brandStack}>
            <View style={styles.logoBadge}>
              <Image
                alt=""
                accessibilityLabel="Tenant Logo"
                source={headerLogoSource}
                style={styles.brandLogo}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.tenantName} numberOfLines={1}>
              {tenantName}
            </Text>

            {__DEV__ ? (
              <Text style={styles.devHint}>
                base: {DEV_BASE_URL} · tenant: {tenantSlug} · hasLogo: {String(hasLogo)} · mode: {logoMode} · loading: {String(loading)} · err: {devErr}
              </Text>
            ) : null}
          </View>

          <Text style={styles.title}>Home</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Aktives Event</Text>

          {loading ? (
            <View style={styles.skeletonBlock} />
          ) : activeEvent ? (
            <>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {activeEvent.name}
                </Text>
                <Text style={styles.chev}>›</Text>
              </View>
              {formatEventMeta(activeEvent.startsAt, activeEvent.endsAt, activeEvent.location) ? (
                <Text style={styles.cardMeta}>
                  {formatEventMeta(activeEvent.startsAt, activeEvent.endsAt, activeEvent.location)}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.warnText}>Kein aktives Event gefunden.</Text>
              <Pressable style={styles.secondaryBtn} onPress={() => void loadWithRetries({ showLoading: true })}>
                <Text style={styles.secondaryBtnText}>Retry</Text>
              </Pressable>
            </>
          )}
        </View>

        {error ? (
          <View style={[styles.card, styles.cardError]}>
            <Text style={styles.errorTitle}>Fehler</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.secondaryBtn} onPress={() => void loadWithRetries({ showLoading: true })}>
              <Text style={styles.secondaryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable style={styles.card} onPress={() => router.push("/stats")}>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Statistik heute</Text>
            <Text style={styles.chev}>›</Text>
          </View>

          {loading ? (
            <View style={styles.skeletonRow} />
          ) : (
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Leads</Text>
                <Text style={styles.statValue}>{stats?.leadsToday ?? 0}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Ø/h</Text>
                <Text style={styles.statValue}>{(stats?.avgPerHour ?? 0).toFixed(1)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Anhänge</Text>
                <Text style={styles.statValue}>{stats?.pendingAttachments ?? 0}</Text>
              </View>
            </View>
          )}

          <Text style={styles.miniHint}>Weitere Statistiken im „Stats“-Tab</Text>
        </Pressable>

        <Pressable style={styles.primaryBtn} onPress={handlePrimaryCTA}>
          <Text style={styles.primaryBtnText}>Lead erfassen</Text>
        </Pressable>

        <View style={styles.quickWrap}>
          <Pressable style={[styles.quickRow, { borderTopWidth: 0 }]} onPress={() => handleQuick("card")}>
            <Text style={styles.quickText}>Visitenkarte scannen</Text>
            <Text style={styles.chev}>›</Text>
          </Pressable>

          <Pressable style={styles.quickRow} onPress={() => handleQuick("manual")}>
            <Text style={styles.quickText}>Kontakt manuell hinzufügen</Text>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.footerHint}>Daten werden online erfasst · Pull to refresh</Text>
      </ScrollView>

      <BottomSheetModal visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={styles.sheetTitle}>Form wählen</Text>
        <View style={styles.sheetList}>
          {forms.map((fm) => (
            <Pressable
              key={fm.id}
              style={styles.sheetItem}
              onPress={() => {
                setSheetOpen(false);
                openCaptureForForm(fm.id, entryMode);
              }}
            >
              <Text style={styles.sheetItemTitle} numberOfLines={1}>
                {fm.name}
              </Text>
              {fm.description ? (
                <Text style={styles.sheetItemMeta} numberOfLines={1}>
                  {fm.description}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 18, paddingHorizontal: 16, gap: 12 },

  headerRow: { gap: 10, marginBottom: 4 },
  brandStack: { gap: 6, alignSelf: "flex-start" },

  logoBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  brandLogo: { width: 180, height: 42 },

  tenantName: { fontSize: 12, fontWeight: "600", opacity: 0.55 },
  devHint: { fontSize: 11, opacity: 0.45 },

  title: { fontSize: 30, fontWeight: "700", letterSpacing: -0.2 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  cardError: { borderColor: "rgba(220,38,38,0.25)" },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardLabel: { fontSize: 14, fontWeight: "600", opacity: 0.7 },
  cardTitle: { fontSize: 18, fontWeight: "700", flex: 1 },
  cardMeta: { marginTop: 6, opacity: 0.7 },
  chev: { fontSize: 22, opacity: 0.35 },
  warnText: { marginTop: 8, opacity: 0.75 },

  errorTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6, color: "#b91c1c" },
  errorText: { opacity: 0.8, marginBottom: 10 },

  primaryBtn: { backgroundColor: "#d32f2f", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  secondaryBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  secondaryBtnText: { fontWeight: "600", opacity: 0.85 },

  quickWrap: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  quickRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  quickText: { fontSize: 16, fontWeight: "600" },

  statsRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  stat: { flex: 1, backgroundColor: "rgba(0,0,0,0.03)", borderRadius: 12, padding: 10 },
  statLabel: { fontSize: 12, opacity: 0.65, fontWeight: "600" },
  statValue: { marginTop: 6, fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  miniHint: { marginTop: 10, opacity: 0.6, fontSize: 12 },

  footerHint: { marginTop: 2, opacity: 0.55, fontSize: 12, textAlign: "center" },

  skeletonBlock: { marginTop: 10, height: 18, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.06)" },
  skeletonRow: { marginTop: 12, height: 44, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" },

  sheetTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
  sheetList: { gap: 10, paddingBottom: 10 },
  sheetItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.04)" },
  sheetItemTitle: { fontSize: 15, fontWeight: "700" },
  sheetItemMeta: { marginTop: 4, opacity: 0.7, fontSize: 12 },
});
