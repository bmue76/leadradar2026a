import React from "react";
import { RefreshControl, ScrollView, StatusBar, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "./AppHeader";
import { PoweredBy } from "./PoweredBy";
import { UI } from "./tokens";

type Props = {
  title: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  scroll?: boolean; // akzeptieren (für Screens, die es übergeben)
};

export function ScreenScaffold({ title, children, refreshing = false, onRefresh }: Props) {
  const insets = useSafeAreaInsets();
  const padBottom = UI.padBottom + Math.max(insets.bottom, 0) + 96;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar backgroundColor="white" barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: padBottom }]}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={() => void onRefresh()} />
          ) : undefined
        }
      >
        <AppHeader title={title} />

        {children}

        <PoweredBy />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },
  content: { paddingHorizontal: UI.padX, gap: 14 },
});
