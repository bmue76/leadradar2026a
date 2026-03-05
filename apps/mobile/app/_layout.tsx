import React from "react";
import { Tabs } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { UI } from "../src/ui/tokens";
import { LicenseGateProvider } from "../src/lib/useLicenseGate";

/**
 * Root Navigation (clean)
 * - Visible Tabs: Start, Einsatz, Formulare, Lizenz, Setup
 * - Hidden routes: provision/event-gate (reachable, but not in tab bar)
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LicenseGateProvider>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: UI.bg, borderTopColor: UI.border },
            tabBarActiveTintColor: UI.text,
            tabBarInactiveTintColor: "rgba(0,0,0,0.45)",
          }}
        >
          <Tabs.Screen name="index" options={{ title: "Start" }} />
          <Tabs.Screen name="events" options={{ title: "Einsatz" }} />
          <Tabs.Screen name="forms" options={{ title: "Formulare" }} />
          <Tabs.Screen name="license" options={{ title: "Lizenz" }} />
          <Tabs.Screen name="settings" options={{ title: "Setup" }} />

          {/* Hidden utility routes */}
          <Tabs.Screen name="provision" options={{ href: null, title: "Gerät aktivieren" }} />
          <Tabs.Screen name="event-gate" options={{ href: null, title: "Event wählen" }} />
        </Tabs>
      </LicenseGateProvider>
    </SafeAreaProvider>
  );
}
