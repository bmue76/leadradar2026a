import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";

import { apiFetch } from "../../src/lib/api";
import { clearApiKey, getApiKey } from "../../src/lib/auth";
import { getApiBaseUrl } from "../../src/lib/env";

type FormSummary = {
  id: string;
  name?: string;
  title?: string;
  status?: string;
};

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function asFormSummary(v: unknown): FormSummary | null {
  if (!isObject(v)) return null;
  const id = v.id;
  if (typeof id !== "string" || !id.trim()) return null;
  const name = typeof v.name === "string" ? v.name : undefined;
  const title = typeof v.title === "string" ? v.title : undefined;
  const status = typeof v.status === "string" ? v.status : undefined;
  return { id, name, title, status };
}

function labelForForm(f: FormSummary): string {
  return f.name || f.title || f.id;
}

function keyInfo(key: string | null): string {
  if (!key) return "—";
  const trimmed = key.trim();
  const prefix = trimmed.slice(0, Math.min(12, trimmed.length));
  return `${prefix}… (len ${trimmed.length})`;
}

export default function FormsIndex() {
  const baseUrl = useMemo(() => getApiBaseUrl(), []);
  const [items, setItems] = useState<FormSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string>("");
  const [storedKeyInfo, setStoredKeyInfo] = useState<string>("—");

  const load = useCallback(async () => {
    setErrorText("");
    setBusy(true);
    try {
      const key = await getApiKey();
      setStoredKeyInfo(keyInfo(key));

      if (!key) {
        router.replace("/provision");
        return;
      }

      const res = await apiFetch<unknown>({
        method: "GET",
        path: "/api/mobile/v1/forms",
        apiKey: key,
      });

      if (!res.ok) {
        const msg = `HTTP ${res.status} — ${res.message}${res.traceId ? ` (traceId: ${res.traceId})` : ""}`;
        setErrorText(msg);
        setItems([]);
        return;
      }

      const data = res.data;
      let rawList: unknown[] = [];

      if (Array.isArray(data)) rawList = data;
      else if (isObject(data) && Array.isArray(data.forms)) rawList = data.forms as unknown[];
      else if (isObject(data) && Array.isArray(data.items)) rawList = data.items as unknown[];

      const list = rawList.map(asFormSummary).filter((x): x is FormSummary => x !== null);
      setItems(list);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, []);

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "900" }}>Formulare</Text>

      <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", gap: 6 }}>
        <Text style={{ fontWeight: "800" }}>API Base URL</Text>
        <Text style={{ fontFamily: "monospace", opacity: 0.85 }}>{baseUrl}</Text>
        <Text style={{ fontWeight: "800", marginTop: 6 }}>Gespeicherter apiKey</Text>
        <Text style={{ fontFamily: "monospace", opacity: 0.85 }}>{storedKeyInfo}</Text>
      </View>

      {errorText ? (
        <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" }}>
          <Text style={{ fontWeight: "900", color: "#991B1B" }}>Hinweis</Text>
          <Text style={{ color: "#991B1B", marginTop: 6 }}>{errorText}</Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              onPress={load}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#111827", alignItems: "center" }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>Retry</Text>
            </Pressable>

            <Pressable
              onPress={reActivate}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#DC2626", alignItems: "center" }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>Neu aktivieren</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!errorText && !busy && items.length === 0 ? (
        <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", gap: 8 }}>
          <Text style={{ fontWeight: "900" }}>Keine Formulare zugewiesen.</Text>
          <Text style={{ opacity: 0.75 }}>Weise im Admin ein ACTIVE Form dem Device zu.</Text>
          <Pressable
            onPress={reActivate}
            style={{ paddingVertical: 10, borderRadius: 12, backgroundColor: "#111827", alignItems: "center" }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>Neu aktivieren</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/forms/${item.id}`)}
            style={{
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              marginBottom: 10,
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontWeight: "900" }}>{labelForForm(item)}</Text>
            <Text style={{ opacity: 0.7, marginTop: 4, fontFamily: "monospace" }}>{item.id}</Text>
            {item.status ? <Text style={{ opacity: 0.7, marginTop: 4 }}>Status: {item.status}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
