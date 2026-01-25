import React, { useCallback, useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { getApiBaseUrl } from "../lib/env";
import { UI } from "./tokens";

export function PoweredBy() {
  const baseUrl = useMemo(() => getApiBaseUrl(), []);
  const leadradarLogoUri = useMemo(() => `${baseUrl.replace(/\/+$/, "")}/brand/leadradar-logo.png`, [baseUrl]);

  const onOpen = useCallback(async () => {
    const url = UI.poweredByUrl;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
    } catch {
      // silent (no UX noise)
    }
  }, []);

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onOpen} style={styles.press} accessibilityRole="link">
        <Text style={styles.text}>powered by</Text>
        <Image
          source={{ uri: leadradarLogoUri }}
          style={styles.logo}
          contentFit="contain"
          accessible
          accessibilityLabel="LeadRadar"
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 10 },
  press: { alignItems: "center", gap: UI.poweredByGap, paddingVertical: 6, paddingHorizontal: 10 },
  text: { color: "rgba(17,24,39,0.40)", fontWeight: "800" },
  // +15% größer gemäss Tokens
  logo: { height: UI.poweredByLogoHeight, width: 180 },
});
