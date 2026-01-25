import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { apiFetch } from "../src/lib/api";
import { ScreenScaffold } from "../src/ui/ScreenScaffold";
import { UI } from "../src/ui/tokens";

type StatsMeResponse = {
  leadsToday: number;
  avgPerHour: number;
  pendingAttachments: number;
  lastLeadAt?: string | null;
  todayHourlyBuckets?: Array<{ hour: number; count: number }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function extractErrorMessage(res: unknown): string {
  if (!isRecord(res)) return "Request failed.";
  const err = res.error;
  if (isRecord(err) && typeof err.message === "string") return err.message;
  if (typeof res.message === "string") return res.message;
  return "Request failed.";
}

export default function Stats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<Required<StatsMeResponse>>({
    leadsToday: 0,
    avgPerHour: 0,
    pendingAttachments: 0,
    lastLeadAt: null,
    todayHourlyBuckets: [],
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tzOffsetMinutes = new Date().getTimezoneOffset();
      const path = `/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(String(tzOffsetMinutes))}`;

      const res = await apiFetch({ method: "GET", path });

      if (!isRecord(res) || typeof res.ok !== "boolean") throw new Error("Invalid API response.");
      if (res.ok !== true) throw new Error(extractErrorMessage(res));

      const s = (res.data ?? {}) as Partial<StatsMeResponse>;

      setData({
        leadsToday: pickNumber(s.leadsToday),
        avgPerHour: pickNumber(s.avgPerHour),
        pendingAttachments: pickNumber(s.pendingAttachments),
        lastLeadAt: s.lastLeadAt ?? null,
        todayHourlyBuckets: Array.isArray(s.todayHourlyBuckets) ? s.todayHourlyBuckets : [],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScreenScaffold title="Statistik" refreshing={loading} onRefresh={refresh}>
      <View style={styles.segment}>
        <View style={[styles.segmentBtn, styles.segmentActive]}>
          <Text style={[styles.segmentText, styles.segmentTextActive]}>Ich</Text>
        </View>
        <View style={styles.segmentBtn}>
          <Text style={styles.segmentText}>Event</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Lade…</Text>
        </View>
      ) : error ? (
        <View style={[styles.card, styles.warnCard]}>
          <Text style={styles.cardTitle}>Fehler</Text>
          <Text style={styles.cardSub}>{error}</Text>
          <Pressable style={styles.primaryBtn} onPress={refresh}>
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meine Statistik heute</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Leads</Text>
              <Text style={styles.statValue}>{data.leadsToday}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Ø pro Stunde</Text>
              <Text style={styles.statValue}>{data.avgPerHour}/h</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Follow-ups</Text>
              <Text style={styles.statValue}>{data.pendingAttachments}</Text>
              <Text style={styles.badge}>Pending</Text>
            </View>
          </View>

          <View style={styles.bars}>
            {data.todayHourlyBuckets.slice(-12).map((b) => {
              const h = Math.max(6, Math.min(60, b.count * 8));
              return <View key={String(b.hour)} style={[styles.bar, { height: h }]} />;
            })}
            {data.todayHourlyBuckets.length === 0 && (
              <Text style={styles.cardSub}>Noch keine Daten für heute.</Text>
            )}
          </View>

          <Text style={styles.cardSub}>
            {data.lastLeadAt
              ? `Letzter Lead um ${new Date(data.lastLeadAt).toLocaleTimeString()}`
              : "Noch kein Lead heute."}
          </Text>

          <Pressable style={[styles.primaryBtn, { marginTop: 12 }]} onPress={refresh}>
            <Text style={styles.primaryBtnText}>Statistik aktualisieren</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.hint}>Pull to refresh</Text>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ECECEC",
    overflow: "hidden",
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
  segmentActive: { backgroundColor: UI.accent },
  segmentText: { fontWeight: "700", color: "#333" },
  segmentTextActive: { color: "#FFF" },

  loadingWrap: { padding: 16, alignItems: "center", gap: 10 },
  loadingText: { color: "#666" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ECECEC",
  },
  warnCard: { borderColor: "#F0D6D6" },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#111" },
  cardSub: { marginTop: 8, fontSize: 13, color: "#666" },

  statsRow: { flexDirection: "row", alignItems: "stretch", marginTop: 12 },
  statBox: { flex: 1 },
  statLabel: { fontSize: 12, color: "#777" },
  statValue: { marginTop: 6, fontSize: 22, fontWeight: "900", color: "#111" },
  divider: { width: 1, backgroundColor: "#EFEFEF", marginHorizontal: 12 },
  badge: {
    marginTop: 6,
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    color: "#555",
    backgroundColor: "#EFEFEF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },

  bars: { marginTop: 14, flexDirection: "row", alignItems: "flex-end", gap: 8, minHeight: 66 },
  bar: { width: 12, borderRadius: 8, backgroundColor: "#D9E2F2" },

  primaryBtn: { backgroundColor: UI.accent, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { color: "#FFF", fontWeight: "900" },

  hint: { textAlign: "center", color: "#888", fontSize: 12 },
});
