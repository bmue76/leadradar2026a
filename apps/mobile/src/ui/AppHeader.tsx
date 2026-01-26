/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { UI } from "./tokens";

export type AppHeaderProps = {
  title: string;
  tenantName?: string | null;
  logoDataUrl?: string | null; // data-url (base64) or normal URL
};

function AppHeaderImpl({ title, tenantName = null, logoDataUrl = null }: AppHeaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.topRow}>
        <View style={styles.logoWrap}>
          {logoDataUrl ? (
            <Image source={{ uri: logoDataUrl }} style={styles.logo} resizeMode="contain" accessibilityLabel="" />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
        </View>

        <View style={styles.rightCol}>
          {tenantName ? <Text style={styles.tenantName}>{tenantName}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
    </View>
  );
}

export const AppHeader = AppHeaderImpl;
export default AppHeaderImpl;

const styles = StyleSheet.create({
  root: {
    backgroundColor: UI.bg,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoWrap: {
    width: 120,
    height: 34,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  logo: {
    width: 120,
    height: 34,
  },
  logoPlaceholder: {
    width: 56,
    height: 20,
    borderRadius: 6,
    backgroundColor: "rgba(17,24,39,0.08)",
  },
  rightCol: {
    flex: 1,
    minHeight: 34,
    justifyContent: "center",
  },
  tenantName: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(17,24,39,0.55)",
    marginBottom: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "rgba(17,24,39,0.95)",
    letterSpacing: -0.2,
  },
});
