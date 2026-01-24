import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { getApiBaseUrl } from "../src/lib/env";
import { clearApiKey, getApiKey } from "../src/lib/auth";

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
    <View style={{ flex: 1, padding: 16, gap: 12, backgroundColor: "white" }}>
      <Text style={{ fontSize: 22, fontWeight: "900" }}>Einstellungen</Text>

      <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", gap: 6 }}>
        <Text style={{ fontWeight: "800" }}>API Base URL</Text>
        <Text style={{ fontFamily: "monospace", opacity: 0.85 }}>{baseUrl}</Text>

        <Text style={{ fontWeight: "800", marginTop: 8 }}>Gespeicherter apiKey</Text>
        <Text style={{ fontFamily: "monospace", opacity: 0.85 }}>{reveal ? keyFull : keyText}</Text>

        <Pressable
          disabled={busy}
          onPress={() => setReveal((v) => !v)}
          style={{ marginTop: 8, paddingVertical: 10, borderRadius: 12, backgroundColor: "#F3F4F6", alignItems: "center" }}
        >
          <Text style={{ fontWeight: "900" }}>{reveal ? "apiKey verbergen" : "apiKey anzeigen"}</Text>
        </Pressable>
      </View>

      <Pressable
        disabled={busy}
        onPress={refreshStatus}
        style={{ paddingVertical: 12, borderRadius: 12, backgroundColor: busy ? "#9CA3AF" : "#111827", alignItems: "center" }}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>{busy ? "Lade…" : "Status aktualisieren"}</Text>
      </Pressable>

      <Pressable
        disabled={busy}
        onPress={() => router.replace("/forms")}
        style={{ paddingVertical: 12, borderRadius: 12, backgroundColor: "#F3F4F6", alignItems: "center" }}
      >
        <Text style={{ fontWeight: "800" }}>Zu Formularen</Text>
      </Pressable>

      <Pressable
        disabled={busy}
        onPress={onReset}
        style={{ paddingVertical: 12, borderRadius: 12, backgroundColor: "#DC2626", alignItems: "center" }}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>Gerät zurücksetzen</Text>
      </Pressable>
    </View>
  );
}
