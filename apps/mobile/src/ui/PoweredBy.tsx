import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function PoweredBy() {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text style={styles.text}>Powered by LeadRadar</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  text: {
    color: "rgba(17,24,39,0.35)",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
