// apps/mobile/app/_layout.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UI } from "../src/ui/tokens";
import { getApiKey } from "../src/lib/auth";
import { fetchMobileBranding, isHexColor } from "../src/lib/branding";

export default function RootLayout() {
  const insets = useSafeAreaInsets();

  const [accentOverride, setAccentOverride] = useState<string | null>(null);

  const tabBarHeight = UI.tabBarBaseHeight + Math.max(insets.bottom, UI.tabBarPadBottomMin);

  const loadBranding = useCallback(async () => {
    const key = await getApiKey();
    if (!key) {
      setAccentOverride(null);
      return;
    }

    const res = await fetchMobileBranding({ apiKey: key });
    if (!res.ok) {
      setAccentOverride(null);
      return;
    }

    const accent = res.data?.branding?.accentColor ?? null;
    setAccentOverride(isHexColor(accent) ? accent.toUpperCase() : null);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadBranding();
    }, 0);
    return () => clearTimeout(id);
  }, [loadBranding]);

  const tabAccent = useMemo(() => accentOverride ?? UI.accent, [accentOverride]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabAccent,
        tabBarInactiveTintColor: "rgba(17,24,39,0.45)",
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: UI.tabBarPadTop,
          paddingBottom: Math.max(insets.bottom, UI.tabBarPadBottomMin),
          backgroundColor: UI.bg,
          borderTopColor: UI.border,
        },
        tabBarItemStyle: {
          flex: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
        },
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
  );
}
