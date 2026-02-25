import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";

import { apiFetch } from "../src/lib/api";
import { clearApiKey, getApiKey } from "../src/lib/auth";
import { getLastActiveEventId, setActiveEventId } from "../src/lib/eventStorage";
import { useBranding } from "../src/features/branding/useBranding";
import { AppHeader } from "../src/ui/AppHeader";
import { PoweredBy } from "../src/ui/PoweredBy";
import { UI } from "../src/ui/tokens";

type JsonObject = Record<string, unknown>;
type ApiErrorShape = { code?: unknown; message?: unknown; details?: unknown };
type ApiRespShape =
  | { ok: true; data?: unknown; traceId?: unknown }
  | { ok: false; error?: ApiErrorShape; traceId?: unknown; status?: unknown; message?: unknown };

type EventItem = {
  id: string;
  name: string;
  status?: string;
  location?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}
function isApiResp(v: unknown): v is ApiRespShape {
  return isObject(v) && typeof (v as { ok?: unknown }).ok === "boolean";
}
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asNullableString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function extractError(res: ApiRespShape): { status: number; code: string; message: string; traceId: string } {
  const traceId = typeof res.traceId === "string" ? res.traceId : "";
  const status = typeof (res as { status?: unknown }).status === "number" ? (res as { status: number }).status : 0;
  const err = (res as { error?: ApiErrorShape }).error;
  const code = err && typeof err.code === "string" ? err.code : "";
  const msgFromErr = err && typeof err.message === "string" ? err.message : "";
  const msgTop = typeof (res as { message?: unknown }).message === "string" ? (res as { message: string }).message : "";
  const message = msgFromErr || msgTop || "Request failed";
  return { status, code, message, traceId };
}
function normalizeEvents(data: unknown): EventItem[] {
  if (!Array.isArray(data)) return [];
  const out: EventItem[] = [];
  for (const r of data) {
    if (!isObject(r)) continue;
    const id = asString(r.id).trim();
    const name = asString(r.name).trim();
    if (!id || !name) continue;
    out.push({
      id,
      name,
      status: asString(r.status) || undefined,
      location: asNullableString(r.location),
      startsAt: asNullableString(r.startsAt),
      endsAt: asNullableString(r.endsAt),
    });
  }
  return out;
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("de-CH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function EventPickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const tenantName = brandingState.kind === "ready" ? branding.tenantName : null;
  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;

  const [items, setItems] = useState<EventItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string>("");

  const [lastId, setLastId] = useState<string | null>(null);

  const listPadBottom = useMemo(() => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 28, [insets.bottom]);

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, [router]);

  const load = useCallback(async () => {
    setErrorText("");
    setBusy(true);

    try {
      const key = await getApiKey();
      if (!key) {
        router.replace("/provision");
        return;
      }

      const last = await getLastActiveEventId();
      setLastId(last);

      const raw = await apiFetch({
        method: "GET",
        path: "/api/mobile/v1/events/active",
        apiKey: key,
      });

      if (!isApiResp(raw)) {
        setErrorText("Ungültige API-Antwort (Shape).");
        setItems([]);
        return;
      }

      if (!raw.ok) {
        const { status, code, message, traceId } = extractError(raw);

        if (status === 402 || code === "PAYMENT_REQUIRED") {
          router.replace("/license");
          return;
        }

        if (status === 401 || code === "INVALID_API_KEY") {
          await reActivate();
          return;
        }

        setErrorText(`HTTP ${status || "?"} — ${message}${traceId ? ` (traceId: ${traceId})` : ""}`);
        setItems([]);
        return;
      }

      const events = normalizeEvents(raw.data);
      setItems(events);

      if (events.length === 0) {
        router.replace("/event-gate");
        return;
      }

      if (events.length === 1) {
        await setActiveEventId(events[0].id);
        router.replace("/forms");
        return;
      }
    } finally {
      setBusy(false);
    }
  }, [reActivate, router]);

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

  const onPick = useCallback(
    async (ev: EventItem) => {
      await setActiveEventId(ev.id);
      router.replace("/forms");
    },
    [router]
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />
      <AppHeader title="Event auswählen" tenantName={tenantName} logoDataUrl={logoDataUrl} />

      <View style={[styles.body, { paddingBottom: listPadBottom }]}>
        {errorText ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>Hinweis</Text>
            <Text style={styles.warnText}>{errorText}</Text>

            <View style={styles.row}>
              <Pressable onPress={load} style={[styles.btn, styles.btnDark]}>
                <Text style={styles.btnDarkText}>Retry</Text>
              </Pressable>

              <Pressable onPress={reActivate} style={[styles.btn, styles.btnAccent]}>
                <Text style={styles.btnAccentText}>Neu aktivieren</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.h2}>Aktive Events</Text>
          <Text style={styles.p}>Wähle das Event, für das du Leads erfassen möchtest.</Text>
        </View>

        {busy && items.length === 0 ? (
          <View style={styles.card}>
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <Text style={styles.p}>Lade…</Text>
            </View>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          {items.map((ev) => {
            const isLast = !!lastId && ev.id === lastId;
            const d1 = fmtDate(ev.startsAt);
            const d2 = fmtDate(ev.endsAt);
            const dateLine = d1 && d2 ? `${d1} – ${d2}` : d1 ? d1 : d2 ? d2 : null;

            return (
              <Pressable key={ev.id} onPress={() => void onPick(ev)} style={styles.eventCard}>
                <View style={styles.eventTop}>
                  <Text style={styles.eventTitle}>{ev.name}</Text>
                  {isLast ? <Text style={styles.pill}>Letztes</Text> : null}
                </View>

                {ev.location || dateLine ? (
                  <Text style={styles.eventMeta}>
                    {ev.location ? ev.location : "—"}
                    {ev.location && dateLine ? " • " : ""}
                    {dateLine ? dateLine : ""}
                  </Text>
                ) : (
                  <Text style={styles.eventMeta}>—</Text>
                )}

                <Text style={styles.eventId}>{ev.id}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 10 }}>
          <Pressable onPress={() => void onRefresh()} style={[styles.btnWide, styles.btnDark]}>
            <Text style={styles.btnDarkText}>Aktualisieren</Text>
          </Pressable>
        </View>

        <PoweredBy />
      </View>

      {/* Pull-to-refresh alternative (simple) */}
      <View style={{ position: "absolute", left: -9999, top: -9999 }}>
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },
  body: { paddingHorizontal: UI.padX, paddingTop: 14, gap: 12 },

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

  h2: { fontWeight: "900", color: UI.text, fontSize: 16 },
  p: { marginTop: 6, opacity: 0.75, color: UI.text },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  eventCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.bg,
  },
  eventTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  eventTitle: { fontWeight: "900", color: UI.text, flexShrink: 1 },
  eventMeta: { marginTop: 6, opacity: 0.75, color: UI.text, fontWeight: "700" },
  eventId: { opacity: 0.7, marginTop: 6, fontFamily: "monospace", color: UI.text },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.9)",
    fontWeight: "900",
    fontSize: 12,
    color: UI.accent,
  },

  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnWide: { paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnDark: { backgroundColor: UI.text },
  btnDarkText: { color: "white", fontWeight: "900" },
  btnAccent: { backgroundColor: UI.accent },
  btnAccentText: { color: "white", fontWeight: "900" },
});
