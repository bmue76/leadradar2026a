import React from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "./AppHeader";
import { PoweredBy } from "./PoweredBy";
import { UI } from "./tokens";

type Props = {
  title: string;
  children: React.ReactNode;

  // default: true => Scaffold scrollt selbst (Header + Content + PoweredBy sind normaler Content)
  scroll?: boolean;

  // optional Pull-to-refresh (nur bei scroll=true sinnvoll)
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;

  // optional: erzwingen (falls du mal scroll=false brauchst, aber PoweredBy trotzdem willst)
  showPoweredBy?: boolean;
};

export function ScreenScaffold({
  title,
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  showPoweredBy,
}: Props) {
  const insets = useSafeAreaInsets();

  // genug Luft, damit Content nicht unter TabBar gerät
  const padBottom = UI.padBottom + Math.max(insets.bottom, 0) + UI.tabBarBaseHeight;

  const renderPoweredBy = showPoweredBy ?? scroll;

  if (scroll) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: padBottom }]}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined
          }
        >
          <AppHeader title={title} />
          {children}
          {renderPoweredBy ? <PoweredBy /> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // scroll=false => Scaffold ist nur Container (kein fixed Zeug)
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={[styles.content, { paddingBottom: padBottom, flex: 1 }]}>
        <AppHeader title={title} />
        {children}
        {renderPoweredBy ? <PoweredBy /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },
  content: {
    paddingHorizontal: UI.padX,
    paddingTop: UI.padTop,
    gap: 14,
    backgroundColor: UI.bg,
  },
});
