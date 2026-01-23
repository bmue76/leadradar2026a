import React from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function RootLayout() {
  const insets = useSafeAreaInsets();

  const baseHeight = 58;
  const height = baseHeight + Math.max(insets.bottom, 0);
  const padBottom = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height,
          paddingBottom: padBottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="forms" options={{ title: "Formulare" }} />
      <Tabs.Screen name="leads" options={{ title: "Leads" }} />
      <Tabs.Screen name="stats" options={{ title: "Stats" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />

      {/* Hidden routes (must exist as files). Provision is outside Tabs. */}
      <Tabs.Screen name="provision" options={{ href: null }} />
    </Tabs>
  );
}
