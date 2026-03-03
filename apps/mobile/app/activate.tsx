import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";

import { useLicenseGate } from "../src/lib/useLicenseGate";

type UiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string; traceId?: string };

function normalizeMaybeCode(raw: string): string {
  return (raw || "").replace(/\s+/g, "").trim().toUpperCase();
}

function extractCodeFromQr(raw: string): string | null {
  const txt = (raw || "").trim();
  if (!txt) return null;

  // 1) URL with ?code=...
  try {
    const u = new URL(txt);
    const c =
      u.searchParams.get("code") ||
      u.searchParams.get("activationCode") ||
      u.searchParams.get("activation") ||
      u.searchParams.get("license") ||
      u.searchParams.get("key");
    if (c && c.trim()) return c.trim();
  } catch {
    // ignore
  }

  // 2) raw code directly
  const cleaned = normalizeMaybeCode(txt);

  // accept if looks like a code (>= 6 alnum)
  const alnum = cleaned.replace(/[^A-Z0-9]/g, "");
  if (alnum.length >= 6) return cleaned;

  return txt;
}

export default function ActivationScreen() {
  const router = useRouter();
  const { activate, derived, state } = useLicenseGate();

  const [code, setCode] = useState("");
  const [ui, setUi] = useState<UiState>({ kind: "idle" });

  // QR scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLock, setScanLock] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const expiredHint = useMemo(() => {
    if (!derived.expired) return null;
    const d = derived.expiresAt;
    const iso = d ? d.toISOString().slice(0, 10) : undefined;
    return iso ? `Deine Lizenz ist abgelaufen (gültig bis ${iso}).` : "Deine Lizenz ist abgelaufen.";
  }, [derived.expired, derived.expiresAt]);

  const disabled = ui.kind === "loading";

  const onPaste = async () => {
    try {
      const txt = await Clipboard.getStringAsync();
      if (txt && txt.trim().length > 0) setCode(txt);
    } catch {
      Alert.alert("Einfügen nicht möglich", "Bitte Code manuell einfügen.");
    }
  };

  const openScanner = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Nicht verfügbar", "QR-Code Scan ist im Web nicht verfügbar.");
      return;
    }

    const granted = permission?.granted ?? false;
    if (!granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert(
          "Kamera-Zugriff fehlt",
          "Bitte erlaube den Kamera-Zugriff, um den QR-Code zu scannen."
        );
        return;
      }
    }

    setScanLock(false);
    setScannerOpen(true);
  };

  const closeScanner = () => {
    setScannerOpen(false);
    setScanLock(false);
  };

  const onBarcodeScanned = (res: BarcodeScanningResult) => {
    if (scanLock) return;
    setScanLock(true);

    const raw = (res?.data || "").toString();
    const extracted = extractCodeFromQr(raw);

    if (!extracted) {
      Alert.alert("QR-Code erkannt", "Wir konnten keinen Aktivierungscode daraus lesen.");
      setScanLock(false);
      return;
    }

    setCode(extracted);
    closeScanner();
  };

  const onSubmit = async () => {
    setUi({ kind: "loading" });
    const res = await activate(code);

    if (!res.ok) {
      setUi({ kind: "error", message: res.message, traceId: res.traceId });
      return;
    }

    setUi({ kind: "success" });
    router.replace("/forms");
  };

  // Fullscreen scanner overlay
  if (scannerOpen) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "black" }} edges={["top", "bottom"]}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>QR-Code scannen</Text>
          <Pressable onPress={closeScanner} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={{ color: "white", fontSize: 14, fontWeight: "700", opacity: 0.95 }}>Schliessen</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={onBarcodeScanned}
            barcodeScannerSettings={{
              // Works cross-platform. If your QR contains e.g. CODE_128, you can add it.
              barcodeTypes: ["qr"],
            }}
          />

          {/* simple framing overlay */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 260,
                height: 260,
                borderRadius: 22,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.85)",
                backgroundColor: "rgba(0,0,0,0.12)",
              }}
            />
            <Text style={{ color: "rgba(255,255,255,0.85)", marginTop: 14, fontSize: 13, fontWeight: "600" }}>
              QR-Code in den Rahmen halten
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6, fontSize: 12 }}>
              Der Code wird automatisch übernommen.
            </Text>
          </View>

          {scanLock ? (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: 16,
                backgroundColor: "rgba(0,0,0,0.45)",
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Erkannt …</Text>
              <Text style={{ color: "rgba(255,255,255,0.8)", marginTop: 4 }}>
                Übernehme Code.
              </Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 }}
        >
          <View style={{ flex: 1, justifyContent: "space-between" }}>
            {/* Top */}
            <View>
              <Text style={{ fontSize: 28, fontWeight: "700", letterSpacing: -0.2 }}>Gerät aktivieren</Text>
              <Text style={{ marginTop: 10, fontSize: 15, opacity: 0.75 }}>
                Gib den Aktivierungscode ein — oder scanne den QR-Code.
              </Text>

              {expiredHint ? (
                <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" }}>
                  <Text style={{ fontSize: 14, opacity: 0.85 }}>{expiredHint}</Text>
                </View>
              ) : null}

              <View style={{ marginTop: 18 }}>
                <Text style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>Aktivierungscode</Text>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!disabled}
                    placeholder="z.B. ABCD-1234"
                    style={{
                      flex: 1,
                      height: 52,
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      fontSize: 16,
                      backgroundColor: "rgba(0,0,0,0.05)",
                    }}
                  />

                  <Pressable
                    onPress={onPaste}
                    disabled={disabled}
                    style={{
                      height: 52,
                      paddingHorizontal: 14,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: disabled ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)",
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", opacity: 0.9 }}>Einfügen</Text>
                  </Pressable>
                </View>

                <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={openScanner}
                    disabled={disabled}
                    style={{
                      flex: 1,
                      height: 48,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: disabled ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)",
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", opacity: 0.9 }}>QR-Code scannen</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setCode(normalizeMaybeCode(code))}
                    disabled={disabled}
                    style={{
                      height: 48,
                      paddingHorizontal: 14,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: disabled ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)",
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", opacity: 0.9 }}>Format</Text>
                  </Pressable>
                </View>

                <Text style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
                  Tipp: Bindestriche/Leerzeichen sind ok. Lang drücken → Einfügen.
                </Text>
              </View>

              <Pressable
                onPress={onSubmit}
                disabled={disabled}
                style={{
                  marginTop: 18,
                  height: 52,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: disabled ? "rgba(0,0,0,0.2)" : "black",
                }}
              >
                {ui.kind === "loading" ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>Aktivieren</Text>
                )}
              </Pressable>

              {ui.kind === "success" ? (
                <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" }}>
                  <Text style={{ fontSize: 14, opacity: 0.85 }}>Aktiviert. Du kannst jetzt Leads erfassen.</Text>
                </View>
              ) : null}

              {ui.kind === "error" ? (
                <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" }}>
                  <Text style={{ fontSize: 14, fontWeight: "700" }}>Aktivierung fehlgeschlagen</Text>
                  <Text style={{ marginTop: 6, fontSize: 14, opacity: 0.85 }}>{ui.message}</Text>
                  <Text style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>traceId: {ui.traceId ?? "—"}</Text>

                  <Pressable
                    onPress={() => setUi({ kind: "idle" })}
                    style={{ marginTop: 10, paddingVertical: 10, alignSelf: "flex-start" }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600" }}>Erneut versuchen</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* Bottom */}
            <View style={{ gap: 10, marginTop: 18 }}>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Noch nicht implementiert",
                    "„Code erneut senden“ ist im MVP als Platzhalter vorgesehen (kein Backend-Endpoint in TP 9.2)."
                  )
                }
                style={{ paddingVertical: 10 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", opacity: 0.9 }}>Code erneut senden</Text>
              </Pressable>

              <Pressable onPress={() => router.push("/settings")} style={{ paddingVertical: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", opacity: 0.9 }}>Einstellungen</Text>
                <Text style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
                  Base URL / Konto-Kürzel prüfen (wichtig bei Aktivierungsfehlern).
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  const last4 = state?.licenseKeyLast4 ? `…${state.licenseKeyLast4}` : "—";
                  Alert.alert(
                    "Status",
                    `Lizenz: ${derived.active ? "AKTIV" : derived.expired ? "ABGELAUFEN" : "INAKTIV"}\nCode: ${last4}`
                  );
                }}
                style={{ paddingVertical: 10 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", opacity: 0.9 }}>Hilfe</Text>
                <Text style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
                  Zeigt den aktuellen Gate-Status (lokal). Support kann die traceId nutzen.
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
