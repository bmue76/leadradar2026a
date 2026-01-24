import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { getApiBaseUrl } from "../src/lib/env";
import { clearApiKey, getApiKey } from "../src/lib/auth";
import { ScreenScaffold } from "../src/ui/ScreenScaffold";
import { UI } from "../src/ui/tokens";

function keyInfo(key: string | null): string {
  if (!key) return "—";
  const trimmed = key.trim();
  const prefix = trimmed.slice(0, Math.min(12, trimmed.length));
  return `${prefix}… (len ${trimmed.length})`;
}

export default function Settings() {
  const baseUrl = getApiBaseUrl();
  const [keyText, setKeyText] = useState<string>("—");
  const [keyFull, setKeyFull] = useState<string>("—");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    setBusy(true);
    try {
      const key = await getApiKey();
      setKeyText(keyInfo(key));
      setKeyFull(key ? key.trim() : "—");
    } finally {
      setBusy(false);
    }
  }, []);

  const onReset = useCallback(async () => {
    setBusy(true);
    try {
      await clearApiKey();
      setKeyText("—");
      setKeyFull("—");
      setReveal(false);
      router.replace("/provision");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <ScreenScaffold title="Settings" scroll={false}>
      <View style={{ gap: 12 }}>
        <View style={styles.card}>
          <Text style={styles.h2}>API Base URL</Text>
          <Text style={styles.mono}>{baseUrl}</Text>

          <Text style={[styles.h2, { marginTop: 10 }]}>Gespeicherter apiKey</Text>
          <Text style={styles.mono}>{reveal ? keyFull : keyText}</Text>

          <Pressable
            disabled={busy}
            onPress={() => setReveal((v) => !v)}
            style={[styles.btn, styles.btnLight, { marginTop: 10 }]}
          >
            <Text style={styles.btnLightText}>{reveal ? "apiKey verbergen" : "apiKey anzeigen"}</Text>
          </Pressable>
        </View>

        <Pressable disabled={busy} onPress={refreshStatus} style={[styles.btn, styles.btnDark, busy && styles.btnDisabled]}>
          <Text style={styles.btnDarkText}>{busy ? "Lade…" : "Status aktualisieren"}</Text>
        </Pressable>

        <Pressable disabled={busy} onPress={() => router.replace("/forms")} style={[styles.btn, styles.btnLight]}>
          <Text style={styles.btnLightText}>Zu Formularen</Text>
        </Pressable>

        <Pressable disabled={busy} onPress={onReset} style={[styles.btn, styles.btnAccent]}>
          <Text style={styles.btnDarkText}>Gerät zurücksetzen</Text>
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
  mono: { fontFamily: "monospace", opacity: 0.85, color: UI.text },

  btn: { paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnDark: { backgroundColor: UI.text },
  btnDarkText: { color: "white", fontWeight: "900" },

  btnLight: { backgroundColor: "rgba(17,24,39,0.06)" },
  btnLightText: { fontWeight: "900", color: UI.text },

  btnAccent: { backgroundColor: UI.accent },

  btnDisabled: { opacity: 0.6 },
});
