import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useBranding } from "../features/branding/useBranding";
import { UI } from "./tokens";

/* eslint-disable jsx-a11y/alt-text */

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
            accessibilityLabel="Tenant Logo"
            style={styles.logo}
            resizeMode="contain"
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

  // Screen padding aushebeln => wirklich links bündig
  logoRow: {
    marginLeft: -UI.padX,
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: UI.logoHeight + 8,
  },
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
