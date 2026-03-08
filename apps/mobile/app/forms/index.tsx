import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
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

type JsonObject = Record<string, unknown>;

type ApiErrorShape = { code?: unknown; message?: unknown; details?: unknown };
type ApiRespShape =
  | { ok: true; data?: unknown; traceId?: unknown }
  | { ok: false; error?: ApiErrorShape; traceId?: unknown; status?: unknown; message?: unknown };

type FormListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
};

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function isApiResp(v: unknown): v is ApiRespShape {
  return isObject(v) && typeof (v as { ok?: unknown }).ok === "boolean";
}

function parseForms(data: unknown): FormListItem[] {
  const arr =
    Array.isArray(data) ? data :
    isObject(data) && Array.isArray(data.forms) ? (data.forms as unknown[]) :
    isObject(data) && Array.isArray(data.items) ? (data.items as unknown[]) :
    [];

  const out: FormListItem[] = [];

  for (const it of arr) {
    if (!isObject(it)) continue;
    const id = typeof it.id === "string" ? it.id.trim() : "";
    if (!id) continue;

    const name = typeof it.name === "string" && it.name.trim() ? it.name.trim() : id;
    const description = typeof it.description === "string" ? it.description : null;
    const status = typeof it.status === "string" ? it.status : null;

    out.push({ id, name, description, status });
  }

  return out;
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

  const [items, setItems] = useState<FormListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [errorTitle, setErrorTitle] = useState<string>("");
  const [errorDetail, setErrorDetail] = useState<string>("");

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
    setErrorTitle("");
    setErrorDetail("");
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
        setItems([]);
        setErrorTitle("Konnte Formulare nicht laden.");
        setErrorDetail("Ungültige API-Antwort (Shape).");
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

        if (code === "EVENT_NOT_ACTIVE" || code === "NOT_FOUND") {
          router.replace("/event-gate");
          return;
        }

        setItems([]);
        setErrorTitle("Konnte Formulare nicht laden.");
        setErrorDetail(`HTTP ${status || "?"} — ${message}${traceId ? ` (traceId: ${traceId})` : ""}`);
        return;
      }

      const list = parseForms(raw.data);
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

  const showLoading = busy && items.length === 0 && !errorTitle;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />
      <AppHeader title="Formulare" tenantName={tenantName} logoDataUrl={logoDataUrl} />

      {eventId ? (
        <View style={[styles.eventHint, { paddingHorizontal: UI.padX }]}>
          <Text style={styles.eventHintText}>
            Aktives Event: <Text style={styles.eventHintMono}>{eventId}</Text>
          </Text>
          <Pressable onPress={goEventGate} style={styles.eventHintBtn}>
            <Text style={styles.eventHintBtnText}>Wechseln</Text>
          </Pressable>
        </View>
      ) : null}

      {showLoading ? (
        <View style={[styles.center, { paddingBottom: listPadBottom }]}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Formulare werden geladen …</Text>
          <PoweredBy />
        </View>
      ) : errorTitle ? (
        <View style={[styles.body, { paddingBottom: listPadBottom }]}>
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>{errorTitle}</Text>
            <Text style={styles.warnText}>{errorDetail || "Bitte nochmals versuchen."}</Text>

            <View style={styles.row}>
              <Pressable onPress={load} style={[styles.btn, styles.btnDark]}>
                <Text style={styles.btnDarkText}>Erneut versuchen</Text>
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
      ) : !busy && items.length === 0 ? (
        <View style={[styles.body, { paddingBottom: listPadBottom }]}>
          <View style={styles.card}>
            <Text style={styles.h2}>Keine Formulare verfügbar.</Text>
            <Text style={styles.p}>
              Dieses Event hat aktuell keine aktiven Formulare (Global oder Event-Zuweisung). Prüfe im Admin: Formular ACTIVE + Sichtbarkeit/Assignment für dieses Event.
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
                router.push(`/forms/${encodeURIComponent(item.id)}?eventId=${eid}`);
              }}
              style={styles.formCard}
            >
              <Text style={styles.formTitle}>{item.name}</Text>
              {item.description ? <Text style={styles.formDesc} numberOfLines={2}>{item.description}</Text> : null}
              <View style={styles.metaRow}>
                <Text style={styles.formId}>{item.id}</Text>
                {item.status ? <Text style={styles.formStatus}>{item.status}</Text> : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: UI.padX },
  loadingText: { opacity: 0.7, fontWeight: "800", color: UI.text },

  eventHint: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eventHintText: { color: UI.text, opacity: 0.75, fontWeight: "800" },
  eventHintMono: { fontFamily: "monospace", opacity: 0.9 },
  eventHintBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: UI.border },
  eventHintBtnText: { fontWeight: "900", color: UI.text, opacity: 0.8 },

  body: { paddingHorizontal: UI.padX, paddingTop: 14, gap: 12 },
  list: { paddingHorizontal: UI.padX, paddingTop: 14 },

  card: { backgroundColor: UI.bg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: UI.border },

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
  formTitle: { fontWeight: "900", color: UI.text, marginBottom: 6 },
  formDesc: { opacity: 0.8, color: UI.text, marginBottom: 10, lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  formId: { opacity: 0.7, fontFamily: "monospace", color: UI.text, flex: 1 },
  formStatus: { opacity: 0.8, fontWeight: "900", color: UI.text },
});
