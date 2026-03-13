import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { apiFetch } from "../src/lib/api";
import { clearApiKey, getApiKey } from "../src/lib/auth";
import { getActiveEventId, setActiveEventId } from "../src/lib/eventStorage";
import { AppHeader } from "../src/ui/AppHeader";
import { PoweredBy } from "../src/ui/PoweredBy";
import { UI } from "../src/ui/tokens";
import { useBranding } from "../src/features/branding/useBranding";
import { ACCENT_HEX } from "../src/lib/mobileConfig";

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

    out.push({
      id,
      name: pickString(it.name) ?? id,
      startsAt: typeof it.startsAt === "string" ? it.startsAt : null,
      endsAt: typeof it.endsAt === "string" ? it.endsAt : null,
      location: typeof it.location === "string" ? it.location : null,
    });
  }
  return out;
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function resolveNextPath(eventId: string, next?: string | null): string {
  if (next === "forms") return `/forms?eventId=${encodeURIComponent(eventId)}`;
  if (next === "capture") return "/capture";
  return "/home";
}

export default function EventGate() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ next?: string }>();
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

  const nextTarget = typeof params.next === "string" ? params.next : null;

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, []);

  const goNext = useCallback(
    (eventId: string) => {
      router.replace(resolveNextPath(eventId, nextTarget));
    },
    [nextTarget]
  );

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
        goNext(evs[0].id);
        return;
      }

      if (currentActiveId && evs.length > 0 && !evs.some((e) => e.id === currentActiveId)) {
        setActiveIdState(null);
      }
    } finally {
      setBusy(false);
    }
  }, [goNext, reActivate]);

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
              Für dieses Konto sind aktuell keine aktiven Messen verfügbar. Bitte im Admin prüfen.
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
            const d1 = fmtDate(item.startsAt);
            const d2 = fmtDate(item.endsAt);

            return (
              <Pressable
                onPress={async () => {
                  await setActiveEventId(item.id);
                  setActiveIdState(item.id);
                  goNext(item.id);
                }}
                style={[styles.eventCard, selected ? styles.eventCardSelected : null]}
              >
                <Text style={[styles.eventTitle, selected ? styles.eventTitleSelected : null]}>{item.name}</Text>
                <Text style={[styles.eventId, selected ? styles.eventIdSelected : null]}>{item.id}</Text>

                {item.location ? (
                  <Text style={[styles.meta, selected ? styles.metaSelected : null]}>{item.location}</Text>
                ) : null}

                {d1 || d2 ? (
                  <Text style={[styles.meta, selected ? styles.metaSelected : null]}>
                    {d1 ?? "—"} {d2 ? `– ${d2}` : ""}
                  </Text>
                ) : null}

                <View style={styles.pickRow}>
                  <Text style={[styles.pickText, selected ? styles.pickTextSelected : null]}>
                    {selected ? "Aktiv" : "Auswählen"}
                  </Text>
                  <IoniconsLike selected={selected} />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function IoniconsLike({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.dot, selected ? styles.dotActive : null]} />
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: UI.padX,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(0,0,0,0.56)",
  },
  body: {
    flex: 1,
    paddingHorizontal: UI.padX,
    paddingTop: 8,
  },
  list: {
    paddingHorizontal: UI.padX,
    paddingTop: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
  },
  warnCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
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
  mono: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(0,0,0,0.48)",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  btnDark: {
    backgroundColor: UI.text,
  },
  btnDarkText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  btnGhost: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: UI.border,
  },
  btnGhostText: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "900",
  },
  h2: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 8,
  },
  p: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
  eventCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
    marginBottom: 10,
  },
  eventCardSelected: {
    borderColor: ACCENT_HEX,
    backgroundColor: "rgba(255,255,255,0.98)",
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 6,
  },
  eventTitleSelected: {
    color: UI.text,
  },
  eventId: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(0,0,0,0.48)",
    marginBottom: 6,
  },
  eventIdSelected: {
    color: ACCENT_HEX,
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(0,0,0,0.62)",
    marginBottom: 4,
  },
  metaSelected: {
    color: "rgba(0,0,0,0.72)",
  },
  pickRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickText: {
    fontSize: 13,
    fontWeight: "900",
    color: "rgba(0,0,0,0.62)",
  },
  pickTextSelected: {
    color: ACCENT_HEX,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  dotActive: {
    backgroundColor: ACCENT_HEX,
  },
});
