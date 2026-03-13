import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { UI } from "../src/ui/tokens";
import { ACCENT_HEX } from "../src/lib/mobileConfig";
import { LicenseGateProvider } from "../src/lib/useLicenseGate";
import { useBranding } from "../src/features/branding/useBranding";

type CaptureTabButtonProps = BottomTabBarButtonProps & {
  accentColor: string;
};

function CaptureTabButton(props: CaptureTabButtonProps) {
  const selected = !!props.accessibilityState?.selected;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Lead erfassen"
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      testID={props.testID}
      style={[styles.captureWrap, selected ? styles.captureWrapSelected : null]}
    >
      <View style={[styles.captureBtn, { backgroundColor: props.accentColor }]}>
        <Ionicons name="add" size={22} color="#ffffff" />
      </View>
      <Text style={[styles.captureLabel, selected ? { color: props.accentColor } : null]}>Erfassen</Text>
    </Pressable>
  );
}

function AppTabs() {
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const accentColor = brandingState.kind === "ready" ? branding.accentColor ?? ACCENT_HEX : ACCENT_HEX;

  const visibleTabBarHeight = Platform.select({
    ios: 64 + insets.bottom,
    android: 72 + Math.max(insets.bottom, 8),
    default: 68 + insets.bottom,
  });

  const visibleTabBarPaddingBottom = Platform.select({
    ios: Math.max(insets.bottom, 10),
    android: Math.max(insets.bottom, 12),
    default: Math.max(insets.bottom, 10),
  });

  const visibleTabBarPaddingTop = Platform.select({
    ios: 8,
    android: 8,
    default: 8,
  });

  const visibleTabBarStyle = {
    backgroundColor: "#ffffff",
    borderTopColor: UI.border,
    height: visibleTabBarHeight,
    paddingTop: visibleTabBarPaddingTop,
    paddingBottom: visibleTabBarPaddingBottom,
  } as const;

  const hiddenTabBarStyle = {
    display: "none" as const,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: accentColor,
        tabBarInactiveTintColor: "rgba(0,0,0,0.45)",
        tabBarStyle: visibleTabBarStyle,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Start",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          title: "Leads",
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: "Erfassen",
          tabBarButton: (props) => <CaptureTabButton {...props} accentColor={accentColor} />,
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Performance",
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          href: null,
          tabBarStyle: hiddenTabBarStyle,
        }}
      />
      <Tabs.Screen
        name="activate"
        options={{
          href: null,
          tabBarStyle: hiddenTabBarStyle,
        }}
      />
      <Tabs.Screen
        name="license"
        options={{
          href: null,
          tabBarStyle: hiddenTabBarStyle,
        }}
      />
      <Tabs.Screen
        name="provision"
        options={{
          href: null,
          tabBarStyle: hiddenTabBarStyle,
        }}
      />
      <Tabs.Screen
        name="event-gate"
        options={{
          href: null,
          tabBarStyle: hiddenTabBarStyle,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          href: null,
          tabBarStyle: hiddenTabBarStyle,
        }}
      />
      <Tabs.Screen
        name="forms"
        options={{
          href: null,
          tabBarStyle: hiddenTabBarStyle,
        }}
      />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LicenseGateProvider>
        <AppTabs />
      </LicenseGateProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  captureWrap: {
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: -18,
    width: 86,
  },
  captureWrapSelected: {
    opacity: 1,
  },
  captureBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  captureLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(0,0,0,0.72)",
  },
});
