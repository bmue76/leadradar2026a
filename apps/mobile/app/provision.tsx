import React, { useMemo, useState } from "react";
import { Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";

import { apiFetch } from "../src/lib/api";
import { getApiBaseUrl } from "../src/lib/env";
import { clearApiKey, setApiKey } from "../src/lib/auth";
import { parseProvisionToken } from "../src/lib/tokenParse";

type Mode = "scan" | "manual";
type ClaimData = { token: string };

function mapError(code?: string, status?: number): string {
  if (code === "INVALID_PROVISION_TOKEN") return "Token ungültig/abgelaufen/verwendet.";
  if (status === 401) return "Nicht autorisiert (Token ungültig).";
  if (status === 429) return "Zu viele Versuche – bitte kurz warten.";
  return "Aktivierung fehlgeschlagen.";
}

export default function Provision() {
  const params = useLocalSearchParams<{ token?: string }>();
  const baseUrl = useMemo(() => getApiBaseUrl(), []);
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
      // reset any previous key before claim (clean state)
      await clearApiKey();

      const res = await apiFetch<ClaimData>({
        method: "POST",
        path: "/api/mobile/v1/provision/claim",
        body: { token, deviceName: Platform.OS === "android" ? "Android Device" : "iOS Device" },
        apiKey: null,
      });

      if (!res.ok) {
        setErrorText(`${mapError(res.code, res.status)}${res.traceId ? ` (traceId: ${res.traceId})` : ""}`);
        return;
      }

      const apiKey = (res.data?.token ?? "").trim();
      if (!apiKey) {
        setErrorText(`Aktivierung fehlgeschlagen: apiKey fehlt in Response.${res.traceId ? ` (traceId: ${res.traceId})` : ""}`);
        return;
      }

      await setApiKey(apiKey);
      router.replace("/");
    } finally {
      setBusy(false);
    }
  }

  const canScan = mode === "scan";

  return (
    <View style={{ flex: 1, padding: 16, gap: 12, backgroundColor: "white" }}>
      <Text style={{ fontSize: 26, fontWeight: "900" }}>Gerät aktivieren</Text>
      <Text style={{ opacity: 0.7 }}>Base: {baseUrl}</Text>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => setMode("scan")}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: mode === "scan" ? "#111827" : "#F3F4F6",
          }}
        >
          <Text style={{ color: mode === "scan" ? "white" : "#111827", fontWeight: "900" }}>QR Scan</Text>
        </Pressable>

        <Pressable
          onPress={() => setMode("manual")}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: mode === "manual" ? "#111827" : "#F3F4F6",
          }}
        >
          <Text style={{ color: mode === "manual" ? "white" : "#111827", fontWeight: "900" }}>Manuell</Text>
        </Pressable>
      </View>

      {canScan ? (
        <View style={{ flex: 1, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" }}>
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
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 18, gap: 10 }}>
              <Text style={{ fontWeight: "800" }}>Kamera-Berechtigung benötigt</Text>
              <Pressable
                onPress={async () => {
                  const r = await requestPerm();
                  if (!r.granted) Alert.alert("Hinweis", "Bitte Kamera-Berechtigung aktivieren.");
                }}
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#111827" }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>Berechtigung anfragen</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ fontWeight: "800" }}>Provision Token</Text>
          <TextInput
            value={tokenInput}
            onChangeText={setTokenInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="lrp_…"
            style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, fontFamily: "monospace" }}
          />

          <Pressable
            disabled={busy}
            onPress={() => void claimToken(tokenInput)}
            style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: busy ? "#9CA3AF" : "#111827", alignItems: "center" }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>{busy ? "Aktiviere…" : "Aktivieren"}</Text>
          </Pressable>
        </View>
      )}

      {errorText ? <Text style={{ color: "#B00020", fontWeight: "800" }}>{errorText}</Text> : null}
    </View>
  );
}
