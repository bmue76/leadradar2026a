import React, { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { apiFetch } from "../src/lib/api";
import { clearApiKey, setApiKey } from "../src/lib/auth";
import { parseProvisionToken } from "../src/lib/tokenParse";
import { PoweredBy } from "../src/ui/PoweredBy";
import { UI } from "../src/ui/tokens";

type Mode = "scan" | "manual";

function mapError(code?: string, status?: number): string {
  if (code === "INVALID_PROVISION_TOKEN") return "Token ungültig/abgelaufen/verwendet.";
  if (status === 401) return "Nicht autorisiert (Token ungültig).";
  if (status === 429) return "Zu viele Versuche – bitte kurz warten.";
  return "Aktivierung fehlgeschlagen.";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getStringProp(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function getNumberProp(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function getRecordProp(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = obj[key];
  return isRecord(v) ? v : undefined;
}

function pickErrCode(obj: Record<string, unknown>): string | undefined {
  // shape A: { ok:false, code, message, ... }
  const direct = getStringProp(obj, "code");
  if (direct) return direct;

  // shape B: { ok:false, error:{ code, message, ... } }
  const err = getRecordProp(obj, "error");
  const nested = err ? getStringProp(err, "code") : undefined;
  return nested;
}

function pickStatus(obj: Record<string, unknown>): number | undefined {
  return getNumberProp(obj, "status");
}

function pickTraceId(obj: Record<string, unknown>): string {
  return getStringProp(obj, "traceId") ?? "";
}

export default function Provision() {
  const params = useLocalSearchParams<{ token?: string }>();
  const [mode, setMode] = useState<Mode>("scan");
  const [tokenInput, setTokenInput] = useState<string>(params.token ?? "");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [perm, requestPerm] = useCameraPermissions();

  async function claimToken(raw: string) {
    const parsed = parseProvisionToken ? parseProvisionToken(raw) : raw.trim();
    const token = (parsed ?? "").trim();
    if (!token) {
      setErrorText("Token fehlt.");
      return;
    }

    setBusy(true);
    setErrorText(null);

    try {
      await clearApiKey();

      const res = await apiFetch({
        method: "POST",
        path: "/api/mobile/v1/provision/claim",
        body: { token, deviceName: Platform.OS === "android" ? "Android Device" : "iOS Device" },
        apiKey: null,
      });

      if (!isRecord(res)) {
        setErrorText("Invalid API response shape");
        return;
      }

      const okVal = res["ok"];
      if (typeof okVal !== "boolean") {
        setErrorText("Invalid API response shape");
        return;
      }

      if (okVal !== true) {
        const code = pickErrCode(res);
        const status = pickStatus(res);
        const traceId = pickTraceId(res);
        setErrorText(`${mapError(code, status)}${traceId ? ` (traceId: ${traceId})` : ""}`);
        return;
      }

      const data = getRecordProp(res, "data");
      const tokenValue = data ? (getStringProp(data, "token") ?? "").trim() : "";

      if (!tokenValue) {
        const traceId = pickTraceId(res);
        setErrorText(`Aktivierung fehlgeschlagen: apiKey fehlt in Response.${traceId ? ` (traceId: ${traceId})` : ""}`);
        return;
      }

      await setApiKey(tokenValue);
      router.replace("/");
    } finally {
      setBusy(false);
    }
  }

  const canScan = mode === "scan";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />

      <View style={styles.page}>
        <Text style={styles.title}>Gerät aktivieren</Text>
        <Text style={styles.sub}>Scanne den QR-Code oder füge den Token manuell ein.</Text>

        <View style={styles.modeRow}>
          <Pressable onPress={() => setMode("scan")} style={[styles.modeBtn, mode === "scan" ? styles.modeBtnActive : styles.modeBtnIdle]}>
            <Text style={[styles.modeText, mode === "scan" ? styles.modeTextActive : styles.modeTextIdle]}>QR Scan</Text>
          </Pressable>

          <Pressable onPress={() => setMode("manual")} style={[styles.modeBtn, mode === "manual" ? styles.modeBtnActive : styles.modeBtnIdle]}>
            <Text style={[styles.modeText, mode === "manual" ? styles.modeTextActive : styles.modeTextIdle]}>Manuell</Text>
          </Pressable>
        </View>

        {canScan ? (
          <View style={styles.cameraWrap}>
            {perm?.granted ? (
              <CameraView
                style={{ flex: 1 }}
                onBarcodeScanned={(ev) => {
                  if (busy) return;
                  const raw = (ev.data ?? "").toString();
                  void claimToken(raw);
                }}
              />
            ) : (
              <View style={styles.center}>
                <Text style={{ fontWeight: "900", color: UI.text }}>Kamera-Berechtigung benötigt</Text>
                <Pressable
                  onPress={async () => {
                    const r = await requestPerm();
                    if (!r.granted) Alert.alert("Hinweis", "Bitte Kamera-Berechtigung aktivieren.");
                  }}
                  style={[styles.btn, styles.btnDark]}
                >
                  <Text style={styles.btnText}>Berechtigung anfragen</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={{ fontWeight: "900", color: UI.text }}>Provision Token</Text>
            <TextInput
              value={tokenInput}
              onChangeText={setTokenInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="lrp_…"
              style={styles.input}
            />

            <Pressable disabled={busy} onPress={() => void claimToken(tokenInput)} style={[styles.btn, styles.btnDark, busy && { opacity: 0.6 }]}>
              <Text style={styles.btnText}>{busy ? "Aktiviere…" : "Aktivieren"}</Text>
            </Pressable>
          </View>
        )}

        {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

        <View style={{ marginTop: 14 }}>
          <PoweredBy />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },
  page: { flex: 1, paddingHorizontal: UI.padX, paddingTop: 14, gap: 12 },

  title: { fontSize: 26, fontWeight: "900", color: UI.text },
  sub: { opacity: 0.7, color: UI.text },

  modeRow: { flexDirection: "row", gap: 10 },
  modeBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14 },
  modeBtnActive: { backgroundColor: UI.text },
  modeBtnIdle: { backgroundColor: "rgba(17,24,39,0.06)" },
  modeText: { fontWeight: "900" },
  modeTextActive: { color: "white" },
  modeTextIdle: { color: UI.text },

  cameraWrap: { flex: 1, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: UI.border },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18, gap: 10 },

  input: {
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 14,
    padding: 12,
    fontFamily: "monospace",
    backgroundColor: UI.bg,
    color: UI.text,
  },

  btn: { paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  btnDark: { backgroundColor: UI.text },
  btnText: { color: "white", fontWeight: "900" },

  error: { color: "rgba(176,0,32,0.95)", fontWeight: "900" },
});
