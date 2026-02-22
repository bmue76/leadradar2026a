import React, { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Linking from "expo-linking";

import SegmentedControl from "../src/ui/SegmentedControl";
import CollapsibleDetails from "../src/ui/CollapsibleDetails";
import { ACCENT_HEX, ADMIN_URL } from "../src/lib/mobileConfig";
import { redeemProvisioning, fetchLicense, ApiError } from "../src/lib/mobileApi";
import { setStoredAuth } from "../src/lib/mobileStorage";

type TabKey = "qr" | "code";

function normalizeTenant(v: string) {
  return v.trim().toLowerCase();
}
function normalizeCode(v: string) {
  return v.replace(/\s+/g, "").trim().toUpperCase();
}

function parseProvisionPayload(payload: string): { tenant?: string; code?: string } | null {
  try {
    const parsed = Linking.parse(payload);
    const qp = (parsed.queryParams ?? {}) as Record<string, unknown>;
    const tenant = typeof qp.tenant === "string" ? qp.tenant : undefined;
    const code = typeof qp.code === "string" ? qp.code : undefined;
    if (!tenant && !code) return null;
    return { tenant, code };
  } catch {
    return null;
  }
}

export default function ProvisionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [tab, setTab] = useState<TabKey>("qr");
  const segments = useMemo(
    () => [
      { key: "qr" as const, label: "QR scannen" },
      { key: "code" as const, label: "Code eingeben" },
    ],
    []
  );

  const [tenantSlug, setTenantSlug] = useState("");
  const [code, setCode] = useState("");

  const [perm, requestPerm] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [lastError, setLastError] = useState<ApiError | null>(null);
  const [debounceScan, setDebounceScan] = useState(false);

  useEffect(() => {
    const t = typeof params.tenant === "string" ? params.tenant : "";
    const c = typeof params.code === "string" ? params.code : "";
    if (t) setTenantSlug(normalizeTenant(t));
    if (c) setCode(normalizeCode(c));
    if (t || c) {
      setTab("code");
      setStatusLine("Link erkannt – bereit zum Verbinden.");
    }
  }, [params.tenant, params.code]);

  const canConnect = normalizeTenant(tenantSlug).length > 0 && normalizeCode(code).length >= 6;

  async function onConnect() {
    try {
      setBusy(true);
      setLastError(null);
      setStatusLine("Gerät wird verbunden…");

      const t = normalizeTenant(tenantSlug);
      const c = normalizeCode(code);

      const redeemed = await redeemProvisioning(t, c);

      setStatusLine("Gerät verbunden – Lizenzstatus wird geprüft…");
      await setStoredAuth({ tenantSlug: redeemed.tenantSlug, apiKey: redeemed.apiKey, deviceId: redeemed.deviceId });

      const lic = await fetchLicense({ apiKey: redeemed.apiKey, tenantSlug: redeemed.tenantSlug });

      if (lic.isActive) router.replace("/stats");
      else router.replace("/license");
    } catch (e) {
      const err = e as ApiError;
      setLastError(err);
      setStatusLine(err.message || "Fehler beim Verbinden.");
      Alert.alert("Verbindung fehlgeschlagen", err.message || "Bitte prüfen und erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.page}>
          <Text style={styles.h1}>Gerät verbinden</Text>
          <Text style={styles.help}>QR scannen oder Kurzcode eingeben. Danach wird der Lizenzstatus geprüft.</Text>

          <View style={styles.card}>
            <View pointerEvents="none" style={[styles.glowA, { backgroundColor: ACCENT_HEX }]} />
            <View pointerEvents="none" style={[styles.glowB, { backgroundColor: ACCENT_HEX }]} />

            <View style={styles.topRow}>
              <Text style={styles.mini}>{ADMIN_URL ? "Admin → Geräte/Lizenzen" : "Admin: Geräte/Lizenzen"}</Text>
              <View style={styles.badge}>
                <Text style={[styles.badgeText, { color: ACCENT_HEX }]}>{tab === "qr" ? "SCAN" : "CODE"}</Text>
              </View>
            </View>

            <SegmentedControl value={tab} segments={segments} onChange={setTab} />

            {tab === "qr" ? (
              <View style={{ marginTop: 14 }}>
                {!perm?.granted ? (
                  <View style={styles.qrFallback}>
                    <Text style={styles.qrTitle}>Kamera-Zugriff erforderlich</Text>
                    <Text style={styles.qrText}>Erlaube Kamera-Zugriff, um den QR-Code zu scannen.</Text>
                    <Pressable style={[styles.btnPrimary, { backgroundColor: ACCENT_HEX }]} onPress={requestPerm}>
                      <Text style={styles.btnPrimaryText}>Kamera erlauben</Text>
                    </Pressable>
                    <Pressable style={styles.btnGhost} onPress={() => setTab("code")}>
                      <Text style={[styles.btnGhostText, { color: ACCENT_HEX }]}>Code eingeben</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.cameraCard}>
                    <CameraView
                      style={StyleSheet.absoluteFill}
                      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                      onBarcodeScanned={(ev) => {
                        if (debounceScan) return;
                        setDebounceScan(true);
                        setTimeout(() => setDebounceScan(false), 900);

                        const parsed = parseProvisionPayload(ev.data || "");
                        if (!parsed) {
                          setStatusLine("QR erkannt, aber kein Provision-Payload.");
                          return;
                        }
                        if (parsed.tenant) setTenantSlug(normalizeTenant(parsed.tenant));
                        if (parsed.code) setCode(normalizeCode(parsed.code));
                        setTab("code");
                        setStatusLine("QR erkannt – bereit zum Verbinden.");
                      }}
                    />
                    <View style={styles.overlay}>
                      <View style={styles.frame} />
                      <Text style={styles.overlayText}>QR-Code in den Rahmen halten</Text>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.label}>Tenant</Text>
                <TextInput
                  value={tenantSlug}
                  onChangeText={(v) => setTenantSlug(normalizeTenant(v))}
                  placeholder="z.B. atlex"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  editable={!busy}
                />

                <Text style={[styles.label, { marginTop: 12 }]}>Kurzcode</Text>
                <TextInput
                  value={code}
                  onChangeText={(v) => setCode(normalizeCode(v))}
                  placeholder="z.B. MVVJJ6GQ78"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                  editable={!busy}
                />

                <Pressable
                  style={[styles.btnPrimary, { backgroundColor: canConnect && !busy ? ACCENT_HEX : "rgba(0,122,255,0.35)" }]}
                  onPress={onConnect}
                  disabled={!canConnect || busy}
                >
                  <Text style={styles.btnPrimaryText}>{busy ? "Verbinde…" : "Verbinden"}</Text>
                </Pressable>

                <Text style={styles.statusLine}>{statusLine || " "}</Text>

                <CollapsibleDetails
                  title="Details anzeigen"
                  lines={[
                    ["TraceId", lastError?.traceId],
                    ["Error Code", lastError?.code],
                    ["HTTP Status", lastError?.status ? String(lastError.status) : undefined],
                  ]}
                />
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
  h1: { fontSize: 28, fontWeight: "900", letterSpacing: -0.2, color: "rgba(0,0,0,0.9)" },
  help: { marginTop: 8, fontSize: 15, lineHeight: 21, color: "rgba(0,0,0,0.62)" },

  card: {
    marginTop: 18,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    overflow: "hidden",
  },
  glowA: { position: "absolute", width: 300, height: 300, borderRadius: 300, top: -170, left: -150, opacity: 0.10 },
  glowB: { position: "absolute", width: 340, height: 340, borderRadius: 340, bottom: -220, right: -220, opacity: 0.06 },

  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  mini: { fontSize: 12, fontWeight: "700", color: "rgba(0,0,0,0.45)" },
  badge: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "rgba(255,255,255,0.9)" },
  badgeText: { fontSize: 12, fontWeight: "900" },

  label: { fontSize: 13, fontWeight: "900", color: "rgba(0,0,0,0.55)", marginBottom: 6 },
  input: {
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(0,0,0,0.045)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    fontSize: 15,
    color: "rgba(0,0,0,0.85)",
  },

  btnPrimary: { marginTop: 16, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  btnGhost: { marginTop: 10, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnGhostText: { fontSize: 15, fontWeight: "900" },

  statusLine: { marginTop: 10, fontSize: 13, color: "rgba(0,0,0,0.55)" },

  cameraCard: { height: 300, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "rgba(0,0,0,0.03)" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: { width: 210, height: 210, borderRadius: 22, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)", backgroundColor: "rgba(0,0,0,0.10)" },
  overlayText: { marginTop: 12, fontSize: 13, fontWeight: "800", color: "rgba(255,255,255,0.92)" },

  qrFallback: { padding: 16, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.85)" },
  qrTitle: { fontSize: 16, fontWeight: "900", color: "rgba(0,0,0,0.86)" },
  qrText: { marginTop: 6, fontSize: 14, lineHeight: 20, color: "rgba(0,0,0,0.6)" },
});
