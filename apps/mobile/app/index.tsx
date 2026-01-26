import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "../src/lib/api";
import { getApiKey } from "../src/lib/auth";
import { ScreenScaffold } from "../src/ui/ScreenScaffold";
import { UI } from "../src/ui/tokens";

type ActiveEventResp = { item?: { id: string; name: string } | null };

type StatsMeResponse = {
  leadsToday: number;
  avgPerHour: number;
  pendingAttachments: number;
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

function unwrapOkData<T>(res: unknown): T | null {
  if (!isRecord(res) || typeof res.ok !== "boolean") return null;
  if (res.ok !== true) return null;
  return (res as { data?: unknown }).data as T;
}

export default function Home() {
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);

  const [activeEventName, setActiveEventName] = useState<string | null>(null);

  const [todayLeads, setTodayLeads] = useState<number>(0);
  const [todayLph, setTodayLph] = useState<number>(0);
  const [todayAttachments, setTodayAttachments] = useState<number>(0);

  const loadAll = useCallback(async () => {
    const key = await getApiKey();
    if (!key) {
      router.replace("/provision");
      return;
    }

    // Active Event
    {
      const res = await apiFetch({
        method: "GET",
        path: "/api/mobile/v1/events/active",
        apiKey: key,
      });

      const data = unwrapOkData<ActiveEventResp>(res);
      setActiveEventName(data?.item?.name ?? null);
    }

    // Stats me (today)
    {
      const tzOffsetMinutes = new Date().getTimezoneOffset();
      const path = `/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(String(tzOffsetMinutes))}`;

      const res = await apiFetch({
        method: "GET",
        path,
        apiKey: key,
      });

      const s = unwrapOkData<StatsMeResponse>(res);

      // Contract: leadsToday / avgPerHour / pendingAttachments
      if (s && isRecord(s)) {
        setTodayLeads(pickNumber((s as Record<string, unknown>).leadsToday));
        setTodayLph(pickNumber((s as Record<string, unknown>).avgPerHour));
        setTodayAttachments(pickNumber((s as Record<string, unknown>).pendingAttachments));
      } else {
        setTodayLeads(0);
        setTodayLph(0);
        setTodayAttachments(0);
      }
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

  const bottomPad = 18 + Math.max(insets.bottom, 10) + UI.tabBarBaseHeight;

  return (
    <ScreenScaffold title="Home" scroll={false}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aktives Event</Text>
          {activeEventName ? (
            <Text style={styles.cardText}>{activeEventName}</Text>
          ) : (
            <Text style={styles.cardMuted}>Kein aktives Event gefunden.</Text>
          )}

          <Pressable onPress={onRefresh} style={[styles.btn, styles.btnLight]}>
            <Text style={styles.btnLightText}>Aktualisieren</Text>
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
              <Text style={styles.statLabel}>Follow-ups</Text>
              <Text style={styles.statValue}>{todayAttachments}</Text>
            </View>
          </View>

          <Text style={styles.smallHint}>Weitere Statistiken im „Stats“-Tab</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/forms")} style={[styles.btn, styles.btnAccent]}>
          <Text style={styles.btnAccentText}>Lead erfassen</Text>
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
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: UI.padX, paddingTop: 14, gap: 14 },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.bg,
    padding: 16,
  },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 18, fontWeight: "900", color: UI.text },
  cardText: { marginTop: 6, fontSize: 16, color: UI.text },
  cardMuted: { marginTop: 6, fontSize: 16, color: "rgba(17,24,39,0.55)" },
  chev: { fontSize: 22, fontWeight: "900", color: "rgba(17,24,39,0.35)" },

  btn: { borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  btnAccent: { backgroundColor: UI.accent },
  btnAccentText: { color: "white", fontSize: 18, fontWeight: "900" },
  btnLight: { backgroundColor: "rgba(17,24,39,0.06)", marginTop: 12 },
  btnLightText: { fontWeight: "900", color: UI.text },

  statsRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  statBox: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.06)",
    padding: 12,
  },
  statLabel: { color: "rgba(17,24,39,0.55)", fontWeight: "900" },
  statValue: { marginTop: 6, fontSize: 26, fontWeight: "900", color: UI.text },
  smallHint: { marginTop: 10, color: "rgba(17,24,39,0.55)", fontWeight: "700" },

  listCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.bg,
    overflow: "hidden",
  },
  listRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listRowText: { fontSize: 18, fontWeight: "900", color: UI.text },
  divider: { height: 1, backgroundColor: "rgba(17,24,39,0.06)" },

  footerHint: { textAlign: "center", color: "rgba(17,24,39,0.35)", fontWeight: "700", marginTop: 2 },
});
