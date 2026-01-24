import React from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiBaseUrl } from "../lib/env";
import { UI } from "./tokens";

export function PoweredBy() {
  const baseUrl = getApiBaseUrl();
  const leadradarLogoUri = `${baseUrl.replace(/\/+$/, "")}/brand/leadradar-logo.png`;

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>powered by</Text>

      <Pressable
        onPress={() => {
          void Linking.openURL(UI.poweredByUrl);
        }}
        hitSlop={10}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image source={{ uri: leadradarLogoUri }} style={styles.logo} resizeMode="contain" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: UI.poweredByGap, paddingTop: 10, paddingBottom: 6 },
  text: { color: "rgba(17,24,39,0.35)", fontWeight: "800" },
  logo: { height: UI.poweredByLogoHeight, width: 180 },
});
