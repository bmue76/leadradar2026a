import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking as RNLinking, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ACCENT_HEX, ADMIN_URL, API_BASE_URL } from "../src/lib/mobileConfig";
import { getStoredAuth, clearStoredAuth } from "../src/lib/mobileStorage";
import { fetchLicense, ApiError, LicenseResponse } from "../src/lib/mobileApi";
import CollapsibleDetails from "../src/ui/CollapsibleDetails";

function formatEndsAt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-CH", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function isPast(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}
function isPending(lic: LicenseResponse) {
  const t = (lic.type || "").toLowerCase();
  return t.includes("pending") || (!lic.isActive && !!lic.endsAt && !isPast(lic.endsAt));
}
function maskKey(k?: string | null) {
  if (!k) return undefined;
  const s = k.trim();
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

type UiState =
  | { kind: "checking" }
  | { kind: "blocked"; license: LicenseResponse }
  | { kind: "error"; error: ApiError }
  | { kind: "noauth" };

export default function LicenseGateScreen() {
  const router = useRouter();

  const [auth, setAuth] = useState<{ tenantSlug: string | null; deviceId: string | null; apiKey: string | null } | null>(null);
  const [state, setState] = useState<UiState>({ kind: "checking" });

  async function check() {
    try {
      setState({ kind: "checking" });
      const a = await getStoredAuth();
      setAuth(a);

      if (!a.apiKey) {
        setState({ kind: "noauth" });
        return;
      }

      const lic = await fetchLicense({ apiKey: a.apiKey, tenantSlug: a.tenantSlug });
      if (lic.isActive) {
        router.replace("/stats");
        return;
      }
      setState({ kind: "blocked", license: lic });
    } catch (e) {
      setState({ kind: "error", error: e as ApiError });
    }
  }

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headline = useMemo(() => {
    if (state.kind === "noauth") return { title: "Gerät aktivieren", sub: "Dieses Gerät ist noch nicht verbunden." };
    if (state.kind === "error") return { title: "Verbindung fehlgeschlagen", sub: "Lizenzstatus konnte nicht geprüft werden." };
    if (state.kind === "blocked") {
      const lic = state.license;
      if (lic.endsAt && isPast(lic.endsAt)) return { title: "Abgelaufen", sub: "Diese Lizenz ist nicht mehr gültig." };
      if (isPending(lic)) return { title: "Wartet auf Aktivierung", sub: "Der erste Check kann die Aktivierung starten. Bitte erneut prüfen." };
      return { title: "Lizenz erforderlich", sub: "Für dieses Gerät ist keine aktive Lizenz verfügbar." };
    }
    return { title: "Prüfe Lizenz…", sub: "Bitte kurz warten." };
  }, [state]);

  async function onBuy() {
    if (ADMIN_URL) {
      try {
        await RNLinking.openURL(ADMIN_URL);
      } catch {
        Alert.alert("Admin öffnen", "Konnte Admin-URL nicht öffnen.");
      }
      return;
    }
    Alert.alert("Lizenz kaufen", "Bitte im Admin unter Geräte/Lizenzen eine Lizenz zuweisen. Danach hier erneut prüfen.");
  }

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

  const metaLines = useMemo((): Array<[string, string]> => {
    if (state.kind !== "blocked") return [];
    const lic = state.license;
    return [
      ["Status", lic.isActive ? "Aktiv" : isPending(lic) ? "Pending" : "Inaktiv"],
      ["Typ", lic.type || "—"],
      ["Gültig bis", formatEndsAt(lic.endsAt)],
    ];
  }, [state]);

  const errLines = useMemo((): Array<[string, string | undefined | null]> => {
    if (state.kind !== "error") return [];
    const e = state.error;
    return [
      ["Message", e.message],
      ["Error Code", e.code],
      ["HTTP Status", e.status ? String(e.status) : undefined],
      ["TraceId", e.traceId || undefined],
    ];
  }, [state]);

  const detailsLines = useMemo((): Array<[string, string | undefined | null]> => {
    const base: Array<[string, string | undefined | null]> = [
      ["API Base URL", API_BASE_URL || "(nicht gesetzt)"],
      ["Admin URL", ADMIN_URL || "(nicht gesetzt)"],
      ["Tenant", auth?.tenantSlug || undefined],
      ["DeviceId", auth?.deviceId || undefined],
      ["API Key", maskKey(auth?.apiKey)],
    ];
    return base.concat(errLines);
  }, [auth?.apiKey, auth?.deviceId, auth?.tenantSlug, errLines]);

  const primaryLabel = state.kind === "noauth" ? "Jetzt verbinden" : "Erneut prüfen";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <Text style={styles.h1}>{headline.title}</Text>
        <Text style={styles.help}>{headline.sub}</Text>

        <View style={styles.hero}>
          <View pointerEvents="none" style={[styles.glowA, { backgroundColor: ACCENT_HEX }]} />
          <View pointerEvents="none" style={[styles.glowB, { backgroundColor: ACCENT_HEX }]} />

          <View style={styles.heroTop}>
            <View style={styles.badge}>
              <Text style={[styles.badgeText, { color: ACCENT_HEX }]}>
                {state.kind === "checking" ? "CHECK" : state.kind === "error" ? "ERROR" : state.kind === "noauth" ? "ONBOARD" : "BLOCKED"}
              </Text>
            </View>

            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.metaMini}>{auth?.tenantSlug ? `Tenant: ${auth.tenantSlug}` : "Tenant: —"}</Text>
              <Text style={styles.metaMini}>{auth?.deviceId ? `Device: ${auth.deviceId}` : "Device: —"}</Text>
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            {state.kind === "checking" ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={ACCENT_HEX} />
                <Text style={styles.loadingText}>Lizenzstatus wird geprüft…</Text>
              </View>
            ) : null}

            {metaLines.length > 0 ? (
              <View style={{ marginTop: 6 }}>
                {metaLines.map(([k, v]) => (
                  <View key={k} style={styles.row}>
                    <Text style={styles.k}>{k}</Text>
                    <Text style={styles.v}>{v}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Pressable
            style={[styles.btnPrimary, { backgroundColor: ACCENT_HEX }]}
            onPress={async () => {
              if (state.kind === "noauth") router.replace("/provision");
              else await check();
            }}
          >
            <Text style={styles.btnPrimaryText}>{primaryLabel}</Text>
          </Pressable>

          <Pressable style={styles.btnSecondary} onPress={onBuy}>
            <Text style={[styles.btnSecondaryText, { color: ACCENT_HEX }]}>Lizenz kaufen</Text>
            <Text style={styles.btnSecondarySub}>{ADMIN_URL ? "öffnet Admin" : "im Admin → Geräte/Lizenzen"}</Text>
          </Pressable>

          <Pressable style={styles.btnGhost} onPress={onDisconnect}>
            <Text style={styles.btnGhostText}>Gerät trennen</Text>
          </Pressable>

          <CollapsibleDetails title="Details anzeigen" lines={detailsLines} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },

  h1: { fontSize: 30, fontWeight: "900", letterSpacing: -0.2, color: "rgba(0,0,0,0.9)" },
  help: { marginTop: 8, fontSize: 15, lineHeight: 21, color: "rgba(0,0,0,0.62)" },

  hero: {
    marginTop: 16,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
    overflow: "hidden",
  },
  glowA: { position: "absolute", width: 320, height: 320, borderRadius: 320, top: -190, left: -170, opacity: 0.10 },
  glowB: { position: "absolute", width: 360, height: 360, borderRadius: 360, bottom: -240, right: -240, opacity: 0.06 },

  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "rgba(255,255,255,0.9)" },
  badgeText: { fontSize: 12, fontWeight: "900" },
  metaMini: { fontSize: 12, fontWeight: "800", color: "rgba(0,0,0,0.48)" },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  loadingText: { fontSize: 14, fontWeight: "800", color: "rgba(0,0,0,0.58)" },

  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  k: { fontSize: 13, fontWeight: "900", color: "rgba(0,0,0,0.55)" },
  v: { fontSize: 13, fontWeight: "900", color: "rgba(0,0,0,0.85)" },

  btnPrimary: { height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  btnSecondary: { marginTop: 12, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: "rgba(0,0,0,0.045)", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  btnSecondaryText: { fontSize: 16, fontWeight: "900" },
  btnSecondarySub: { marginTop: 4, fontSize: 12, fontWeight: "800", color: "rgba(0,0,0,0.45)" },

  btnGhost: { marginTop: 10, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnGhostText: { fontSize: 14, fontWeight: "900", color: "rgba(0,0,0,0.48)" },
});
