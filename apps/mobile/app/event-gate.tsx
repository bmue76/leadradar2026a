import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { apiFetch } from "../src/lib/api";
import { clearApiKey, getApiKey } from "../src/lib/auth";
import { getActiveEventId, setActiveEventId } from "../src/lib/eventStorage";
import { AppHeader } from "../src/ui/AppHeader";
import { PoweredBy } from "../src/ui/PoweredBy";
import { UI } from "../src/ui/tokens";
import { useBranding } from "../src/features/branding/useBranding";

type JsonObject = Record<string, unknown>;

type EventItem = {
  id: string;
  name: string;
  startsAt?: string | null;
  endsAt?: string | null;
  location?: string | null;
};

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function parseEvents(data: unknown): EventItem[] {
  const arr = Array.isArray(data)
    ? data
    : isObject(data) && Array.isArray(data.events)
      ? (data.events as unknown[])
      : isObject(data) && Array.isArray(data.items)
        ? (data.items as unknown[])
        : [];

  const out: EventItem[] = [];
  for (const it of arr) {
    if (!isObject(it)) continue;
    const id = pickString(it.id);
    if (!id) continue;

    const name = pickString(it.name) ?? id;
    const startsAt = typeof it.startsAt === "string" ? it.startsAt : null;
    const endsAt = typeof it.endsAt === "string" ? it.endsAt : null;
    const location = typeof it.location === "string" ? it.location : null;

    out.push({ id, name, startsAt, endsAt, location });
  }
  return out;
}

export default function EventGate() {
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const tenantName = brandingState.kind === "ready" ? branding.tenantName : null;
  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;

  const [items, setItems] = useState<EventItem[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [errorTitle, setErrorTitle] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [traceId, setTraceId] = useState<string>("");

  const listPadBottom = useMemo(
    () => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 28,
    [insets.bottom]
  );

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, []);

  const goForms = useCallback((eventId: string) => {
    router.replace(`/forms?eventId=${encodeURIComponent(eventId)}`);
  }, []);

  const load = useCallback(async () => {
    setErrorTitle("");
    setErrorDetail("");
    setTraceId("");
    setBusy(true);

    try {
      const key = await getApiKey();
      if (!key) {
        router.replace("/provision");
        return;
      }

      const currentActiveId = await getActiveEventId();
      if (currentActiveId) setActiveIdState(currentActiveId);

      const res = await apiFetch<unknown>({
        method: "GET",
        path: "/api/mobile/v1/events/active",
        apiKey: key,
        timeoutMs: 25_000,
      });

      if (!res.ok) {
        const status = res.status ?? 0;
        const code = res.code ?? "";
        const tid = res.traceId ?? "";

        if (status === 402 || code === "PAYMENT_REQUIRED") {
          router.replace("/license");
          return;
        }

        if (status === 401 || code === "INVALID_API_KEY") {
          await reActivate();
          return;
        }

        setItems([]);
        setErrorTitle("Konnte Events nicht laden.");
        setErrorDetail(`${res.message || `HTTP ${status || "?"}`}${tid ? ` (traceId: ${tid})` : ""}`);
        setTraceId(tid);
        return;
      }

      const evs = parseEvents(res.data);
      setItems(evs);

      if (evs.length === 1) {
        await setActiveEventId(evs[0].id);
        setActiveIdState(evs[0].id);
        goForms(evs[0].id);
        return;
      }

      if (currentActiveId && evs.length > 0 && !evs.some((e) => e.id === currentActiveId)) {
        setActiveIdState(null);
      }
    } finally {
      setBusy(false);
    }
  }, [goForms, reActivate]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const showLoading = busy && items.length === 0 && !errorTitle;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />
      <AppHeader title="Event wählen" tenantName={tenantName} logoDataUrl={logoDataUrl} />

      {showLoading ? (
        <View style={[styles.center, { paddingBottom: listPadBottom }]}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Events werden geladen …</Text>
          <PoweredBy />
        </View>
      ) : errorTitle ? (
        <View style={[styles.body, { paddingBottom: listPadBottom }]}>
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>{errorTitle}</Text>
            <Text style={styles.warnText}>{errorDetail || "Bitte nochmals versuchen."}</Text>
            {traceId ? <Text style={styles.mono}>traceId: {traceId}</Text> : null}

            <View style={styles.row}>
              <Pressable onPress={load} style={[styles.btn, styles.btnDark]}>
                <Text style={styles.btnDarkText}>Erneut versuchen</Text>
              </Pressable>

              <Pressable onPress={reActivate} style={[styles.btn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>Neu aktivieren</Text>
              </Pressable>
            </View>
          </View>

          <PoweredBy />
        </View>
      ) : !busy && items.length === 0 ? (
        <View style={[styles.body, { paddingBottom: listPadBottom }]}>
          <View style={styles.card}>
            <Text style={styles.h2}>Keine aktiven Events.</Text>
            <Text style={styles.p}>
              Für dieses Konto sind aktuell keine aktiven Messen verfügbar. Bitte im Admin prüfen (Event aktiv).
            </Text>

            <View style={styles.row}>
              <Pressable onPress={load} style={[styles.btn, styles.btnDark, { marginTop: 10 }]}>
                <Text style={styles.btnDarkText}>Aktualisieren</Text>
              </Pressable>

              <Pressable onPress={reActivate} style={[styles.btn, styles.btnGhost, { marginTop: 10 }]}>
                <Text style={styles.btnGhostText}>Neu aktivieren</Text>
              </Pressable>
            </View>
          </View>

          <PoweredBy />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={[styles.list, { paddingBottom: listPadBottom }]}
          ListFooterComponent={<PoweredBy />}
          renderItem={({ item }) => {
            const selected = item.id === activeId;
            return (
              <Pressable
                onPress={async () => {
                  await setActiveEventId(item.id);
                  setActiveIdState(item.id);
                  goForms(item.id);
                }}
                style={[styles.eventCard, selected ? styles.eventCardSelected : null]}
              >
                <Text style={[styles.eventTitle, selected ? styles.eventTitleSelected : null]}>{item.name}</Text>
                <Text style={[styles.eventId, selected ? styles.eventIdSelected : null]}>{item.id}</Text>
                {item.location ? (
                  <Text style={[styles.meta, selected ? styles.metaSelected : null]}>{item.location}</Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: UI.padX },
  loadingText: { opacity: 0.7, fontWeight: "800", color: UI.text },

  body: { paddingHorizontal: UI.padX, paddingTop: 14, gap: 12 },
  list: { paddingHorizontal: UI.padX, paddingTop: 14 },

  card: {
    backgroundColor: UI.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
  },

  warnCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.25)",
    backgroundColor: "rgba(220,38,38,0.06)",
  },
  warnTitle: { fontWeight: "900", color: "rgba(153,27,27,0.95)" },
  warnText: { marginTop: 6, color: "rgba(153,27,27,0.95)" },
  mono: { marginTop: 8, fontFamily: "monospace", color: UI.text, opacity: 0.75 },

  row: { flexDirection: "row", gap: 10, marginTop: 12 },

  btn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnDark: { backgroundColor: UI.text },
  btnDarkText: { color: "white", fontWeight: "900" },

  btnGhost: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  btnGhostText: { fontWeight: "900", color: "rgba(0,0,0,0.55)" },

  h2: { fontWeight: "900", color: UI.text },
  p: { marginTop: 6, opacity: 0.75, color: UI.text },

  eventCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    marginBottom: 10,
    backgroundColor: UI.bg,
  },
  eventCardSelected: {
    borderColor: UI.text,
    backgroundColor: "rgba(17,24,39,0.04)",
  },

  eventTitle: { fontWeight: "900", color: UI.text, marginBottom: 6 },
  eventTitleSelected: { color: UI.text },

  eventId: { opacity: 0.7, fontFamily: "monospace", color: UI.text, marginBottom: 6 },
  eventIdSelected: { opacity: 0.9 },

  meta: { opacity: 0.8, color: UI.text },
  metaSelected: { opacity: 0.95 },
});
