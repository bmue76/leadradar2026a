import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { getApiBaseUrl as getEnvApiBaseUrl } from "../src/lib/env";
import { clearApiKey, getApiKey } from "../src/lib/auth";
import { apiFetch } from "../src/lib/api";
import { getAppSettings, normalizeBaseUrl, normalizeTenantSlug, setAppSettings } from "../src/lib/appSettings";
import { ScreenScaffold } from "../src/ui/ScreenScaffold";
import { UI } from "../src/ui/tokens";

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

export default function Settings() {
  const isDev = isDevRuntime();

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

      // Show stored values if present, otherwise DEV-friendly defaults
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
        setNote("Bitte eine gültige Base URL eingeben (z.B. https://leadradar.ch).");
        return;
      }
      if (!t) {
        setNote("Bitte einen gültigen Tenant eingeben (z.B. atlex).");
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

  const onTestConnection = useCallback(async () => {
    setConn({ kind: "loading" });
    setNote(null);

    // Lightweight endpoint (no mobile auth required)
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

  const onResetApiKey = useCallback(async () => {
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
    <ScreenScaffold title="Einstellungen" scroll={false} showPoweredBy>
      <View style={{ gap: 12 }}>
        <View style={styles.card}>
          <Text style={styles.h2}>Server</Text>

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

          <Text style={[styles.label, { marginTop: 10 }]}>Tenant (Slug)</Text>
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

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable disabled={!canSave} onPress={onSave} style={[styles.btn, styles.btnDark, !canSave && styles.btnDisabled]}>
              <Text style={styles.btnDarkText}>{busy ? "Lade…" : "Speichern"}</Text>
            </Pressable>

            {isDev ? (
              <Pressable disabled={busy} onPress={onDevDefaults} style={[styles.btn, styles.btnLight, busy && styles.btnDisabled]}>
                <Text style={styles.btnLightText}>DEV Defaults</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Gerät</Text>

          <Text style={styles.label}>Device UID (read-only)</Text>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Text style={[styles.mono, { flex: 1 }]} numberOfLines={1}>
              {deviceUid}
            </Text>
            <Pressable onPress={onCopyDeviceUid} style={[styles.btnMini, styles.btnLight]}>
              <Text style={styles.btnLightText}>Kopieren</Text>
            </Pressable>
          </View>

          <Text style={[styles.label, { marginTop: 10 }]}>Gespeicherter apiKey</Text>
          <Text style={styles.mono}>{revealKey ? apiKeyFull : apiKeyMasked}</Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable disabled={busy} onPress={() => setRevealKey((v) => !v)} style={[styles.btnMini, styles.btnLight, busy && styles.btnDisabled]}>
              <Text style={styles.btnLightText}>{revealKey ? "Verbergen" : "Anzeigen"}</Text>
            </Pressable>

            <Pressable disabled={busy} onPress={onResetApiKey} style={[styles.btnMini, styles.btnAccent, busy && styles.btnDisabled]}>
              <Text style={styles.btnDarkText}>Zurücksetzen</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Verbindung</Text>

          <Pressable disabled={busy || conn.kind === "loading"} onPress={onTestConnection} style={[styles.btn, styles.btnDark, (busy || conn.kind === "loading") && styles.btnDisabled]}>
            <Text style={styles.btnDarkText}>{conn.kind === "loading" ? "Teste…" : "Verbindung testen"}</Text>
          </Pressable>

          {conn.kind === "success" ? (
            <View style={{ marginTop: 10, gap: 4 }}>
              <Text style={styles.ok}>Verbunden</Text>
              {conn.now ? <Text style={styles.meta}>Server-Zeit: {conn.now}</Text> : null}
              {conn.traceId ? <Text style={styles.meta}>Trace-ID: {conn.traceId}</Text> : null}
            </View>
          ) : null}

          {conn.kind === "error" ? (
            <View style={{ marginTop: 10, gap: 4 }}>
              <Text style={styles.err}>Fehler</Text>
              <Text style={styles.meta}>
                {conn.code ? `${conn.code} · ` : ""}
                {typeof conn.status === "number" ? `HTTP ${conn.status} · ` : ""}
                {conn.message}
              </Text>
              {conn.traceId ? <Text style={styles.meta}>Trace-ID: {conn.traceId}</Text> : null}
              <Pressable onPress={onTestConnection} style={[styles.btnMini, styles.btnLight, { marginTop: 8 }]}>
                <Text style={styles.btnLightText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {note ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>{note}</Text>
          </View>
        ) : null}

        <Pressable disabled={busy} onPress={() => router.replace("/")} style={[styles.btn, styles.btnLight]}>
          <Text style={styles.btnLightText}>Zur Startseite</Text>
        </Pressable>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: UI.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
    gap: 6,
  },
  h2: { fontWeight: "900", color: UI.text },
  label: { fontWeight: "800", color: UI.text, marginTop: 8 },
  meta: { opacity: 0.8, color: UI.text, fontSize: 12 },
  mono: { fontFamily: "monospace", opacity: 0.9, color: UI.text },

  input: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    color: UI.text,
    backgroundColor: "rgba(17,24,39,0.03)",
    fontWeight: "700",
  },

  btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, alignItems: "center", flex: 1 },
  btnMini: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, alignItems: "center" },

  btnDark: { backgroundColor: UI.text },
  btnDarkText: { color: "white", fontWeight: "900" },

  btnLight: { backgroundColor: "rgba(17,24,39,0.06)" },
  btnLightText: { fontWeight: "900", color: UI.text },

  btnAccent: { backgroundColor: UI.accent },

  btnDisabled: { opacity: 0.6 },

  ok: { fontWeight: "900", color: UI.text },
  err: { fontWeight: "900", color: UI.text },

  note: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(17,24,39,0.06)",
    borderWidth: 1,
    borderColor: UI.border,
  },
  noteText: { color: UI.text, fontWeight: "800" },
});
