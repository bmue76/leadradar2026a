import React, { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";

import { useBranding } from "../features/branding/useBranding";
import { UI } from "./tokens";

type Props = { title: string };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function AppHeader({ title }: Props) {
  const { branding } = useBranding();
  const { width: screenW } = useWindowDimensions();

  const tenantName = branding.tenantName ?? "—";
  const logoUri = branding.logoDataUrl;

  const logoW = useMemo(() => {
    const contentW = Math.max(0, screenW - UI.padX * 2);
    const raw = Math.round(contentW * UI.logoWidthRatio);
    const max = Math.min(UI.logoWidthMax, contentW);
    return clamp(raw, UI.logoWidthMin, max);
  }, [screenW]);

  return (
    <View style={styles.wrap}>
      {logoUri ? (
        <View style={styles.logoRow}>
          <Image
            source={{ uri: logoUri }}
            style={[styles.logo, { width: logoW, height: UI.logoHeight }]}
            contentFit="contain"
            contentPosition="left center"
            accessible
            accessibilityLabel="Tenant Logo"
          />
        </View>
      ) : null}

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
  // bleibt im normalen Content-Padding (kein marginLeft -UI.padX)
  logoRow: {
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: UI.logoHeight + 8,
  },
  logo: {
    // width/height kommen dynamisch rein
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
