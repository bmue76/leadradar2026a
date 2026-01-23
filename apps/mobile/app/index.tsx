import React, { useEffect, useMemo, useState } from "react";
import type { ImageSourcePropType } from "react-native";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Image } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "../src/lib/api";
import { getApiBaseUrl } from "../src/lib/env";
import { BottomSheetModal } from "../src/ui/BottomSheetModal";

import BRAND_LOGO_FALLBACK from "../assets/images/icon.png";

type ActiveEvent = { id: string; name: string; startsAt?: string | null; endsAt?: string | null; location?: string | null };
type EventsActiveResponse = { activeEvent: ActiveEvent | null };

type FormSummary = { id: string; name: string; description?: string | null; status?: string | null };

type StatsMeResponse = {
  leadsToday: number;
  avgPerHour: number;
  pendingAttachments: number;
  todayHourlyBuckets?: Array<{ hour: number; count: number }>;
};

type BrandingResponse = {
  tenant: { id: string; slug: string; name: string };
  branding: { hasLogo: boolean; logoMime: string | null; logoSizeBytes: number | null; logoUpdatedAt: string | null };
  logoBase64Url: string | null;
};

type LogoBase64Response = { mime: string; base64: string };

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

async function getData<T>(label: string, path: string): Promise<T> {
  const res = await apiFetch<T>({ method: "GET", path });
  if (!res.ok) {
    const t = res.traceId ? ` (traceId: ${res.traceId})` : "";
    throw new Error(`${label}: HTTP ${res.status} — ${res.code}: ${res.message}${t}`);
  }
  return res.data;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);
  const baseUrl = useMemo(() => getApiBaseUrl(), []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [stats, setStats] = useState<StatsMeResponse | null>(null);

  const [tenantName, setTenantName] = useState<string>("—");
  const [hasLogo, setHasLogo] = useState<boolean>(false);

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("lead");

  async function loadOnce() {
    const [ev, f, s, b] = await Promise.all([
      getData<EventsActiveResponse>("events/active", "/api/mobile/v1/events/active"),
      getData<FormSummary[]>("forms", "/api/mobile/v1/forms"),
      getData<StatsMeResponse>(
        "stats/me",
        `/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(String(tzOffsetMinutes))}`,
      ),
      getData<BrandingResponse>("branding", "/api/mobile/v1/branding"),
    ]);

    setActiveEvent(ev.activeEvent ?? null);
    setForms(Array.isArray(f) ? f : []);
    setStats(s ?? null);

    setTenantName(b.tenant?.name || "—");

    const wantLogo = Boolean(b.branding?.hasLogo && b.logoBase64Url);
    setHasLogo(wantLogo);

    if (wantLogo && b.logoBase64Url) {
      try {
        const lb = await getData<LogoBase64Response>("branding/logo-base64", b.logoBase64Url);
        setLogoDataUrl(`data:${lb.mime};base64,${lb.base64}`);
      } catch {
        setLogoDataUrl(null);
      }
    } else {
      setLogoDataUrl(null);
    }
  }

  async function load(opts: { showLoading: boolean }) {
    if (opts.showLoading) setLoading(true);
    setError(null);
    try {
      await loadOnce();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      setError(msg);
      setHasLogo(false);
      setLogoDataUrl(null);
    } finally {
      if (opts.showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void load({ showLoading: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load({ showLoading: false });
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
  const contentTopPad = Math.max(insets.top, 12) + 8;

  const tenantLogoSource: ImageSourcePropType =
    logoDataUrl ? ({ uri: logoDataUrl } as ImageSourcePropType) : (BRAND_LOGO_FALLBACK as unknown as ImageSourcePropType);

  const leadradarWordmark: ImageSourcePropType = { uri: `${baseUrl}/brand/leadradar-logo.png` };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: "#fff" }}
        contentContainerStyle={[styles.container, { paddingTop: contentTopPad, paddingBottom: contentBottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image accessibilityLabel="Tenant Logo" source={tenantLogoSource} style={styles.tenantLogo} resizeMode="contain" />
          </View>

          <View style={styles.brandMetaRow}>
            <Text style={styles.tenantName} numberOfLines={1}>
              {tenantName}
            </Text>

            <View style={styles.poweredByRow}>
              <Text style={styles.poweredByText}>powered by</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image accessibilityLabel="LeadRadar" source={leadradarWordmark} style={styles.leadradarLogo} resizeMode="contain" />
            </View>
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
                <Text style={styles.cardMeta}>{formatEventMeta(activeEvent.startsAt, activeEvent.endsAt, activeEvent.location)}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.warnText}>Kein aktives Event gefunden.</Text>
              <Pressable style={styles.secondaryBtn} onPress={() => void load({ showLoading: true })}>
                <Text style={styles.secondaryBtnText}>Retry</Text>
              </Pressable>
            </>
          )}
        </View>

        {error ? (
          <View style={[styles.card, styles.cardError]}>
            <Text style={styles.errorTitle}>Fehler</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.secondaryBtn} onPress={() => void load({ showLoading: true })}>
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
  container: { paddingHorizontal: 16, gap: 12 },

  headerRow: { gap: 8, marginBottom: 4 },
  brandRow: { alignSelf: "flex-start" },

  tenantLogo: { width: 190, height: 40 },

  brandMetaRow: { gap: 4 },
  tenantName: { fontSize: 12, fontWeight: "600", opacity: 0.55 },

  poweredByRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  poweredByText: { fontSize: 11, opacity: 0.45, fontWeight: "600" },
  leadradarLogo: { width: 120, height: 16, opacity: 0.75 },

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
