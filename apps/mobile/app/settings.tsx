import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { getApiBaseUrl as getEnvApiBaseUrl } from "../src/lib/env";
import { clearApiKey, getApiKey } from "../src/lib/auth";
import { apiFetch } from "../src/lib/api";
import { getAppSettings, normalizeBaseUrl, normalizeTenantSlug, setAppSettings } from "../src/lib/appSettings";
import { PoweredBy } from "../src/ui/PoweredBy";
import MobileContentHeader from "../src/ui/MobileContentHeader";
import { UI } from "../src/ui/tokens";
import { ACCENT_HEX } from "../src/lib/mobileConfig";
import { useBranding } from "../src/features/branding/useBranding";

type ConnState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; traceId?: string; now?: string }
  | { kind: "error"; message: string; code?: string; status?: number; traceId?: string };

function isDevRuntime(): boolean {
  const v = (globalThis as unknown as { __DEV__?: unknown }).__DEV__;
  return typeof v === "boolean" ? v : false;
}

function keyInfo(key: string | null): string {
  if (!key) return "—";
  const trimmed = key.trim();
  const prefix = trimmed.slice(0, Math.min(12, trimmed.length));
  return `${prefix}… (len ${trimmed.length})`;
}

export default function ProfileScreen() {
  const isDev = isDevRuntime();
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const [busy, setBusy] = useState(false);

  const [baseUrlText, setBaseUrlText] = useState("");
  const [tenantText, setTenantText] = useState("");
  const [deviceUid, setDeviceUid] = useState("—");

  const [baseUrlMeta, setBaseUrlMeta] = useState<string>("—");
  const [tenantMeta, setTenantMeta] = useState<string>("—");

  const [apiKeyMasked, setApiKeyMasked] = useState<string>("—");
  const [apiKeyFull, setApiKeyFull] = useState<string>("—");
  const [revealKey, setRevealKey] = useState(false);

  const [note, setNote] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnState>({ kind: "idle" });

  const tenantName = brandingState.kind === "ready" ? branding.tenantName : null;
  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;
  const accentColor = brandingState.kind === "ready" ? branding.accentColor ?? ACCENT_HEX : ACCENT_HEX;

  const scrollPadBottom = useMemo(
    () => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 48,
    [insets.bottom]
  );

  const canSave = useMemo(() => {
    const b = normalizeBaseUrl(baseUrlText);
    const t = normalizeTenantSlug(tenantText);
    return !!b && !!t && !busy;
  }, [baseUrlText, tenantText, busy]);

  const load = useCallback(async () => {
    setBusy(true);
    setNote(null);

    try {
      const s = await getAppSettings({ refresh: true });
      setDeviceUid(s.deviceUid);

      const env = getEnvApiBaseUrl();
      setBaseUrlText(s.baseUrl ?? (isDev ? env : ""));
      setTenantText(s.tenantSlug ?? "");

      const src =
        s.effectiveBaseUrlSource === "stored"
          ? "Gespeichert"
          : s.effectiveBaseUrlSource === "dev-env"
            ? "DEV (.env)"
            : "Nicht gesetzt";
      setBaseUrlMeta(`${s.effectiveBaseUrl ?? "—"} · ${src}`);
      setTenantMeta(s.tenantSlug ? "Gespeichert" : "Nicht gesetzt");

      const k = await getApiKey();
      setApiKeyMasked(keyInfo(k));
      setApiKeyFull(k ? k.trim() : "—");
      if (!k) setRevealKey(false);
    } finally {
      setBusy(false);
    }
  }, [isDev]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => undefined;
    }, [load])
  );

  const onSave = useCallback(async () => {
    setBusy(true);
    setNote(null);

    try {
      const b = normalizeBaseUrl(baseUrlText);
      const t = normalizeTenantSlug(tenantText);

      if (!b) {
        setNote("Bitte eine gültige Base URL eingeben.");
        return;
      }
      if (!t) {
        setNote("Bitte ein gültiges Konto-Kürzel eingeben.");
        return;
      }

      await setAppSettings({ baseUrl: b, tenantSlug: t });
      setNote("Gespeichert.");
      await load();
    } finally {
      setBusy(false);
    }
  }, [baseUrlText, tenantText, load]);

  const onDevDefaults = useCallback(async () => {
    if (!isDev) return;

    setBusy(true);
    setNote(null);

    try {
      const env = getEnvApiBaseUrl();
      setBaseUrlText(env);
      setTenantText("atlex");
      await setAppSettings({ baseUrl: env, tenantSlug: "atlex" });
      setNote("DEV Defaults gesetzt.");
      await load();
    } finally {
      setBusy(false);
    }
  }, [isDev, load]);

  const onCopyDeviceUid = useCallback(async () => {
    await Clipboard.setStringAsync(deviceUid);
    setNote("Device UID kopiert.");
  }, [deviceUid]);

  const onCopySetup = useCallback(async () => {
    const summary = [
      `LeadRadar Support-Handoff`,
      ``,
      `Tenant: ${tenantText || "—"}`,
      `Base URL: ${normalizeBaseUrl(baseUrlText) ?? "—"}`,
      `Device UID: ${deviceUid || "—"}`,
      `API Key: ${apiKeyMasked}`,
      `Plattform: ${Platform.OS}`,
      `Verbindung: ${conn.kind}`,
      conn.kind === "success" ? `TraceId: ${conn.traceId ?? "—"}` : "",
      conn.kind === "error" ? `Fehler: ${conn.message}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await Clipboard.setStringAsync(summary);
    setNote("Aktuelles Setup kopiert.");
  }, [apiKeyMasked, baseUrlText, conn, deviceUid, tenantText]);

  const onSupport = useCallback(async () => {
    const body = [
      "LeadRadar Support",
      "",
      `Tenant: ${tenantText || "—"}`,
      `Base URL: ${normalizeBaseUrl(baseUrlText) ?? "—"}`,
      `Device UID: ${deviceUid || "—"}`,
      `API Key: ${apiKeyMasked}`,
      `Plattform: ${Platform.OS}`,
      conn.kind === "success" ? `TraceId: ${conn.traceId ?? "—"}` : "",
      conn.kind === "error" ? `Fehler: ${conn.message}` : "",
      "",
      "Beschreibung des Problems:",
      "",
    ]
      .filter(Boolean)
      .join("\n");

    await Linking.openURL(`mailto:?subject=${encodeURIComponent("LeadRadar Support")}&body=${encodeURIComponent(body)}`);
  }, [apiKeyMasked, baseUrlText, conn, deviceUid, tenantText]);

  const onTestConnection = useCallback(async () => {
    setConn({ kind: "loading" });
    setNote(null);

    const res = await apiFetch<{ now?: string }>({
      method: "GET",
      path: "/api/platform/v1/health",
      apiKey: null,
      timeoutMs: 8_000,
    });

    if (!res.ok) {
      setConn({
        kind: "error",
        message: res.message,
        code: res.code,
        status: res.status,
        traceId: res.traceId,
      });
      return;
    }

    setConn({
      kind: "success",
      traceId: res.traceId,
      now: (res.data as { now?: string })?.now,
    });
  }, []);

  const onDisconnect = useCallback(async () => {
    setBusy(true);
    setNote(null);

    try {
      await clearApiKey();
      setRevealKey(false);
      setApiKeyMasked("—");
      setApiKeyFull("—");
      setNote("apiKey entfernt. Bitte neu verbinden.");
      router.replace("/provision");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: scrollPadBottom }]}>
        <MobileContentHeader title="Profil" tenantName={tenantName} logoDataUrl={logoDataUrl} />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Server</Text>

          <Text style={styles.label}>Base URL</Text>
          <TextInput
            value={baseUrlText}
            onChangeText={setBaseUrlText}
            placeholder="https://leadradar.ch"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            editable={!busy}
          />
          <Text style={styles.meta}>{baseUrlMeta}</Text>

          <Text style={[styles.label, styles.labelTop]}>Konto-Kürzel</Text>
          <TextInput
            value={tenantText}
            onChangeText={setTenantText}
            placeholder="atlex"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            editable={!busy}
          />
          <Text style={styles.meta}>{tenantMeta}</Text>

          <View style={styles.row}>
            <Pressable disabled={!canSave} onPress={onSave} style={[styles.btn, { backgroundColor: accentColor }, !canSave && styles.btnDisabled]}>
              <Text style={styles.btnPrimaryText}>{busy ? "Lade…" : "Speichern"}</Text>
            </Pressable>

            <Pressable disabled={busy} onPress={onTestConnection} style={[styles.btn, styles.btnGhost, busy && styles.btnDisabled]}>
              <Text style={styles.btnGhostText}>
                {conn.kind === "loading" ? "Prüfe…" : "Verbindung testen"}
              </Text>
            </Pressable>
          </View>

          {isDev ? (
            <Pressable disabled={busy} onPress={onDevDefaults} style={[styles.btnWide, styles.btnGhost, busy && styles.btnDisabled]}>
              <Text style={styles.btnGhostText}>DEV Defaults setzen</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Gerät</Text>

          <Text style={styles.label}>Device UID</Text>
          <View style={styles.inlineRow}>
            <Text style={[styles.mono, styles.inlineFill]} numberOfLines={1}>
              {deviceUid}
            </Text>
            <Pressable onPress={onCopyDeviceUid} style={[styles.btnMini, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Kopieren</Text>
            </Pressable>
          </View>

          <Text style={[styles.label, styles.labelTop]}>API Key</Text>
          <Text style={styles.mono}>{revealKey ? apiKeyFull : apiKeyMasked}</Text>

          <View style={styles.row}>
            <Pressable onPress={() => setRevealKey((v) => !v)} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>{revealKey ? "Verbergen" : "Anzeigen"}</Text>
            </Pressable>

            <Pressable disabled={busy} onPress={onDisconnect} style={[styles.btn, styles.btnDanger, busy && styles.btnDisabled]}>
              <Text style={styles.btnDangerText}>Gerät trennen</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Zuweisung & Flow</Text>

          <View style={styles.row}>
            <Pressable onPress={() => router.push("/event-gate?next=home")} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Event wählen</Text>
            </Pressable>

            <Pressable onPress={() => router.push("/forms")} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Formulare</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.push("/capture")} style={[styles.btnWide, { backgroundColor: accentColor }]}>
            <Text style={styles.btnPrimaryText}>Lead erfassen</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Hilfe & Support</Text>
          <Text style={styles.supportText}>
            Übergibt das aktuelle Setup sauber weiter und erleichtert Support-Fälle im Feld.
          </Text>

          <View style={styles.row}>
            <Pressable onPress={onCopySetup} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Setup kopieren</Text>
            </Pressable>

            <Pressable onPress={onSupport} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Support öffnen</Text>
            </Pressable>
          </View>
        </View>

        {note ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{note}</Text>
          </View>
        ) : null}

        {conn.kind === "success" ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Verbindung ok{conn.now ? ` · ${conn.now}` : ""}{conn.traceId ? ` · traceId: ${conn.traceId}` : ""}
            </Text>
          </View>
        ) : null}

        {conn.kind === "error" ? (
          <View style={[styles.infoBox, styles.errorBox]}>
            <Text style={styles.infoText}>
              {conn.message}
              {conn.status ? ` · HTTP ${conn.status}` : ""}
              {conn.traceId ? ` · traceId: ${conn.traceId}` : ""}
            </Text>
          </View>
        ) : null}

        <PoweredBy />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  body: {
    paddingHorizontal: UI.padX,
    paddingTop: 8,
    gap: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(0,0,0,0.52)",
    marginBottom: 6,
  },
  labelTop: {
    marginTop: 12,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    fontSize: 15,
    color: UI.text,
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
    color: "rgba(0,0,0,0.50)",
  },
  mono: {
    fontSize: 13,
    color: UI.text,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  inlineRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  inlineFill: {
    flex: 1,
  },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  btnWide: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  btnMini: {
    minHeight: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 15,
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
    fontWeight: "800",
  },
  btnDanger: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(230,40,40,0.18)",
  },
  btnDangerText: {
    color: "rgba(190,0,0,0.9)",
    fontSize: 14,
    fontWeight: "800",
  },
  btnDisabled: {
    opacity: 0.55,
  },
  supportText: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
  infoBox: {
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.03)",
    padding: 12,
  },
  errorBox: {
    backgroundColor: "rgba(255,120,120,0.10)",
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
    color: UI.text,
  },
});
