import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { PoweredBy } from "../src/ui/PoweredBy";
import MobileContentHeader from "../src/ui/MobileContentHeader";
import { UI } from "../src/ui/tokens";
import { ACCENT_HEX } from "../src/lib/mobileConfig";
import { useBranding } from "../src/features/branding/useBranding";

export default function LeadsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;
  const accentColor = brandingState.kind === "ready" ? branding.accentColor ?? ACCENT_HEX : ACCENT_HEX;

  const scrollPadBottom = useMemo(
    () => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 48,
    [insets.bottom]
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: scrollPadBottom }]}>
        <MobileContentHeader title="Leads" logoDataUrl={logoDataUrl} />

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Lead-Liste</Text>
          <Text style={styles.title}>Alle erfassten Kontakte an einem Ort.</Text>
          <Text style={styles.text}>
            Für TP 9.5 bleibt dieser Screen bewusst ruhig. Er ist der feste Platz für Suche, Filter und Lead-Details im GoLive-Betrieb.
          </Text>

          <Pressable style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryBtnText}>Neuen Lead erfassen</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Aktueller Fokus</Text>
          <Text style={styles.itemTitle}>Saubere Informationsarchitektur</Text>
          <Text style={styles.itemText}>
            Hauptnavigation reduziert, Capture-Flow zentralisiert, Gates aus der Normalnavigation entfernt.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Als Nächstes in Leads</Text>
          <Text style={styles.itemText}>Suche, Filter, Status-Badges, Lead-Liste und Detail-Ansicht.</Text>
        </View>

        <PoweredBy />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  body: {
    paddingHorizontal: UI.padX,
    paddingTop: 8,
    gap: 14,
  },
  hero: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 18,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: UI.text,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
    color: UI.text,
    letterSpacing: -0.3,
  },
  text: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
  primaryBtn: {
    marginTop: 16,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: UI.text,
    marginBottom: 4,
  },
  itemText: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
});
