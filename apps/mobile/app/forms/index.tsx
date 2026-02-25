import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { apiFetch } from "../../src/lib/api";
import { clearApiKey, getApiKey } from "../../src/lib/auth";
import { getActiveEventId } from "../../src/lib/eventStorage";
import { AppHeader } from "../../src/ui/AppHeader";
import { PoweredBy } from "../../src/ui/PoweredBy";
import { UI } from "../../src/ui/tokens";
import { useBranding } from "../../src/features/branding/useBranding";

type FormSummary = {
  id: string;
  name?: string;
  title?: string;
  status?: string;
};

type JsonObject = Record<string, unknown>;

type ApiErrorShape = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

type ApiRespShape =
  | { ok: true; data?: unknown; traceId?: unknown }
  | { ok: false; error?: ApiErrorShape; traceId?: unknown; status?: unknown; message?: unknown };

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function isApiResp(v: unknown): v is ApiRespShape {
  return isObject(v) && typeof (v as { ok?: unknown }).ok === "boolean";
}

function asFormSummary(v: unknown): FormSummary | null {
  if (!isObject(v)) return null;
  const id = v.id;
  if (typeof id !== "string" || !id.trim()) return null;
  const name = typeof v.name === "string" ? v.name : undefined;
  const title = typeof v.title === "string" ? v.title : undefined;
  const status = typeof v.status === "string" ? v.status : undefined;
  return { id, name, title, status };
}

function labelForForm(f: FormSummary): string {
  return f.name || f.title || f.id;
}

function pickList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (isObject(data) && Array.isArray(data.forms)) return data.forms as unknown[];
  if (isObject(data) && Array.isArray(data.items)) return data.items as unknown[];
  return [];
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

export default function FormsIndex() {
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const [items, setItems] = useState<FormSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string>("");
  const [eventId, setEventId] = useState<string | null>(null);

  const tenantName = brandingState.kind === "ready" ? branding.tenantName : null;
  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;

  const listPadBottom = useMemo(() => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 28, [insets.bottom]);

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, []);

  const goEventGate = useCallback(() => {
    router.replace("/event-gate");
  }, []);

  const load = useCallback(async () => {
    setErrorText("");
    setBusy(true);

    try {
      const key = await getApiKey();
      if (!key) {
        router.replace("/provision");
        return;
      }

      const activeEventId = await getActiveEventId();
      if (!activeEventId) {
        router.replace("/event-gate");
        return;
      }
      setEventId(activeEventId);

      const raw = await apiFetch({
        method: "GET",
        path: `/api/mobile/v1/forms?eventId=${encodeURIComponent(activeEventId)}`,
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

        // Event not active / not found => event gate
        if (code === "EVENT_NOT_ACTIVE" || code === "NOT_FOUND") {
          router.replace("/event-gate");
          return;
        }

        setErrorText(`HTTP ${status || "?"} — ${message}${traceId ? ` (traceId: ${traceId})` : ""}`);
        setItems([]);
        return;
      }

      const data = raw.data;
      const rawList = pickList(data);
      const list = rawList.map(asFormSummary).filter((x): x is FormSummary => x !== null);
      setItems(list);
    } finally {
      setBusy(false);
    }
  }, [reActivate]);

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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />
      <AppHeader title="Formulare" tenantName={tenantName} logoDataUrl={logoDataUrl} />

      {eventId ? (
        <View style={[styles.eventHint, { paddingHorizontal: UI.padX }]}>
          <Text style={styles.eventHintText}>Event: <Text style={styles.eventHintMono}>{eventId}</Text></Text>
          <Pressable onPress={goEventGate} style={styles.eventHintBtn}>
            <Text style={styles.eventHintBtnText}>Wechseln</Text>
          </Pressable>
        </View>
      ) : null}

      {errorText ? (
        <View style={[styles.body, { paddingBottom: listPadBottom }]}>
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>Hinweis</Text>
            <Text style={styles.warnText}>{errorText}</Text>

            <View style={styles.row}>
              <Pressable onPress={load} style={[styles.btn, styles.btnDark]}>
                <Text style={styles.btnDarkText}>Retry</Text>
              </Pressable>

              <Pressable onPress={goEventGate} style={[styles.btn, styles.btnAccent]}>
                <Text style={styles.btnAccentText}>Event wählen</Text>
              </Pressable>
            </View>

            <Pressable onPress={reActivate} style={[styles.btnWide, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Neu aktivieren</Text>
            </Pressable>
          </View>

          <PoweredBy />
        </View>
      ) : !errorText && !busy && items.length === 0 ? (
        <View style={[styles.body, { paddingBottom: listPadBottom }]}>
          <View style={styles.card}>
            <Text style={styles.h2}>Keine Formulare sichtbar.</Text>
            <Text style={styles.p}>
              Dieses Event hat aktuell keine aktiven Formulare (Global oder Event-Zuweisung). Setze im Admin im Formular die Sichtbarkeit.
            </Text>

            <View style={styles.row}>
              <Pressable onPress={load} style={[styles.btn, styles.btnDark, { marginTop: 10 }]}>
                <Text style={styles.btnDarkText}>Aktualisieren</Text>
              </Pressable>

              <Pressable onPress={goEventGate} style={[styles.btn, styles.btnAccent, { marginTop: 10 }]}>
                <Text style={styles.btnAccentText}>Event wählen</Text>
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
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                const eid = eventId ? encodeURIComponent(eventId) : "";
                router.push(`/forms/${item.id}?eventId=${eid}`);
              }}
              style={styles.formCard}
            >
              <Text style={styles.formTitle}>{labelForForm(item)}</Text>
              <Text style={styles.formId}>{item.id}</Text>
              {item.status ? <Text style={styles.formStatus}>Status: {item.status}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },

  eventHint: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eventHintText: { color: UI.text, opacity: 0.75, fontWeight: "800" },
  eventHintMono: { fontFamily: "monospace", opacity: 0.9 },
  eventHintBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: UI.border },
  eventHintBtnText: { fontWeight: "900", color: UI.text, opacity: 0.8 },

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

  row: { flexDirection: "row", gap: 10, marginTop: 12 },

  btn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnWide: { marginTop: 10, paddingVertical: 12, borderRadius: 14, alignItems: "center" },

  btnDark: { backgroundColor: UI.text },
  btnDarkText: { color: "white", fontWeight: "900" },

  btnAccent: { backgroundColor: UI.accent },
  btnAccentText: { color: "white", fontWeight: "900" },

  btnGhost: { backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  btnGhostText: { fontWeight: "900", color: "rgba(0,0,0,0.55)" },

  h2: { fontWeight: "900", color: UI.text },
  p: { marginTop: 6, opacity: 0.75, color: UI.text },

  formCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    marginBottom: 10,
    backgroundColor: UI.bg,
  },
  formTitle: { fontWeight: "900", color: UI.text },
  formId: { opacity: 0.7, marginTop: 4, fontFamily: "monospace", color: UI.text },
  formStatus: { opacity: 0.75, marginTop: 4, color: UI.text },
});
