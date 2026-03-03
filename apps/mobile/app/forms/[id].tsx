import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "../../src/lib/api";
import { clearApiKey, getApiKey } from "../../src/lib/auth";
import { getActiveEventId } from "../../src/lib/eventStorage";
import { ScreenScaffold } from "../../src/ui/ScreenScaffold";
import { UI } from "../../src/ui/tokens";

type JsonObject = Record<string, unknown>;

type ApiErrorShape = { code?: unknown; message?: unknown; details?: unknown };
type ApiRespShape =
  | { ok: true; data?: unknown; traceId?: unknown }
  | { ok: false; error?: ApiErrorShape; traceId?: unknown; status?: unknown; message?: unknown };

type FormDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  fieldsCount: number;
};

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function isApiResp(v: unknown): v is ApiRespShape {
  return isObject(v) && typeof (v as { ok?: unknown }).ok === "boolean";
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

function parseDetail(data: unknown): FormDetail | null {
  if (!isObject(data)) return null;

  const id = typeof data.id === "string" ? data.id.trim() : "";
  if (!id) return null;

  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : id;
  const description = typeof data.description === "string" ? data.description : null;
  const status = typeof data.status === "string" ? data.status : null;

  const fieldsRaw = Array.isArray(data.fields) ? (data.fields as unknown[]) : [];
  const fieldsCount = fieldsRaw.length;

  return { id, name, description, status, fieldsCount };
}

export default function FormDetailPlaceholder() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; eventId?: string }>();

  const formId = (params?.id ?? "").toString().trim();
  const eventIdParam = (params?.eventId ?? "").toString().trim();

  const [eventId, setEventId] = useState<string>(eventIdParam);

  const [busy, setBusy] = useState(false);
  const [errorTitle, setErrorTitle] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  const [form, setForm] = useState<FormDetail | null>(null);

  const title = useMemo(() => (form ? form.name : "Formular"), [form]);

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, []);

  const load = useCallback(async () => {
    setErrorTitle("");
    setErrorDetail("");
    setBusy(true);

    try {
      if (!formId) {
        setErrorTitle("Formular nicht gefunden.");
        setErrorDetail("Ungültige Form-ID.");
        return;
      }

      const key = await getApiKey();
      if (!key) {
        router.replace("/provision");
        return;
      }

      const eid = eventIdParam || (await getActiveEventId()) || "";
      if (!eid) {
        router.replace("/event-gate");
        return;
      }
      setEventId(eid);

      const raw = await apiFetch({
        method: "GET",
        path: `/api/mobile/v1/forms/${encodeURIComponent(formId)}?eventId=${encodeURIComponent(eid)}`,
        apiKey: key,
      });

      if (!isApiResp(raw)) {
        setForm(null);
        setErrorTitle("Konnte Formular nicht laden.");
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

        setForm(null);
        setErrorTitle("Konnte Formular nicht laden.");
        setErrorDetail(`HTTP ${status || "?"} — ${message}${traceId ? ` (traceId: ${traceId})` : ""}`);
        return;
      }

      const parsed = parseDetail(raw.data);
      if (!parsed) {
        setForm(null);
        setErrorTitle("Konnte Formular nicht lesen.");
        setErrorDetail("Unerwartete Server-Antwort (DTO).");
        return;
      }

      setForm(parsed);
    } finally {
      setBusy(false);
    }
  }, [eventIdParam, formId, reActivate]);

  useEffect(() => {
    void load();
  }, [load]);

  const padBottom = 24 + UI.tabBarBaseHeight + Math.max(insets.bottom, 0);

  return (
    <ScreenScaffold title={title} scroll={false}>
      {busy && !form ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Formular wird geladen …</Text>
        </View>
      ) : errorTitle ? (
        <View style={styles.body}>
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>{errorTitle}</Text>
            <Text style={styles.warnText}>{errorDetail || "Bitte nochmals versuchen."}</Text>

            <View style={styles.row}>
              <Pressable onPress={load} style={[styles.btn, styles.btnDark]}>
                <Text style={styles.btnDarkText}>Retry</Text>
              </Pressable>

              <Pressable onPress={() => router.replace("/forms")} style={[styles.btn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>Zur Liste</Text>
              </Pressable>
            </View>

            <Pressable onPress={() => router.replace("/event-gate")} style={[styles.btnWide, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Event wählen</Text>
            </Pressable>

            <Pressable onPress={reActivate} style={[styles.btnWide, styles.btnDangerGhost]}>
              <Text style={styles.btnDangerGhostText}>Neu aktivieren</Text>
            </Pressable>
          </View>
        </View>
      ) : form ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: padBottom }]}>
          <View style={styles.card}>
            <Text style={styles.h1}>{form.name}</Text>
            <Text style={styles.mono}>formId: {form.id}</Text>
            {eventId ? <Text style={styles.mono}>eventId: {eventId}</Text> : null}

            {form.status ? <Text style={styles.p}>Status: <Text style={styles.pStrong}>{form.status}</Text></Text> : null}

            {form.description ? <Text style={[styles.p, { marginTop: 10 }]}>{form.description}</Text> : null}

            <View style={styles.hr} />

            <Text style={styles.p}>
              Felder: <Text style={styles.pStrong}>{form.fieldsCount}</Text>
            </Text>

            <Text style={[styles.p, { marginTop: 10, opacity: 0.75 }]}>
              Detail-Placeholder (TP 9.3). Capture/Render folgt in TP 9.4.
            </Text>

            <View style={styles.row}>
              <Pressable onPress={() => router.replace("/forms")} style={[styles.btn, styles.btnDark]}>
                <Text style={styles.btnDarkText}>Zur Liste</Text>
              </Pressable>

              <Pressable onPress={load} style={[styles.btn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>Reload</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={styles.loadingText}>—</Text>
        </View>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: UI.padX },
  loadingText: { opacity: 0.7, fontWeight: "800", color: UI.text },

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

  row: { flexDirection: "row", gap: 10, marginTop: 12 },

  btn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnWide: { marginTop: 10, paddingVertical: 12, borderRadius: 14, alignItems: "center" },

  btnDark: { backgroundColor: UI.text },
  btnDarkText: { color: "white", fontWeight: "900" },

  btnGhost: { backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  btnGhostText: { fontWeight: "900", color: "rgba(0,0,0,0.55)" },

  btnDangerGhost: { backgroundColor: "rgba(220,38,38,0.06)", borderWidth: 1, borderColor: "rgba(220,38,38,0.18)" },
  btnDangerGhostText: { fontWeight: "900", color: "rgba(153,27,27,0.95)" },

  h1: { fontWeight: "900", color: UI.text, fontSize: 18 },
  mono: { marginTop: 8, fontFamily: "monospace", color: UI.text, opacity: 0.75 },
  p: { marginTop: 8, color: UI.text, opacity: 0.9, lineHeight: 18 },
  pStrong: { fontWeight: "900", opacity: 1 },

  hr: { height: 1, backgroundColor: UI.border, marginVertical: 12 },
});
