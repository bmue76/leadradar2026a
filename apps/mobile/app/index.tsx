import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheetModal } from "../src/ui/BottomSheetModal";
import { useHomeData, AssignedForm } from "../src/features/home/useHomeData";

const ACCENT = "#D33B3B";

// MVP Branding: App Icon as logo.
// Later: replace with tenant branding (API / local mapping) without changing UI structure.
const BRAND_LOGO = require("../assets/icon.png");

function formatEventMeta(startsAt?: string | null, endsAt?: string | null, location?: string | null) {
  const parts: string[] = [];
  try {
    if (startsAt) {
      const s = new Date(startsAt);
      parts.push(s.toLocaleDateString());
    }
    if (endsAt) {
      const e = new Date(endsAt);
      const endStr = e.toLocaleDateString();
      if (!parts.includes(endStr)) parts.push(endStr);
    }
  } catch {
    // ignore
  }
  if (location) parts.push(location);
  return parts.join(" · ");
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { state, refresh } = useHomeData();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMode, setSheetMode] = useState<"lead" | "card" | "manual">("lead");

  const forms = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.forms ?? [];
  }, [state]);

  function openFormPicker(mode: "lead" | "card" | "manual") {
    setSheetMode(mode);
    setSheetVisible(true);
  }

  function goCapture(form: AssignedForm, mode: "lead" | "card" | "manual") {
    setSheetVisible(false);
    router.push({
      pathname: "/forms/[id]",
      params: { id: form.id, entry: mode },
    });
  }

  function onPrimaryCTA() {
    if (state.status === "needsProvision") {
      router.push("/provision");
      return;
    }
    if (state.status !== "ready") {
      void refresh();
      return;
    }

    if (forms.length === 0) {
      Alert.alert(
        "Keine Formulare",
        "Dieser Device hat aktuell keine ACTIVE Formulare zugewiesen. Öffne den Tab „Formulare“.",
        [
          { text: "Abbrechen", style: "cancel" },
          { text: "Zu Formulare", onPress: () => router.push("/forms") },
        ]
      );
      return;
    }

    if (forms.length === 1) {
      goCapture(forms[0], "lead");
      return;
    }

    openFormPicker("lead");
  }

  function onQuickAction(mode: "card" | "manual") {
    if (state.status === "needsProvision") {
      router.push("/provision");
      return;
    }
    if (state.status !== "ready") {
      void refresh();
      return;
    }

    if (forms.length === 0) {
      Alert.alert(
        "Keine Formulare",
        "Bitte zuerst ein Formular auswählen/zuweisen. Öffne den Tab „Formulare“.",
        [
          { text: "Abbrechen", style: "cancel" },
          { text: "Zu Formulare", onPress: () => router.push("/forms") },
        ]
      );
      return;
    }

    if (forms.length === 1) {
      goCapture(forms[0], mode);
      return;
    }

    openFormPicker(mode);
  }

  // Enough space so the last button row is always reachable above tab bar + Android system nav
  const extraBottom = 24 + Math.max(insets.bottom, 0) + 72;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.container, { paddingBottom: extraBottom, paddingTop: 16 + insets.top * 0.2 }]}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
    >
      <View style={styles.headerRow}>
        <View style={styles.brandRow}>
          <Image source={BRAND_LOGO} style={styles.brandLogo} resizeMode="contain" />
        </View>

        <Pressable onPress={() => router.push("/stats")} style={styles.iconBtn} accessibilityRole="button">
          <Ionicons name="stats-chart-outline" size={20} color="#444" />
        </Pressable>
      </View>

      <Text style={styles.title}>Home</Text>

      {state.status === "loading" && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Lade…</Text>
        </View>
      )}

      {state.status === "needsProvision" && (
        <View style={[styles.card, styles.warnCard]}>
          <Text style={styles.cardTitle}>Device nicht aktiviert</Text>
          <Text style={styles.cardSub}>Bitte Provisioning durchführen, um online erfassen zu können.</Text>
          <Pressable style={[styles.btn, { marginTop: 12 }]} onPress={() => router.push("/provision")}>
            <Text style={styles.btnText}>Provisioning öffnen</Text>
          </Pressable>
        </View>
      )}

      {state.status === "error" && (
        <View style={[styles.card, styles.warnCard]}>
          <Text style={styles.cardTitle}>Netzwerkfehler</Text>
          <Text style={styles.cardSub}>{state.message}</Text>
          <Pressable style={[styles.btn, { marginTop: 12 }]} onPress={refresh}>
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {state.status === "ready" && (
        <>
          {/* Active Event */}
          <Pressable style={styles.card} onPress={() => router.push("/stats")}>
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {state.activeEvent ? state.activeEvent.name : "Kein aktives Event"}
                </Text>
                <Text style={styles.cardSub}>
                  {state.activeEvent
                    ? formatEventMeta(state.activeEvent.startsAt, state.activeEvent.endsAt, state.activeEvent.location)
                    : "Bitte Event aktivieren (Admin) oder Retry."}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9A9A9A" />
            </View>

            {!state.activeEvent && (
              <Pressable style={[styles.secondaryBtn, { marginTop: 12 }]} onPress={refresh}>
                <Text style={styles.secondaryBtnText}>Retry</Text>
              </Pressable>
            )}
          </Pressable>

          {/* Mini Stats */}
          <Pressable style={styles.card} onPress={() => router.push("/stats")}>
            <Text style={styles.cardTitle}>Statistik heute</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Leads</Text>
                <Text style={styles.statValue}>{state.stats.leadsToday}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Ø pro Stunde</Text>
                <Text style={styles.statValue}>{state.stats.avgPerHour}/h</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Anhänge ausstehend</Text>
                <Text style={styles.statValue}>{state.stats.pendingAttachments}</Text>
              </View>
            </View>

            <View style={styles.miniBars}>
              {(state.stats.todayHourlyBuckets ?? []).slice(-12).map((b) => {
                const h = Math.max(4, Math.min(36, b.count * 6));
                return <View key={String(b.hour)} style={[styles.bar, { height: h }]} />;
              })}
              {(state.stats.todayHourlyBuckets ?? []).length === 0 && (
                <Text style={styles.cardSub}>Weitere Statistiken im Tab „Stats“</Text>
              )}
            </View>
          </Pressable>

          {/* Primary CTA */}
          <Pressable style={styles.primaryBtn} onPress={onPrimaryCTA}>
            <Text style={styles.primaryBtnText}>Lead erfassen</Text>
          </Pressable>

          {/* Quick Actions */}
          <View style={styles.card}>
            <Pressable style={styles.rowBtn} onPress={() => onQuickAction("card")}>
              <View style={styles.rowLeft}>
                <Ionicons name="card-outline" size={18} color="#444" />
                <Text style={styles.rowText}>Visitenkarte scannen</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9A9A9A" />
            </Pressable>

            <View style={styles.rowDivider} />

            <Pressable style={styles.rowBtn} onPress={() => onQuickAction("manual")}>
              <View style={styles.rowLeft}>
                <Ionicons name="person-add-outline" size={18} color="#444" />
                <Text style={styles.rowText}>Kontakt manuell hinzufügen</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9A9A9A" />
            </Pressable>
          </View>

          <Text style={styles.footerHint}>Daten werden online erfasst · Pull to refresh</Text>
        </>
      )}

      {/* Form Picker */}
      <BottomSheetModal visible={sheetVisible} onClose={() => setSheetVisible(false)}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          <Text style={styles.sheetTitle}>Form wählen</Text>
          <Text style={styles.sheetSub}>Wähle das Formular für den Capture-Flow.</Text>
        </View>

        <View style={{ paddingHorizontal: 8 }}>
          {forms.map((f) => (
            <Pressable key={f.id} style={styles.sheetItem} onPress={() => goCapture(f, sheetMode)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>{f.name}</Text>
                {!!f.description && <Text style={styles.sheetItemSub}>{f.description}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9A9A9A" />
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Pressable style={styles.secondaryBtn} onPress={() => setSheetVisible(false)}>
            <Text style={styles.secondaryBtnText}>Schliessen</Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F6F6F6" },
  container: { paddingHorizontal: 16 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandLogo: { width: 120, height: 28 },

  iconBtn: { padding: 10, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECECEC" },
  title: { marginTop: 14, marginBottom: 10, fontSize: 34, fontWeight: "700", color: "#111" },

  loadingWrap: { padding: 16, alignItems: "center", gap: 10 },
  loadingText: { color: "#666" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ECECEC",
    marginTop: 12,
  },
  warnCard: { borderColor: "#F0D6D6" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  cardSub: { marginTop: 6, fontSize: 13, color: "#666" },

  btn: { backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#FFF", fontWeight: "700" },

  secondaryBtn: {
    backgroundColor: "#F6F6F6",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9E9E9",
  },
  secondaryBtnText: { color: "#333", fontWeight: "700" },

  statsRow: { flexDirection: "row", alignItems: "stretch", marginTop: 12 },
  statBox: { flex: 1 },
  statLabel: { fontSize: 12, color: "#777" },
  statValue: { marginTop: 6, fontSize: 20, fontWeight: "800", color: "#111" },
  divider: { width: 1, backgroundColor: "#EFEFEF", marginHorizontal: 12 },

  miniBars: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    minHeight: 38,
  },
  bar: { width: 10, borderRadius: 6, backgroundColor: "#D9E2F2" },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#FFF", fontWeight: "800", fontSize: 16 },

  rowBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowText: { fontSize: 15, color: "#222", fontWeight: "600" },
  rowDivider: { height: 1, backgroundColor: "#EFEFEF" },

  footerHint: { marginTop: 10, fontSize: 12, color: "#888", textAlign: "center" },

  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#111" },
  sheetSub: { marginTop: 4, fontSize: 13, color: "#666" },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#EFEFEF",
    marginBottom: 8,
  },
  sheetItemTitle: { fontSize: 15, fontWeight: "700", color: "#111" },
  sheetItemSub: { marginTop: 4, fontSize: 12, color: "#666" },
});
