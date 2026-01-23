import React, { useEffect, useMemo, useState } from "react";
import type { ImageSourcePropType } from "react-native";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Image } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "../src/lib/api";
import { BottomSheetModal } from "../src/ui/BottomSheetModal";

import BRAND_LOGO_FALLBACK from "../assets/images/icon.png";

type ApiErrorShape = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  traceId: string;
};

type ApiOkShape<T> = {
  ok: true;
  data: T;
  traceId: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isApiOk<T>(v: unknown): v is ApiOkShape<T> {
  return isRecord(v) && v.ok === true && "data" in v;
}

function isApiErr(v: unknown): v is ApiErrorShape {
  return isRecord(v) && v.ok === false && "error" in v;
}

function unwrapOk<T>(v: unknown): T {
  if (isApiOk<T>(v)) return v.data;
  if (isApiErr(v)) throw new Error(`${v.error.code}: ${v.error.message}`);
  throw new Error("Invalid API response shape.");
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
  branding: {
    hasLogo: boolean;
    logoMime?: string | null;
    logoSizeBytes?: number | null;
    logoUpdatedAt?: string | null;
  };
  logoDataUrl: string | null;
};

type EntryMode = "lead" | "card" | "manual";

function formatEventMeta(startsAt?: string | null, endsAt?: string | null, location?: string | null) {
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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [stats, setStats] = useState<StatsMeResponse | null>(null);

  const [tenantLogoDataUrl, setTenantLogoDataUrl] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState<boolean>(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("lead");

  async function load() {
    setError(null);

    try {
      const [evRaw, formsRaw, statsRaw] = await Promise.all([
        apiFetch({ method: "GET", path: "/api/mobile/v1/events/active" }),
        apiFetch({ method: "GET", path: "/api/mobile/v1/forms" }),
        apiFetch({
          method: "GET",
          path: `/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(String(tzOffsetMinutes))}`,
        }),
      ]);

      const ev = unwrapOk<EventsActiveResponse>(evRaw).activeEvent;
      const f = unwrapOk<FormSummary[]>(formsRaw);
      const s = unwrapOk<StatsMeResponse>(statsRaw);

      setActiveEvent(ev ?? null);
      setForms(Array.isArray(f) ? f : []);
      setStats(s ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      setError(msg);
    } finally {
      setLoading(false);
    }

    // Branding ist “nice to have”: darf Home nicht failen
    try {
      const brandingRaw = await apiFetch({ method: "GET", path: "/api/mobile/v1/branding" });
      const b = unwrapOk<BrandingResponse>(brandingRaw);
      setTenantLogoDataUrl(b.logoDataUrl ?? null);
    } catch {
      setTenantLogoDataUrl(null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
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

  const headerLogoSource: ImageSourcePropType = tenantLogoDataUrl
    ? { uri: tenantLogoDataUrl }
    : (BRAND_LOGO_FALLBACK as unknown as ImageSourcePropType);

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: contentBottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <Image
              alt="Tenant Logo"
              accessibilityLabel="Tenant Logo"
              source={headerLogoSource}
              style={styles.brandLogo}
              resizeMode="contain"
            />
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
              <Pressable style={styles.secondaryBtn} onPress={load}>
                <Text style={styles.secondaryBtnText}>Retry</Text>
              </Pressable>
            </>
          )}
        </View>

        {error ? (
          <View style={[styles.card, styles.cardError]}>
            <Text style={styles.errorTitle}>Fehler</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.secondaryBtn} onPress={load}>
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
          {forms.map((f) => (
            <Pressable
              key={f.id}
              style={styles.sheetItem}
              onPress={() => {
                setSheetOpen(false);
                openCaptureForForm(f.id, entryMode);
              }}
            >
              <Text style={styles.sheetItemTitle} numberOfLines={1}>
                {f.name}
              </Text>
              {f.description ? (
                <Text style={styles.sheetItemMeta} numberOfLines={1}>
                  {f.description}
                </Text>
              ) : null}
            </Pressable>
          ))}
          {forms.length === 0 ? <Text style={styles.sheetEmpty}>Keine Formulare zugewiesen.</Text> : null}
        </View>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 18, paddingHorizontal: 16, gap: 12 },

  headerRow: { gap: 8, marginBottom: 4 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandLogo: { width: 160, height: 32 },
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
  sheetEmpty: { opacity: 0.7 },
});
