import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking as RNLinking, Pressable, StyleSheet, Text, View } from "react-native";
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
import { ADMIN_URL } from "../src/lib/mobileConfig";

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

type UiState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready"; events: EventItem[] }
  | { kind: "error"; message: string; traceId?: string; code?: string; status?: number };

export default function EventGateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const tenantName = brandingState.kind === "ready" ? branding.tenantName : null;
  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;

  const [state, setState] = useState<UiState>({ kind: "loading" });

  const padBottom = useMemo(() => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 28, [insets.bottom]);

  const goProvision = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, [router]);

  const openAdmin = useCallback(async () => {
    if (!ADMIN_URL) {
      Alert.alert("Admin", "ADMIN_URL ist nicht gesetzt. Öffne das Admin im Browser.");
      return;
    }
    try {
      await RNLinking.openURL(ADMIN_URL);
    } catch {
      Alert.alert("Admin öffnen", "Konnte Admin-URL nicht öffnen.");
    }
  }, []);

  const load = useCallback(async () => {
    setState({ kind: "loading" });

    const key = await getApiKey();
    if (!key) {
      router.replace("/provision");
      return;
    }

    const raw = await apiFetch({
      method: "GET",
      path: "/api/mobile/v1/events/active",
      apiKey: key,
    });

    if (!isApiResp(raw)) {
      setState({ kind: "error", message: "Ungültige API-Antwort (Shape)." });
      return;
    }

    if (!raw.ok) {
      const { status, code, message, traceId } = extractError(raw);

      if (status === 402 || code === "PAYMENT_REQUIRED") {
        router.replace("/license");
        return;
      }

      if (status === 401 || code === "INVALID_API_KEY") {
        await goProvision();
        return;
      }

      setState({ kind: "error", message: `HTTP ${status || "?"} — ${message}`, traceId, code, status });
      return;
    }

    const events = normalizeEvents(raw.data);

    if (events.length === 0) {
      setState({ kind: "empty" });
      return;
    }

    // 1 active event => auto-select
    if (events.length === 1) {
      await setActiveEventId(events[0].id);
      router.replace("/forms");
      return;
    }

    // >1 => picker (optionally preselect last)
    const last = await getLastActiveEventId();
    if (last && events.some((e) => e.id === last)) {
      // MVP-lean: still show picker, but we can set as current selection hint in picker screen via lastActive store.
      // (Picker reads lastActive from storage)
    }

    setState({ kind: "ready", events });
    router.replace("/events");
  }, [goProvision, router]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />
      <AppHeader title="Event wählen" tenantName={tenantName} logoDataUrl={logoDataUrl} />

      <View style={[styles.body, { paddingBottom: padBottom }]}>
        {state.kind === "loading" ? (
          <View style={styles.card}>
            <View style={styles.row}>
              <ActivityIndicator />
              <Text style={styles.p}>Lade aktive Events…</Text>
            </View>
          </View>
        ) : null}

        {state.kind === "empty" ? (
          <>
            <View style={styles.card}>
              <Text style={styles.h2}>Keine aktive Messe</Text>
              <Text style={styles.p}>Im Moment ist kein Event aktiv. Aktiviere ein Event im Admin unter „Events“.</Text>

              <View style={{ marginTop: 12, gap: 10 }}>
                <Pressable onPress={load} style={[styles.btn, styles.btnDark]}>
                  <Text style={styles.btnDarkText}>Erneut prüfen</Text>
                </Pressable>

                <Pressable onPress={openAdmin} style={[styles.btn, styles.btnAccent]}>
                  <Text style={styles.btnAccentText}>Admin öffnen</Text>
                </Pressable>

                <Pressable onPress={goProvision} style={styles.btnGhost}>
                  <Text style={styles.btnGhostText}>Neu aktivieren</Text>
                </Pressable>
              </View>
            </View>
            <PoweredBy />
          </>
        ) : null}

        {state.kind === "error" ? (
          <>
            <View style={styles.warnCard}>
              <Text style={styles.warnTitle}>Hinweis</Text>
              <Text style={styles.warnText}>{state.message}</Text>
              {state.traceId ? <Text style={styles.warnMeta}>Trace: {state.traceId}</Text> : null}

              <View style={[styles.row, { marginTop: 12 }]}>
                <Pressable onPress={load} style={[styles.btnSmall, styles.btnDark]}>
                  <Text style={styles.btnDarkText}>Retry</Text>
                </Pressable>
                <Pressable onPress={goProvision} style={[styles.btnSmall, styles.btnAccent]}>
                  <Text style={styles.btnAccentText}>Neu aktivieren</Text>
                </Pressable>
              </View>
            </View>
            <PoweredBy />
          </>
        ) : null}

        {/* state.kind === "ready" is transitional; we already router.replace("/events") */}
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
  warnMeta: { marginTop: 6, opacity: 0.7, color: "rgba(153,27,27,0.95)", fontFamily: "monospace" },

  row: { flexDirection: "row", alignItems: "center", gap: 10 },

  h2: { fontWeight: "900", color: UI.text, fontSize: 16 },
  p: { marginTop: 6, opacity: 0.75, color: UI.text },

  btn: { paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnSmall: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnDark: { backgroundColor: UI.text },
  btnDarkText: { color: "white", fontWeight: "900" },
  btnAccent: { backgroundColor: UI.accent },
  btnAccentText: { color: "white", fontWeight: "900" },

  btnGhost: { height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnGhostText: { fontSize: 14, fontWeight: "900", color: "rgba(0,0,0,0.48)" },
});
