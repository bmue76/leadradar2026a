import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { useBranding } from "../features/branding/useBranding";
import { UI } from "./tokens";

type Props = { title: string };

export function AppHeader({ title }: Props) {
  const { branding } = useBranding();

  const tenantName = branding.tenantName ?? "—";
  const logoUri = branding.logoDataUrl;

  return (
    <View style={styles.wrap}>
      <View style={styles.logoRow}>
        {logoUri ? (
          <Image
            source={{ uri: logoUri }}
            style={styles.logo}
            contentFit="contain"
            contentPosition="left center"
            accessible
            accessibilityLabel="Tenant Logo"
          />
        ) : null}
      </View>

      <Text style={styles.tenantName}>{tenantName}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: UI.padTop,
    paddingBottom: 4,
  },

  // kein “full-bleed” mehr => Logo richtet sich am gleichen Padding aus wie Tenant/Title/Content
  logoRow: {
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: UI.logoHeight + 8,
  },

  // Box darf gross sein – Inhalt ist links verankert via contentPosition
  logo: {
    width: UI.logoWidth,
    height: UI.logoHeight,
  },

  tenantName: {
    marginTop: 6,
    fontSize: UI.tenantFontSize,
    fontWeight: "700",
    color: UI.text,
    opacity: 0.85,
  },

  title: {
    marginTop: UI.tenantToTitleGap,
    fontSize: UI.titleFontSize,
    fontWeight: UI.titleWeight,
    color: UI.text,
  },
});
