import React, { useMemo, useState } from "react";
import { Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";

import { apiFetch } from "../src/lib/api";
import { getApiBaseUrl } from "../src/lib/env";
import { clearApiKey, setApiKey } from "../src/lib/auth";
import { parseProvisionToken } from "../src/lib/tokenParse";

type Mode = "scan" | "manual";

type ClaimResponse = {
  token?: unknown; // one-time api key
};

export default function Provision() {
  const params = useLocalSearchParams<{ token?: string }>();
  const baseUrl = useMemo(() => getApiBaseUrl(), []);
  const [mode, setMode] = useState<Mode>("scan");
  const [tokenInput, setTokenInput] = useState<string>((params?.token ?? "").toString());
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string>("");

  const [permission, requestPermission] = useCameraPermissions();

  const parsedToken = useMemo(() => parseProvisionToken(tokenInput), [tokenInput]);

  async function onResetDevice() {
    setBusy(true);
    try {
      await clearApiKey();
      Alert.alert("OK", "Gerät zurückgesetzt (apiKey gelöscht).");
      setTokenInput("");
      setErrorText("");
      setMode("scan");
    } finally {
      setBusy(false);
    }
  }

  function mapError(code: string, status: number): string {
    if (status === 401 && code === "INVALID_PROVISION_TOKEN") return "Token ungültig oder nicht mehr gültig.";
    if (status === 429 && code === "RATE_LIMITED") return "Zu viele Versuche. Bitte kurz warten.";
    if (code === "NETWORK_ERROR") return "Keine Verbindung. Bitte erneut versuchen.";
    if (status === 401) return "Token ungültig oder nicht mehr gültig.";
    if (status === 429) return "Zu viele Versuche. Bitte kurz warten.";
    return "Aktivierung fehlgeschlagen.";
  }

  async function onClaim() {
    setErrorText("");
    const token = parsedToken;
    if (!token) {
      setErrorText("Bitte einen gültigen Token einfügen (prov_...) oder QR scannen.");
      return;
    }

    setBusy(true);
    try {
      const deviceName = `android-${Platform.Version ?? ""}`.slice(0, 64);

      const res = await apiFetch<ClaimResponse>({
        method: "POST",
        path: "/api/mobile/v1/provision/claim",
        body: { token, deviceName },
      });

      if (!res.ok) {
        const msg = mapError(res.code, res.status);
        setErrorText(`${msg}${res.traceId ? ` (traceId: ${res.traceId})` : ""}`);
        return;
      }

      const tokenValue = res.data?.token;
      const apiKey = typeof tokenValue === "string" ? tokenValue.trim() : "";

      if (!apiKey) {
        setErrorText(`Aktivierung fehlgeschlagen: apiKey fehlt in Response.${res.traceId ? ` (traceId: ${res.traceId})` : ""}`);
        return;
      }

      await setApiKey(apiKey);
      router.replace("/forms");
    } finally {
      setBusy(false);
    }
  }

  function onBarcode(data: string) {
    const t = parseProvisionToken(String(data ?? ""));
    if (t) {
      setTokenInput(t);
      setMode("manual");
      setErrorText("");
    } else {
      setErrorText("QR erkannt, aber kein gültiger Token gefunden.");
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "900" }}>Aktivieren</Text>

      <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", gap: 6 }}>
        <Text style={{ fontWeight: "800" }}>API Base URL</Text>
        <Text style={{ fontFamily: "monospace", opacity: 0.85 }}>{baseUrl}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => setMode("scan")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: mode === "scan" ? "#111827" : "#F3F4F6",
            alignItems: "center",
          }}
        >
          <Text style={{ color: mode === "scan" ? "white" : "#111827", fontWeight: "800" }}>QR Scan</Text>
        </Pressable>

        <Pressable
          onPress={() => setMode("manual")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: mode === "manual" ? "#111827" : "#F3F4F6",
            alignItems: "center",
          }}
        >
          <Text style={{ color: mode === "manual" ? "white" : "#111827", fontWeight: "800" }}>Manuell</Text>
        </Pressable>
      </View>

      {mode === "scan" ? (
        <View style={{ gap: 10 }}>
          {permission?.granted ? (
            <View style={{ height: 320, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#E5E7EB" }}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={(r) => onBarcode(String(r.data ?? ""))}
              />
            </View>
          ) : (
            <View style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", gap: 10 }}>
              <Text style={{ fontWeight: "800" }}>Kamera-Berechtigung</Text>
              <Text style={{ opacity: 0.75 }}>Für QR-Scan braucht die App Zugriff auf die Kamera.</Text>
              <Pressable
                onPress={() => requestPermission()}
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#111827" }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>Berechtigung anfragen</Text>
              </Pressable>
            </View>
          )}
          <Text style={{ opacity: 0.7 }}>QR kann raw Token (prov_...) oder Link mit ?token=... enthalten.</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ fontWeight: "800" }}>Provision Token</Text>
          <TextInput
            value={tokenInput}
            onChangeText={setTokenInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder='prov_... oder URL mit ?token=...'
            style={{
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
            }}
          />

          <Pressable
            disabled={busy}
            onPress={onClaim}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: busy ? "#9CA3AF" : "#111827",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>{busy ? "Aktiviere…" : "Aktivieren"}</Text>
          </Pressable>
        </View>
      )}

      {errorText ? (
        <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" }}>
          <Text style={{ fontWeight: "900", color: "#991B1B" }}>Fehler</Text>
          <Text style={{ color: "#991B1B", marginTop: 6 }}>{errorText}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10, marginTop: "auto" }}>
        <Pressable
          disabled={busy}
          onPress={() => router.push("/settings")}
          style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#F3F4F6", alignItems: "center" }}
        >
          <Text style={{ fontWeight: "800" }}>Einstellungen</Text>
        </Pressable>

        <Pressable
          disabled={busy}
          onPress={onResetDevice}
          style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#DC2626", alignItems: "center" }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>Gerät zurücksetzen</Text>
        </Pressable>
      </View>
    </View>
  );
}
