import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenScaffold } from "../src/ui/ScreenScaffold";
import { UI } from "../src/ui/tokens";

export default function LeadsScreen() {
  return (
    <ScreenScaffold title="Leads">
      <View style={styles.card}>
        <Text style={styles.h2}>Recent Captures</Text>
        <Text style={styles.p}>
          MVP: Dieser Tab zeigt später lokale “Recent Captures” (online erfasst), z.B. als letzter Verlauf.
          Server-seitige Lead-Liste kommt in einem separaten Teilprojekt.
        </Text>
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
  },
  h2: { fontSize: 16, fontWeight: "800", color: UI.text, marginBottom: 8 },
  p: { opacity: 0.75, lineHeight: 19, color: UI.text },
});
