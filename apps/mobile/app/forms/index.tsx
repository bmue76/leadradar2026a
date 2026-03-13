import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { apiFetch } from "../../src/lib/api";
import { clearApiKey, getApiKey } from "../../src/lib/auth";
import { getActiveEventId } from "../../src/lib/eventStorage";
import { AppHeader } from "../../src/ui/AppHeader";
import { PoweredBy } from "../../src/ui/PoweredBy";
import { UI } from "../../src/ui/tokens";
import { useBranding } from "../../src/features/branding/useBranding";
import { ACCENT_HEX } from "../../src/lib/mobileConfig";

type JsonObject = Record<string, unknown>;

type FormListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
};

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function parseForms(data: unknown): FormListItem[] {
  const arr = Array.isArray(data)
    ? data
    : isObject(data) && Array.isArray(data.forms)
      ? (data.forms as unknown[])
      : isObject(data) && Array.isArray(data.items)
        ? (data.items as unknown[])
        : [];

  const out: FormListItem[] = [];
  for (const it of arr) {
    if (!isObject(it)) continue;

    const id = pickString(it.id);
    if (!id) continue;

    out.push({
      id,
      name: pickString(it.name) ?? id,
      description: typeof it.description === "string" ? it.description : null,
      status: typeof it.status === "string" ? it.status : null,
    });
  }
  return out;
}

function buildFormPath(formId: string, eventId: string, mode?: string | null): string {
  const params = [`eventId=${encodeURIComponent(eventId)}`];
  if (mode) params.push(`mode=${encodeURIComponent(mode)}`);
  return `/forms/${encodeURIComponent(formId)}?${params.join("&")}`;
}

export default function FormsIndex() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ eventId?: string; mode?: string }>();
  const { state: brandingState, branding } = useBranding();

  const [items, setItems] = useState<FormListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorTitle, setErrorTitle] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [eventId, setEventIdState] = useState<string | null>(null);

  const tenantName = brandingState.kind === "ready" ? branding.tenantName : null;
  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;
  const listPadBottom = useMemo(() => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 28, [insets.bottom]);

  const requestedMode = typeof params.mode === "string" ? params.mode : null;

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, []);

  const goEventGate = useCallback(() => {
    router.replace("/event-gate?next=forms");
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

      const effectiveEventId =
        typeof params.eventId === "string" && params.eventId.trim()
          ? params.eventId.trim()
          : await getActiveEventId();

      if (!effectiveEventId) {
        router.replace("/event-gate?next=forms");
        return;
      }

      setEventIdState(effectiveEventId);

      const res = await apiFetch<unknown>({
        method: "GET",
        path: `/api/mobile/v1/forms?eventId=${encodeURIComponent(effectiveEventId)}`,
        apiKey: key,
        timeoutMs: 20_000,
      });

      if (!res.ok) {
        const status = res.status ?? 0;
        const code = res.code ?? "";
        const message = res.message || `HTTP ${status || "?"}`;
        const traceId = res.traceId ?? "";

        if (status === 402 || code === "PAYMENT_REQUIRED") {
          router.replace("/license");
          return;
        }

        if (status === 401 || code === "INVALID_API_KEY") {
          await reActivate();
          return;
        }

        if (code === "EVENT_NOT_ACTIVE" || code === "NOT_FOUND") {
          router.replace("/event-gate?next=forms");
          return;
        }

        setItems([]);
        setErrorTitle("Konnte Formulare nicht laden.");
        setErrorDetail(`${message}${traceId ? ` (traceId: ${traceId})` : ""}`);
        return;
      }

      const forms = parseForms(res.data);
      setItems(forms);

      if (forms.length === 1 && requestedMode) {
        router.replace(buildFormPath(forms[0].id, effectiveEventId, requestedMode));
      }
    } finally {
      setBusy(false);
    }
  }, [params.eventId, reActivate, requestedMode]);

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
      <AppHeader title="Formular wählen" tenantName={tenantName} logoDataUrl={logoDataUrl} />

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
              Dieses Event hat aktuell keine aktiven Formulare. Prüfe im Admin ACTIVE + Assignment.
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
                if (!eventId) return;
                router.push(buildFormPath(item.id, eventId, requestedMode));
              }}
              style={styles.formCard}
            >
              <Text style={styles.formTitle}>{item.name}</Text>
              {item.description ? <Text style={styles.formText}>{item.description}</Text> : null}
              <View style={styles.formFooter}>
                <Text style={styles.formMeta}>{item.status ?? "ACTIVE"}</Text>
                <Text style={styles.formLink}>Öffnen</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  eventHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  eventHintText: {
    fontSize: 13,
    color: "rgba(0,0,0,0.60)",
  },
  eventHintMono: {
    fontWeight: "800",
    color: UI.text,
  },
  eventHintBtn: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI.border,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  eventHintBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: UI.text,
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
    gap: 10,
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
  btnWide: {
    marginTop: 10,
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
  btnAccent: {
    backgroundColor: ACCENT_HEX,
  },
  btnAccentText: {
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
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
    marginBottom: 10,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 6,
  },
  formText: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
  formFooter: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  formMeta: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(0,0,0,0.48)",
  },
  formLink: {
    fontSize: 13,
    fontWeight: "900",
    color: ACCENT_HEX,
  },
});
