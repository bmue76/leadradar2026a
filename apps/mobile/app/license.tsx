import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { apiFetch } from "../src/lib/api";
import { getApiKey } from "../src/lib/auth";
import { AppHeader } from "../src/ui/AppHeader";
import { PoweredBy } from "../src/ui/PoweredBy";
import { UI } from "../src/ui/tokens";
import { useBranding } from "../src/features/branding/useBranding";

type JsonObject = Record<string, unknown>;

type ApiErrorShape = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

type ApiRespShape =
  | { ok: true; data?: unknown; traceId?: unknown }
  | { ok: false; error?: ApiErrorShape; traceId?: unknown; status?: unknown; message?: unknown };

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function isApiResp(v: unknown): v is ApiRespShape {
  return isObject(v) && typeof v.ok === "boolean";
}

function readBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function readString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function extractErr(res: ApiRespShape): { status: number; code: string; message: string; traceId: string } {
  const traceId = typeof res.traceId === "string" ? res.traceId : "";
  const status = typeof (res as { status?: unknown }).status === "number" ? ((res as { status: number }).status) : 0;

  const err = (res as { error?: ApiErrorShape }).error;
  const code = err && typeof err.code === "string" ? err.code : "";
  const msgFromErr = err && typeof err.message === "string" ? err.message : "";
  const msgTop = typeof (res as { message?: unknown }).message === "string" ? (res as { message: string }).message : "";

  return { status, code, message: msgFromErr || msgTop || "Request failed", traceId };
}

type StatusData = {
  isActive: boolean;
  validUntil: string | null;
};

function parseStatusData(v: unknown): StatusData | null {
  if (!isObject(v)) return null;
  const isActive = readBool(v.isActive);
  const validUntil = readString(v.validUntil);
  if (isActive === null) return null;
  return { isActive, validUntil };
}

export default function LicenseScreen() {
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const tenantName = brandingState.kind === "ready" ? branding.tenantName : null;
  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [code, setCode] = useState("");
  const [errorText, setErrorText] = useState("");

  const padBottom = useMemo(() => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 28, [insets.bottom]);

  const loadStatus = useCallback(async () => {
    setErrorText("");
    setBusy(true);
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        router.replace("/provision");
        return;
      }

      const raw = await apiFetch({
        method: "GET",
        path: "/api/mobile/v1/billing/status",
        apiKey,
      });

      if (!isApiResp(raw)) {
        setErrorText("Ungültige API-Antwort (Shape).");
        setStatus(null);
        return;
      }

      if (!raw.ok) {
        const { status: httpStatus, message, traceId } = extractErr(raw);
        setErrorText(`HTTP ${httpStatus || "?"} — ${message}${traceId ? ` (traceId: ${traceId})` : ""}`);
        setStatus(null);
        return;
      }

      const parsed = parseStatusData(raw.data);
      if (!parsed) {
        setErrorText("Ungültige Status-Antwort (Data).");
        setStatus(null);
        return;
      }

      setStatus(parsed);

      // Already active → back to capture
      if (parsed.isActive) {
        router.replace("/forms");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const redeem = useCallback(async () => {
    setErrorText("");
    setBusy(true);
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        router.replace("/provision");
        return;
      }

      const trimmed = code.trim();
      if (!trimmed) {
        setErrorText("Bitte Gutscheincode eingeben.");
        return;
      }

      const raw = await apiFetch({
        method: "POST",
        path: "/api/mobile/v1/billing/redeem-and-activate",
        apiKey,
        body: { code: trimmed },
      });

      if (!isApiResp(raw)) {
        setErrorText("Ungültige API-Antwort (Shape).");
        return;
      }

      if (!raw.ok) {
        const { status: httpStatus, message, traceId } = extractErr(raw);
        setErrorText(`HTTP ${httpStatus || "?"} — ${message}${traceId ? ` (traceId: ${traceId})` : ""}`);
        return;
      }

      const parsed = parseStatusData(raw.data);
      if (!parsed) {
        setErrorText("Ungültige Aktivierungs-Antwort (Data).");
        return;
      }

      setStatus(parsed);

      if (parsed.isActive) {
        router.replace("/forms");
      }
    } finally {
      setBusy(false);
    }
  }, [code]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />
      <AppHeader title="Lizenz" tenantName={tenantName} logoDataUrl={logoDataUrl} />

      <View style={[styles.body, { paddingBottom: padBottom }]}>
        <View style={styles.warnCard}>
          <Text style={styles.warnTitle}>Lizenz abgelaufen</Text>
          <Text style={styles.warnText}>
            Deine Messe-Lizenz ist abgelaufen. Bitte verlängern, damit du wieder Leads erfassen kannst.
          </Text>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Gültig bis</Text>
            <Text style={styles.statusValue}>{status?.validUntil ? status.validUntil : "—"}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Gutscheincode</Text>
          <Text style={styles.p}>Gib den Code ein und aktiviere die Verlängerung direkt in der App.</Text>

          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="z.B. LR-ABC123"
            placeholderTextColor="rgba(15,23,42,0.35)"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />

          {errorText ? <Text style={styles.errText}>{errorText}</Text> : null}

          <View style={styles.row}>
            <Pressable onPress={loadStatus} disabled={busy} style={[styles.btn, styles.btnGhost, busy ? styles.btnDisabled : null]}>
              <Text style={styles.btnGhostText}>Aktualisieren</Text>
            </Pressable>

            <Pressable onPress={redeem} disabled={busy} style={[styles.btn, styles.btnAccent, busy ? styles.btnDisabled : null]}>
              <Text style={styles.btnAccentText}>Aktivieren</Text>
            </Pressable>
          </View>
        </View>

        <PoweredBy />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },

  body: { paddingHorizontal: UI.padX, paddingTop: 14, gap: 12 },

  warnCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.25)",
    backgroundColor: "rgba(220,38,38,0.06)",
  },
  warnTitle: { fontWeight: "900", color: "rgba(153,27,27,0.95)" },
  warnText: { marginTop: 6, color: "rgba(153,27,27,0.95)" },

  statusRow: { marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusLabel: { opacity: 0.8, color: "rgba(153,27,27,0.95)" },
  statusValue: { fontWeight: "900", color: "rgba(153,27,27,0.95)" },

  card: {
    backgroundColor: UI.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
  },

  h2: { fontWeight: "900", color: UI.text },
  p: { marginTop: 6, opacity: 0.75, color: UI.text },

  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: UI.text,
    backgroundColor: "rgba(255,255,255,0.75)",
  },

  errText: { marginTop: 10, color: "rgba(153,27,27,0.95)", fontWeight: "700" },

  row: { flexDirection: "row", gap: 10, marginTop: 12 },

  btn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnAccent: { backgroundColor: UI.accent },
  btnAccentText: { color: "white", fontWeight: "900" },

  btnGhost: { backgroundColor: "rgba(15,23,42,0.06)" },
  btnGhostText: { color: UI.text, fontWeight: "900" },

  btnDisabled: { opacity: 0.6 },
});
