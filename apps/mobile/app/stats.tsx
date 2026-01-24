import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { apiFetch } from "../src/lib/api";
import { clearApiKey, getApiKey } from "../src/lib/auth";
import { ScreenScaffold } from "../src/ui/ScreenScaffold";
import { UI } from "../src/ui/tokens";

type ApiErrorShape = {
  code?: string;
  message?: string;
  details?: unknown;
};

type ApiOk<T> = { ok: true; data: T; traceId?: string };
type ApiErr = { ok: false; error?: ApiErrorShape; traceId?: string; status?: number; message?: string };
type ApiEnvelope<T> = ApiOk<T> | ApiErr;

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

function isEnvelope<T>(v: unknown): v is ApiEnvelope<T> {
  if (!isRecord(v)) return false;
  if (v.ok === true) return "data" in v;
  if (v.ok === false) return true;
  return false;
}

function unwrapOk<T>(v: unknown): T {
  if (!isEnvelope<T>(v)) throw new Error("Invalid API response shape");
  if (v.ok) return v.data;

  const msg =
    (typeof v.error?.message === "string" && v.error.message) ||
    (typeof v.message === "string" && v.message) ||
    "Request failed.";

  throw new Error(msg);
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

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const key = await getApiKey();
      if (!key) {
        router.replace("/provision");
        return;
      }

      const tzOffsetMinutes = new Date().getTimezoneOffset();
      const path = `/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(String(tzOffsetMinutes))}`;

      const res = await apiFetch({ method: "GET", path, apiKey: key });
      const s = unwrapOk<StatsMeResponse>(res);

      setData({
        leadsToday: Number(s?.leadsToday ?? 0),
        avgPerHour: Number(s?.avgPerHour ?? 0),
        pendingAttachments: Number(s?.pendingAttachments ?? 0),
        lastLeadAt: s?.lastLeadAt ?? null,
        todayHourlyBuckets: Array.isArray(s?.todayHourlyBuckets) ? s.todayHourlyBuckets : [],
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
    <ScreenScaffold title="Stats">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
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

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable style={[styles.btn, styles.btnAccent]} onPress={refresh}>
                <Text style={styles.btnText}>Retry</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnDark]} onPress={reActivate}>
                <Text style={styles.btnText}>Neu aktivieren</Text>
              </Pressable>
            </View>
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
              {data.todayHourlyBuckets.length === 0 && <Text style={styles.cardSub}>Noch keine Daten für heute.</Text>}
            </View>

            <Text style={styles.cardSub}>
              {data.lastLeadAt ? `Letzter Lead um ${new Date(data.lastLeadAt).toLocaleTimeString()}` : "Noch kein Lead heute."}
            </Text>

            <Pressable style={[styles.btn, styles.btnAccent, { marginTop: 12 }]} onPress={refresh}>
              <Text style={styles.btnText}>Statistik aktualisieren</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.hint}>Pull to refresh</Text>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: "row",
    backgroundColor: UI.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    overflow: "hidden",
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
  segmentActive: { backgroundColor: UI.accent },
  segmentText: { fontWeight: "800", color: UI.text, opacity: 0.9 },
  segmentTextActive: { color: "#FFF", opacity: 1 },

  loadingWrap: { padding: 16, alignItems: "center", gap: 10 },
  loadingText: { color: "rgba(17,24,39,0.6)" },

  card: {
    backgroundColor: UI.bg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: UI.border,
  },
  warnCard: { borderColor: "rgba(220,38,38,0.25)", backgroundColor: "rgba(220,38,38,0.06)" },

  cardTitle: { fontSize: 16, fontWeight: "900", color: UI.text },
  cardSub: { marginTop: 8, fontSize: 13, color: "rgba(17,24,39,0.65)" },

  statsRow: { flexDirection: "row", alignItems: "stretch", marginTop: 12 },
  statBox: { flex: 1 },
  statLabel: { fontSize: 12, color: "rgba(17,24,39,0.55)" },
  statValue: { marginTop: 6, fontSize: 22, fontWeight: "900", color: UI.text },
  divider: { width: 1, backgroundColor: "rgba(17,24,39,0.08)", marginHorizontal: 12 },

  badge: {
    marginTop: 6,
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(17,24,39,0.75)",
    backgroundColor: "rgba(17,24,39,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },

  bars: { marginTop: 14, flexDirection: "row", alignItems: "flex-end", gap: 8, minHeight: 66 },
  bar: { width: 12, borderRadius: 8, backgroundColor: "rgba(17,24,39,0.12)" },

  btn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", flex: 1 },
  btnAccent: { backgroundColor: UI.accent },
  btnDark: { backgroundColor: UI.text },
  btnText: { color: "#FFF", fontWeight: "900" },

  hint: { marginTop: 6, textAlign: "center", color: "rgba(17,24,39,0.45)", fontSize: 12 },
});
