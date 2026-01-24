import React from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const ACCENT = "#D12B2B";

export default function RootLayout() {
  const insets = useSafeAreaInsets();
  const tabH = 56 + Math.max(insets.bottom, 10);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: "#6B7280",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
        tabBarItemStyle: { flex: 1 },
        tabBarStyle: {
          height: tabH,
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: 6,
          borderTopColor: "rgba(0,0,0,0.08)",
          backgroundColor: "white",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="forms"
        options={{
          title: "Formulare",
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          title: "Leads",
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size ?? 22} color={color} />,
        }}
      />

      <Tabs.Screen name="provision" options={{ href: null }} />
      <Tabs.Screen name="forms/[id]" options={{ href: null }} />
    </Tabs>
  );
}
