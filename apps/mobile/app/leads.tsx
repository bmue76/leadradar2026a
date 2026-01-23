import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LeadsScreen() {
  const insets = useSafeAreaInsets();
  const padBottom = 32 + Math.max(insets.bottom, 0) + 120;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: padBottom }]}>
      <Text style={styles.title}>Leads</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>Recent Captures</Text>
        <Text style={styles.p}>
          MVP: Dieser Tab zeigt später lokale “Recent Captures” (online erfasst), z.B. als letzter Verlauf.
          Server-seitige Lead-Liste kommt in einem separaten Teilprojekt.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 18, paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 30, fontWeight: "700", letterSpacing: -0.2, marginBottom: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  h2: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  p: { opacity: 0.75, lineHeight: 19 },
});
