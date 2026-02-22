import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ACCENT_HEX } from "../src/lib/mobileConfig";
import { getStoredAuth, clearStoredAuth } from "../src/lib/mobileStorage";
import { fetchLicense, ApiError, LicenseResponse } from "../src/lib/mobileApi";
import CollapsibleDetails from "../src/ui/CollapsibleDetails";

function formatEndsAt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-CH", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ConnectedStatus() {
  const router = useRouter();
  const [auth, setAuth] = useState<{ tenantSlug: string | null; deviceId: string | null; apiKey: string | null } | null>(null);
  const [license, setLicense] = useState<LicenseResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const a = await getStoredAuth();
      setAuth(a);

      if (!a.apiKey) {
        router.replace("/provision");
        return;
      }

      const l = await fetchLicense({ apiKey: a.apiKey, tenantSlug: a.tenantSlug });
      setLicense(l);

      if (!l.isActive) {
        router.replace("/license");
      }
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDisconnect() {
    Alert.alert("Gerät trennen", "Willst du die Verbindung (apiKey) löschen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Trennen",
        style: "destructive",
        onPress: async () => {
          await clearStoredAuth();
          router.replace("/provision");
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <Text style={styles.h1}>Verbunden</Text>
        <Text style={styles.help}>Lizenz ist aktiv – Statusübersicht (MVP).</Text>

        <View style={styles.card}>
          <View pointerEvents="none" style={[styles.glowA, { backgroundColor: ACCENT_HEX }]} />
          <View pointerEvents="none" style={[styles.glowB, { backgroundColor: ACCENT_HEX }]} />

          <View style={styles.row}>
            <Text style={styles.k}>Tenant</Text>
            <Text style={styles.v}>{auth?.tenantSlug || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.k}>Device</Text>
            <Text style={styles.v}>{auth?.deviceId || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.k}>Aktiv</Text>
            <Text style={styles.v}>{license?.isActive ? "Ja" : busy ? "…" : "Nein"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.k}>Typ</Text>
            <Text style={styles.v}>{license?.type || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.k}>Gültig bis</Text>
            <Text style={styles.v}>{formatEndsAt(license?.endsAt || null)}</Text>
          </View>

          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color={ACCENT_HEX} />
              <Text style={styles.busyText}>Aktualisiere…</Text>
            </View>
          ) : null}
        </View>

        <Pressable style={[styles.btnPrimary, { backgroundColor: ACCENT_HEX }]} onPress={load} disabled={busy}>
          <Text style={styles.btnPrimaryText}>{busy ? "Prüfe…" : "Lizenzstatus prüfen"}</Text>
        </Pressable>

        <Pressable style={styles.btnGhost} onPress={onDisconnect}>
          <Text style={styles.btnGhostText}>Gerät trennen</Text>
        </Pressable>

        <CollapsibleDetails
          title="Details anzeigen"
          lines={[
            ["TraceId", err?.traceId],
            ["Error Code", err?.code],
            ["HTTP Status", err?.status ? String(err.status) : undefined],
          ]}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
  h1: { fontSize: 30, fontWeight: "900", letterSpacing: -0.2, color: "rgba(0,0,0,0.9)" },
  help: { marginTop: 8, fontSize: 15, lineHeight: 21, color: "rgba(0,0,0,0.62)" },

  card: {
    marginTop: 16,
    borderRadius: 24,
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
  glowA: { position: "absolute", width: 280, height: 280, borderRadius: 280, top: -160, left: -150, opacity: 0.10 },
  glowB: { position: "absolute", width: 320, height: 320, borderRadius: 320, bottom: -220, right: -220, opacity: 0.06 },

  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  k: { fontSize: 13, fontWeight: "900", color: "rgba(0,0,0,0.55)" },
  v: { fontSize: 13, fontWeight: "900", color: "rgba(0,0,0,0.85)" },

  busyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  busyText: { fontSize: 13, fontWeight: "800", color: "rgba(0,0,0,0.55)" },

  btnPrimary: { marginTop: 18, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  btnGhost: { marginTop: 10, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnGhostText: { fontSize: 14, fontWeight: "900", color: "rgba(0,0,0,0.48)" },
});
