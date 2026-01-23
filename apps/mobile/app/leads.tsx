import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as SecureStore from "expo-secure-store";

const KEY = "lr:recentLeads:v1";

type RecentLead = {
  id: string;
  capturedAt: string;
  label?: string;
};

async function loadRecent(): Promise<RecentLead[]> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentLead[]) : [];
  } catch {
    return [];
  }
}

export default function Leads() {
  const [items, setItems] = useState<RecentLead[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadRecent();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
    >
      <Text style={styles.title}>Leads</Text>

      {items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Noch keine lokalen Einträge</Text>
          <Text style={styles.cardSub}>
            Dieser Tab zeigt „Recent Captures“ lokal (MVP). Sobald der Capture-Flow Einträge speichert, erscheinen sie hier.
          </Text>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push("/")}>
            <Text style={styles.secondaryBtnText}>Zurück zu Home</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          {items.slice(0, 50).map((l) => (
            <View key={l.id} style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="person-circle-outline" size={22} color="#444" />
                <View>
                  <Text style={styles.rowTitle}>{l.label ?? "Lead"}</Text>
                  <Text style={styles.rowSub}>{new Date(l.capturedAt).toLocaleString()}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.hint}>Pull to refresh</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F6F6F6" },
  container: { padding: 16, paddingBottom: 24 },
  title: { marginTop: 10, marginBottom: 10, fontSize: 34, fontWeight: "700", color: "#111" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ECECEC",
    marginTop: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#111" },
  cardSub: { marginTop: 8, fontSize: 13, color: "#666", lineHeight: 18 },
  secondaryBtn: {
    marginTop: 12,
    backgroundColor: "#F6F6F6",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9E9E9",
  },
  secondaryBtnText: { color: "#333", fontWeight: "700" },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F1F1" },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: "#111" },
  rowSub: { marginTop: 2, fontSize: 12, color: "#777" },
  hint: { marginTop: 12, textAlign: "center", color: "#888", fontSize: 12 },
});
