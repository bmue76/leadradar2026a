import React from "react";
import { Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useBranding } from "../features/branding/useBranding";
import { PoweredBy } from "./PoweredBy";
import { UI } from "./tokens";

type Props = {
  title: string;
  children: React.ReactNode;
  scroll?: boolean;
};

export function ScreenScaffold({ title, children, scroll = false }: Props) {
  const { branding } = useBranding();

  const Body = scroll ? ScrollView : View;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar backgroundColor="white" barStyle="dark-content" />

      <Body style={styles.body} contentContainerStyle={scroll ? styles.bodyContent : undefined}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.tenantLogoWrap}>
              {branding.logoDataUrl ? (
                <Pressable onPress={() => { /* optional: tenant could link later */ }}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image source={{ uri: branding.logoDataUrl }} style={styles.tenantLogo} resizeMode="contain" />
                </Pressable>
              ) : null}
            </View>
          </View>

          <Text style={styles.tenantName}>{branding.tenantName ?? "—"}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>

        {children}

        <View style={{ height: 10 }} />
        <PoweredBy />
      </Body>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },
  body: { flex: 1, backgroundColor: UI.bg },
  bodyContent: { paddingHorizontal: UI.padX, paddingBottom: UI.padBottom },

  header: { paddingHorizontal: UI.padX, paddingTop: UI.padTop, paddingBottom: 6 },

  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },

  // links bündig (Padding aushebeln)
  tenantLogoWrap: {
    width: 160,
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
    marginLeft: -UI.padX,
  },
  tenantLogo: { width: 160, height: 44 },

  tenantName: { marginTop: 8, fontSize: 18, fontWeight: "700", color: UI.text },

  title: { marginTop: UI.tenantToTitleGap, fontSize: UI.titleFontSize, fontWeight: UI.titleWeight, color: UI.text },
});
