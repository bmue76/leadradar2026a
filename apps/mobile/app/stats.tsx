import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { apiFetch } from "../src/lib/api";
import { clearApiKey, getApiKey } from "../src/lib/auth";
import { getActiveEventId } from "../src/lib/eventStorage";
import { PoweredBy } from "../src/ui/PoweredBy";
import MobileContentHeader from "../src/ui/MobileContentHeader";
import { UI } from "../src/ui/tokens";
import { ACCENT_HEX } from "../src/lib/mobileConfig";
import { useBranding } from "../src/features/branding/useBranding";

type JsonObject = Record<string, unknown>;

type StatsSummary = {
  leadsToday: number;
  avgPerHour: number;
  pendingAttachments: number;
  lastLeadAt: string | null;
  todayHourlyBuckets: Array<{ hour: number; count: number }>;
};

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function parseStats(data: unknown): StatsSummary {
  const obj = isObject(data) ? data : {};

  const buckets = Array.isArray(obj.todayHourlyBuckets)
    ? (obj.todayHourlyBuckets as Array<{ hour?: unknown; count?: unknown }>).map((it) => ({
        hour: Number(it.hour ?? 0),
        count: Number(it.count ?? 0),
      }))
    : [];

  return {
    leadsToday: Number(obj.leadsToday ?? 0),
    avgPerHour: Number(obj.avgPerHour ?? 0),
    pendingAttachments: Number(obj.pendingAttachments ?? 0),
    lastLeadAt: typeof obj.lastLeadAt === "string" ? obj.lastLeadAt : null,
    todayHourlyBuckets: buckets,
  };
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PerformanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>("");

  const [stats, setStats] = useState<StatsSummary>({
    leadsToday: 0,
    avgPerHour: 0,
    pendingAttachments: 0,
    lastLeadAt: null,
    todayHourlyBuckets: [],
  });

  const [activeEventId, setActiveEventIdState] = useState<string | null>(null);

  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;
  const accentColor = brandingState.kind === "ready" ? branding.accentColor ?? ACCENT_HEX : ACCENT_HEX;

  const scrollPadBottom = useMemo(
    () => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 48,
    [insets.bottom]
  );

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, [router]);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        router.replace("/provision");
        return;
      }

      const eventId = await getActiveEventId();
      setActiveEventIdState(eventId);

      const tzOffsetMinutes = String(new Date().getTimezoneOffset());

      const res = await apiFetch<unknown>({
        method: "GET",
        path: `/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(tzOffsetMinutes)}`,
        apiKey,
        timeoutMs: 20_000,
      });

      if (!res.ok) {
        const status = res.status ?? 0;
        const code = res.code ?? "";
        const msg = res.message || `HTTP ${status || "?"}`;

        if (status === 402 || code === "PAYMENT_REQUIRED") {
          router.replace("/license");
          return;
        }

        if (status === 401 || code === "INVALID_API_KEY") {
          await reActivate();
          return;
        }

        setError(msg);
        setStats({
          leadsToday: 0,
          avgPerHour: 0,
          pendingAttachments: 0,
          lastLeadAt: null,
          todayHourlyBuckets: [],
        });
        return;
      }

      setStats(parseStats(res.data));
    } finally {
      setBusy(false);
    }
  }, [reActivate, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => undefined;
    }, [load])
  );

  const strongestHour = useMemo(() => {
    if (stats.todayHourlyBuckets.length === 0) return null;
    const best = [...stats.todayHourlyBuckets].sort((a, b) => b.count - a.count)[0];
    return `${String(best.hour).padStart(2, "0")}:00 · ${best.count}`;
  }, [stats.todayHourlyBuckets]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: scrollPadBottom }]}>
        <MobileContentHeader title="Performance" logoDataUrl={logoDataUrl} />

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Heute</Text>
          <Text style={styles.title}>Ruhige KPI-Sicht statt Dashboard-Wand.</Text>
          <Text style={styles.text}>
            Fokus auf die wenigen Kennzahlen, die im Einsatz wirklich helfen.
          </Text>
        </View>

        {busy ? (
          <View style={styles.card}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Performance wird geladen…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>Hinweis</Text>
            <Text style={styles.warnText}>{error}</Text>
            <View style={styles.row}>
              <Pressable style={[styles.secondaryBtn, styles.secondaryBtnLeft]} onPress={load}>
                <Text style={styles.secondaryBtnText}>Erneut laden</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={reActivate}>
                <Text style={styles.secondaryBtnText}>Neu aktivieren</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, styles.kpiCardLeft]}>
            <Text style={styles.kpiLabel}>Leads heute</Text>
            <Text style={styles.kpiValue}>{stats.leadsToday}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Ø pro Stunde</Text>
            <Text style={styles.kpiValue}>{stats.avgPerHour.toFixed(1)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Zusatzinfos</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Aktives Event</Text>
            <Text style={styles.infoValue}>{activeEventId ?? "—"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Offene Attachments</Text>
            <Text style={styles.infoValue}>{stats.pendingAttachments}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Letzter Lead</Text>
            <Text style={styles.infoValue}>{fmtDateTime(stats.lastLeadAt)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Stärkste Stunde</Text>
            <Text style={styles.infoValue}>{strongestHour ?? "—"}</Text>
          </View>
        </View>

        <Pressable style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={() => router.push("/capture")}>
          <Text style={styles.primaryBtnText}>Lead erfassen</Text>
        </Pressable>

        <PoweredBy />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  body: {
    paddingHorizontal: UI.padX,
    paddingTop: 8,
    gap: 14,
  },
  hero: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 18,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: UI.text,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
    color: UI.text,
    letterSpacing: -0.3,
  },
  text: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
    alignItems: "flex-start",
  },
  warnCard: {
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,120,120,0.28)",
    padding: 16,
  },
  warnTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 6,
  },
  warnText: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(0,0,0,0.56)",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
  },
  kpiCardLeft: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(0,0,0,0.48)",
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: "900",
    color: UI.text,
    letterSpacing: -0.4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 10,
  },
  infoRow: {
    width: "100%",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(0,0,0,0.48)",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: UI.text,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryBtnLeft: {
    flex: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: UI.text,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
});
