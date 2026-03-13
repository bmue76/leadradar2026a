/* eslint-disable jsx-a11y/alt-text */
import React, { useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { UI } from "./tokens";

export type MobileContentHeaderProps = {
  title: string;
  tenantName?: string | null;
  logoDataUrl?: string | null;
};

const LOGO_HEIGHT = 28;
const LOGO_MAX_WIDTH = 116;
const FALLBACK_ASPECT_RATIO = 3.0;

export default function MobileContentHeader({
  title,
  logoDataUrl = null,
}: MobileContentHeaderProps) {
  const [aspectRatio, setAspectRatio] = useState<number>(FALLBACK_ASPECT_RATIO);

  const logoStyle = useMemo(
    () => [
      styles.logo,
      {
        height: LOGO_HEIGHT,
        maxWidth: LOGO_MAX_WIDTH,
        aspectRatio,
      },
    ],
    [aspectRatio]
  );

  return (
    <View style={styles.root}>
      {logoDataUrl ? (
        <View style={styles.logoRow}>
          <Image
            source={{ uri: logoDataUrl }}
            style={logoStyle}
            resizeMode="contain"
            accessibilityLabel=""
            onLoad={(event) => {
              const w = event.nativeEvent.source?.width ?? 0;
              const h = event.nativeEvent.source?.height ?? 0;
              if (w > 0 && h > 0) {
                setAspectRatio(w / h);
              }
            }}
          />
        </View>
      ) : null}

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 6,
    paddingBottom: 6,
    alignItems: "flex-start",
  },
  logoRow: {
    minHeight: 30,
    justifyContent: "center",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  logo: {},
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: UI.text,
    letterSpacing: -0.2,
    textAlign: "left",
  },
});
