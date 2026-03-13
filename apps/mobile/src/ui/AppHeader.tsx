/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import BRAND_LOGO from "../../assets/brand/leadradar-logo.png";
import { UI } from "./tokens";

export type AppHeaderProps = {
  title: string;
  tenantName?: string | null;
  logoDataUrl?: string | null;
};

function AppHeaderImpl({ title, tenantName = null, logoDataUrl = null }: AppHeaderProps) {
  const logoSource = logoDataUrl ? { uri: logoDataUrl } : BRAND_LOGO;

  return (
    <View style={styles.root}>
      <View style={styles.logoRow}>
        <Image source={logoSource} style={styles.logo} resizeMode="contain" accessibilityLabel="" />
      </View>

      <View style={styles.textRow}>
        {tenantName ? <Text style={styles.tenantName}>{tenantName}</Text> : null}
        <Text style={styles.title}>{title}</Text>
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
    paddingBottom: 12,
  },
  logoRow: {
    minHeight: 30,
    justifyContent: "center",
    marginBottom: 10,
  },
  logo: {
    width: 132,
    height: 30,
  },
  textRow: {
    alignItems: "flex-start",
    justifyContent: "center",
  },
  tenantName: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(17,24,39,0.55)",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "rgba(17,24,39,0.95)",
    letterSpacing: -0.2,
  },
});
