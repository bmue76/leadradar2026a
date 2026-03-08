import React, { useEffect, useMemo, useState } from "react";
import { Animated, Easing, Image as RNImage, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import BRAND_LOGO from "../assets/brand/leadradar-logo.png";
import { getStoredAuth, setStoredAuth } from "../src/lib/mobileStorage";
import { fetchLicense, ApiError } from "../src/lib/mobileApi";
import { ACCENT_HEX } from "../src/lib/mobileConfig";
import CollapsibleDetails from "../src/ui/CollapsibleDetails";
import { getApiKey } from "../src/lib/auth";
import { loadLicenseState } from "../src/lib/licenseState";
import { getAppSettings } from "../src/lib/appSettings";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function StartGate() {
  const router = useRouter();

  const opacityLogo = useMemo(() => new Animated.Value(0), []);
  const scaleLogo = useMemo(() => new Animated.Value(0.96), []);
  const opacitySub = useMemo(() => new Animated.Value(0), []);
  const lift = useMemo(() => new Animated.Value(0), []);

  const [debugErr, setDebugErr] = useState<ApiError | null>(null);
  const [debugMsg, setDebugMsg] = useState<string>("");

  const subtitle = useMemo(() => "Messe Leads. Digital. Sofort.", []);

  useEffect(() => {
    const t0 = Date.now();

    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(opacityLogo, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleLogo, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(opacitySub, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    let routed = false;

    const ensureMin = async () => {
      const dt = Date.now() - t0;
      if (dt < 1200) await sleep(1200 - dt);
    };

    const routeNow = async (path: string) => {
      if (routed) return;
      routed = true;

      Animated.timing(lift, {
        toValue: -30,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        router.replace(path);
      });
    };

    (async () => {
      try {
        const [storedAuth, rawApiKey, licenseState, settings] = await Promise.all([
          getStoredAuth(),
          getApiKey(),
          loadLicenseState(),
          getAppSettings(),
        ]);

        const apiKey = rawApiKey || storedAuth.apiKey || licenseState?.apiKey || null;
        const tenantSlug = storedAuth.tenantSlug || settings.tenantSlug || null;
        const deviceId = storedAuth.deviceId || null;

        // self-heal mobileStorage if apiKey exists elsewhere
        if (apiKey && tenantSlug && (!storedAuth.apiKey || !storedAuth.tenantSlug)) {
          await setStoredAuth({
            tenantSlug,
            apiKey,
            deviceId: deviceId ?? "",
          });
        }

        if (!apiKey) {
          await ensureMin();
          await routeNow("/provision");
          return;
        }

        // Ohne Konto-Kürzel können wir den Mobile-License-Check nicht sauber fahren
        if (!tenantSlug) {
          await ensureMin();
          await routeNow("/provision");
          return;
        }

        const checkPromise = fetchLicense({ apiKey, tenantSlug });

        const maxSplash = 1800;
        const dt = Date.now() - t0;
        const remaining = Math.max(0, maxSplash - dt);

        const winner = await Promise.race([
          (async () => ({ kind: "license" as const, res: await checkPromise }))(),
          (async () => {
            await sleep(remaining);
            return { kind: "timeout" as const };
          })(),
        ]);

        await ensureMin();

        if (winner.kind === "timeout") {
          // ONLINE-only: wenn der Live-Check nicht rechtzeitig kommt, auf Lizenzscreen
          await routeNow("/license");
          return;
        }

        if (winner.res.isActive) {
          await routeNow("/event-gate");
          return;
        }

        await routeNow("/license");
      } catch (e) {
        const err = e as ApiError;
        setDebugErr(err);
        setDebugMsg(err?.message || "Verbindung fehlgeschlagen.");
        await ensureMin();
        await routeNow("/license");
      }
    })();

    return () => {
      routed = true;
    };
  }, [router, lift, opacityLogo, opacitySub, scaleLogo]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bg}>
        <View pointerEvents="none" style={[styles.glowA, { backgroundColor: ACCENT_HEX }]} />
        <View pointerEvents="none" style={[styles.glowB, { backgroundColor: ACCENT_HEX }]} />

        <Animated.View style={[styles.center, { transform: [{ translateY: lift }] }]}>
          <Animated.View style={{ opacity: opacityLogo, transform: [{ scale: scaleLogo }] }}>
            <RNImage source={BRAND_LOGO} style={styles.logo} resizeMode="contain" accessibilityLabel="LeadRadar" />
          </Animated.View>

          <Animated.Text style={[styles.subtitle, { opacity: opacitySub }]}>{subtitle}</Animated.Text>

          <Text style={styles.micro}>Start…</Text>

          <CollapsibleDetails
            title="Details anzeigen"
            lines={[
              ["Hinweis", debugMsg || undefined],
              ["TraceId", debugErr?.traceId],
              ["Error Code", debugErr?.code],
              ["HTTP Status", debugErr?.status ? String(debugErr.status) : undefined],
            ]}
          />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.02)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },

  glowA: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 340,
    top: -190,
    left: -160,
    opacity: 0.10,
  },
  glowB: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 360,
    bottom: -210,
    right: -180,
    opacity: 0.06,
  },

  logo: { width: 240, height: 72 },
  subtitle: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: "800",
    color: "rgba(0,0,0,0.62)",
    textAlign: "center",
  },
  micro: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(0,0,0,0.35)",
  },
});
