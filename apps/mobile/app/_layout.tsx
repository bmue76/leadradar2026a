// apps/mobile/app/_layout.tsx
import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UI } from "../src/ui/tokens";
import { BrandingProvider } from "../src/ui/useTenantBranding";

export default function RootLayout() {
  const insets = useSafeAreaInsets();

  const tabBarHeight = UI.tabBarBaseHeight + Math.max(insets.bottom, UI.tabBarPadBottomMin);

  return (
    <BrandingProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: UI.accent,
          tabBarInactiveTintColor: "rgba(17,24,39,0.45)",
          tabBarStyle: {
            height: tabBarHeight,
            paddingTop: UI.tabBarPadTop,
            paddingBottom: Math.max(insets.bottom, UI.tabBarPadBottomMin),
            backgroundColor: UI.bg,
            borderTopColor: UI.border,
          },
          tabBarItemStyle: { flex: 1 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        }}
      >
        {/* Visible Tabs */}
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="forms"
          options={{
            title: "Formulare",
            tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="leads"
          options={{
            title: "Leads",
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: "Stats",
            tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
          }}
        />

        {/* Hidden Routes */}
        <Tabs.Screen name="provision" options={{ href: null }} />
        <Tabs.Screen name="forms/[id]" options={{ href: null }} />
      </Tabs>
    </BrandingProvider>
  );
}
