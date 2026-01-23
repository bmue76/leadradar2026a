import React from "react";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

function TabsShell() {
  const insets = useSafeAreaInsets();
  const padBottom = Math.max(insets.bottom, 10);
  const height = 56 + padBottom;

  return (
    <>
      <StatusBar style="dark" backgroundColor="#FFFFFF" translucent={false} />

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            height,
            paddingBottom: padBottom,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontWeight: "700",
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="forms" options={{ title: "Formulare" }} />
        <Tabs.Screen name="leads" options={{ title: "Leads" }} />
        <Tabs.Screen name="stats" options={{ title: "Stats" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />

        {/* Non-tab routes */}
        <Tabs.Screen name="provision" options={{ href: null }} />
        <Tabs.Screen name="forms/[id]" options={{ href: null }} />
      </Tabs>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <TabsShell />
    </SafeAreaProvider>
  );
}
