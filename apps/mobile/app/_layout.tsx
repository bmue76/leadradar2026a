import React, { useEffect, useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";

import { LicenseGateProvider, useLicenseGate } from "../src/lib/useLicenseGate";

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <ActivityIndicator />
      <Text style={{ marginTop: 12, opacity: 0.7 }}>LeadRadar wird gestartet …</Text>
    </View>
  );
}

/**
 * Global Gate:
 * - Ohne aktive Lizenz: Redirect -> /activate
 * - Settings bleibt immer erreichbar (damit baseUrl/tenantSlug korrigierbar ist)
 * - Mit aktiver Lizenz: /activate wird verlassen -> /forms
 */
function GateAwareStack() {
  const router = useRouter();
  const segments = useSegments();
  const { loading, derived } = useLicenseGate();

  const routeInfo = useMemo(() => {
    // Expo Router typing kann hier "never[]" inferieren -> wir normalisieren auf string[]
    const segs = (Array.isArray(segments) ? (segments as unknown as string[]) : []) as string[];
    const has = (name: string) => segs.includes(name);

    const isSettings = has("settings");
    const isActivate = has("activate") || has("license");
    const isPublic = isSettings || isActivate;

    return { isActivate, isPublic };
  }, [segments]);

  useEffect(() => {
    if (loading) return;

    if (!derived.active && !routeInfo.isPublic) {
      router.replace("/activate");
      return;
    }

    if (derived.active && routeInfo.isActivate) {
      router.replace("/forms");
      return;
    }
  }, [loading, derived.active, routeInfo.isPublic, routeInfo.isActivate, router]);

  if (loading) return <Splash />;

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <LicenseGateProvider>
      <GateAwareStack />
    </LicenseGateProvider>
  );
}
