import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { getApiBaseUrl } from "../src/lib/env";
import { apiFetch } from "../src/lib/api";

type BrandingResp = {
  tenant?: { id: string; slug: string; name: string };
  branding?: { hasLogo: boolean; logoMime?: string | null; logoUpdatedAt?: string | null };
  logoDataUrl?: string | null;
  logoBase64Url?: string | null;
};

type ActiveEventResp = { item?: { id: string; name: string } | null };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v : null;
}
function pickNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const ACCENT = "#D12B2B";

export default function Home() {
  const insets = useSafeAreaInsets();
  const baseUrl = useMemo(() => getApiBaseUrl(), []);

  const [refreshing, setRefreshing] = useState(false);

  const [tenantName, setTenantName] = useState<string>("—");
  const [tenantLogoUri, setTenantLogoUri] = useState<string | null>(null);

  const [activeEventName, setActiveEventName] = useState<string | null>(null);

  const [todayLeads, setTodayLeads] = useState<number>(0);
  const [todayLph, setTodayLph] = useState<number>(0);
  const [todayAttachments, setTodayAttachments] = useState<number>(0);

  const leadradarLogoUri = useMemo(
    () => `${baseUrl.replace(/\/+$/, "")}/brand/leadradar-logo.png`,
    [baseUrl],
  );

  const loadAll = useCallback(async () => {
    const brandingRes = await apiFetch<BrandingResp>({ path: "/api/mobile/v1/branding" });
    if (brandingRes.ok) {
      const b = brandingRes.data;
      setTenantName(b.tenant?.name ?? "—");

      const dataUrl = b.logoDataUrl ? b.logoDataUrl : null;
      if (dataUrl) {
        setTenantLogoUri(dataUrl);
      } else if (b.logoBase64Url) {
        const base64Res = await apiFetch<{ mime: string; base64: string }>({ path: b.logoBase64Url });
        if (base64Res.ok) {
          const mime = pickString(base64Res.data.mime) ?? "image/png";
          const base64 = pickString(base64Res.data.base64);
          setTenantLogoUri(base64 ? `data:${mime};base64,${base64}` : null);
        } else {
          setTenantLogoUri(null);
        }
      } else {
        setTenantLogoUri(null);
      }
    } else {
      setTenantName("—");
      setTenantLogoUri(null);
    }

    const evtRes = await apiFetch<ActiveEventResp>({ path: "/api/mobile/v1/events/active" });
    if (evtRes.ok) setActiveEventName(evtRes.data?.item?.name ?? null);
    else setActiveEventName(null);

    const tzOffsetMinutes = new Date().getTimezoneOffset();
    const statsRes = await apiFetch<unknown>({
      path: `/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(String(tzOffsetMinutes))}`,
    });

    if (statsRes.ok && isRecord(statsRes.data)) {
      setTodayLeads(pickNumber(statsRes.data.leads) ?? 0);
      setTodayLph(pickNumber(statsRes.data.leadsPerHour) ?? 0);
      setTodayAttachments(pickNumber(statsRes.data.attachments) ?? 0);
    } else {
      setTodayLeads(0);
      setTodayLph(0);
      setTodayAttachments(0);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const bottomPad = 18 + Math.max(insets.bottom, 10);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar backgroundColor="white" barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.tenantLogoWrap}>
              {tenantLogoUri ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image
                  source={{ uri: tenantLogoUri }}
                  accessibilityLabel="Tenant Logo"
                  style={styles.tenantLogo}
                  resizeMode="contain"
                />
              ) : null}
            </View>
          </View>

          <Text style={styles.tenantName}>{tenantName}</Text>
          <Text style={styles.title}>Home</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aktives Event</Text>
          {activeEventName ? (
            <Text style={styles.cardText}>{activeEventName}</Text>
          ) : (
            <Text style={styles.cardMuted}>Kein aktives Event gefunden.</Text>
          )}
          <View style={{ height: 10 }} />
          <Pressable onPress={onRefresh} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Retry</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.push("/stats")} style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitle}>Statistik heute</Text>
            <Text style={styles.chev}>›</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Leads</Text>
              <Text style={styles.statValue}>{todayLeads}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Ø/h</Text>
              <Text style={styles.statValue}>{todayLph.toFixed(1)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Anhänge</Text>
              <Text style={styles.statValue}>{todayAttachments}</Text>
            </View>
          </View>

          <Text style={styles.smallHint}>Weitere Statistiken im „Stats“-Tab</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/forms")} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Lead erfassen</Text>
        </Pressable>

        <View style={styles.listCard}>
          <Pressable onPress={() => router.push("/leads")} style={styles.listRow}>
            <Text style={styles.listRowText}>Visitenkarte scannen</Text>
            <Text style={styles.chev}>›</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable onPress={() => router.push("/leads")} style={styles.listRow}>
            <Text style={styles.listRowText}>Kontakt manuell hinzufügen</Text>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.footerHint}>Daten werden online erfasst · Pull to refresh</Text>

        <View style={styles.poweredBy}>
          <Text style={styles.poweredByText}>powered by</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image
            source={{ uri: leadradarLogoUri }}
            accessibilityLabel="LeadRadar Logo"
            style={styles.leadradarLogo}
            resizeMode="contain"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "white" },
  content: { padding: 16, gap: 14 },

  header: { paddingTop: 6, paddingBottom: 4 },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },

  // wichtig: padding(16) aus dem Screen "aushebeln" => ganz links bündig
  tenantLogoWrap: {
    width: 160,
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
    marginLeft: -16,
  },
  tenantLogo: { width: 160, height: 44 },

  tenantName: { marginTop: 8, fontSize: 18, fontWeight: "700", color: "#111827" },

  // +5px Abstand zur Headline
  title: { marginTop: 13, fontSize: 30, fontWeight: "900", color: "#111827" },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "white",
    padding: 16,
  },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  cardText: { marginTop: 6, fontSize: 16, color: "#111827" },
  cardMuted: { marginTop: 6, fontSize: 16, color: "#6B7280" },
  chev: { fontSize: 22, fontWeight: "900", color: "#9CA3AF" },

  secondaryBtn: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
  },
  secondaryBtnText: { fontWeight: "900", color: "#111827" },

  statsRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  statBox: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    padding: 12,
  },
  statLabel: { color: "#6B7280", fontWeight: "800" },
  statValue: { marginTop: 6, fontSize: 26, fontWeight: "900", color: "#111827" },
  smallHint: { marginTop: 10, color: "#6B7280", fontWeight: "600" },

  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "white", fontSize: 18, fontWeight: "900" },

  listCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "white",
    overflow: "hidden",
  },
  listRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listRowText: { fontSize: 18, fontWeight: "800", color: "#111827" },
  divider: { height: 1, backgroundColor: "rgba(0,0,0,0.06)" },

  footerHint: { textAlign: "center", color: "#9CA3AF", fontWeight: "600", marginTop: 2 },

  poweredBy: { alignItems: "center", gap: 8, paddingTop: 10 },
  poweredByText: { color: "#9CA3AF", fontWeight: "800" },

  // +15% größer
  leadradarLogo: { height: 30, width: 180 },
});
