import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { getStoredAuth } from "../src/lib/mobileStorage";
import { fetchLicense, ApiError } from "../src/lib/mobileApi";
import { ACCENT_HEX } from "../src/lib/mobileConfig";
import CollapsibleDetails from "../src/ui/CollapsibleDetails";

const BRAND_LOGO = require("../assets/brand/leadradar-logo.png");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function StartGate() {
  const router = useRouter();

  const opacityLogo = useRef(new Animated.Value(0)).current;
  const scaleLogo = useRef(new Animated.Value(0.96)).current;
  const opacitySub = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;

  const [debugErr, setDebugErr] = useState<ApiError | null>(null);
  const [debugMsg, setDebugMsg] = useState<string>("");

  const subtitle = useMemo(() => "Messe Leads. Digital. Sofort.", []);

  useEffect(() => {
    const t0 = Date.now();

    // Motion: 0–200ms quiet, 200–900ms logo fade+scale, 900–1200ms subtitle
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(opacityLogo, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(scaleLogo, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(opacitySub, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    let routed = false;

    const routeNow = async (path: string) => {
      if (routed) return;
      routed = true;

      Animated.timing(lift, { toValue: -30, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
        router.replace(path);
      });
    };

    (async () => {
      try {
        const auth = await getStoredAuth();

        // Always ensure min duration ~1.2s
        const ensureMin = async () => {
          const dt = Date.now() - t0;
          if (dt < 1200) await sleep(1200 - dt);
        };

        if (!auth.apiKey) {
          await ensureMin();
          await routeNow("/provision");
          return;
        }

        // License check, but cap splash at 1.8s
        const checkPromise = fetchLicense({ apiKey: auth.apiKey, tenantSlug: auth.tenantSlug });

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
          await routeNow("/license");
          return;
        }

        if (winner.res.isActive) await routeNow("/stats");
        else await routeNow("/license");
      } catch (e) {
        const err = e as ApiError;
        setDebugErr(err);
        setDebugMsg(err?.message || "Verbindung fehlgeschlagen.");

        const dt = Date.now() - t0;
        if (dt < 1200) await sleep(1200 - dt);

        await routeNow("/license");
      }
    })();

    return () => {
      routed = true;
    };
  }, [router, lift, opacityLogo, scaleLogo, opacitySub]);

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient
        colors={["rgba(0,0,0,0.02)", "rgba(255,255,255,1)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bg}
      >
        <Animated.View style={[styles.center, { transform: [{ translateY: lift }] }]}>
          <Animated.View style={{ opacity: opacityLogo, transform: [{ scale: scaleLogo }] }}>
            <Image source={BRAND_LOGO} style={styles.logo} resizeMode="contain" />
          </Animated.View>

          <Animated.Text style={[styles.subtitle, { opacity: opacitySub }]}>{subtitle}</Animated.Text>

          <Text style={styles.micro}>License Check…</Text>

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
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  bg: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },

  // Wordmark feels more enterprise than app icon
  logo: { width: 240, height: 72 },

  subtitle: { marginTop: 14, fontSize: 15, fontWeight: "800", color: "rgba(0,0,0,0.62)", textAlign: "center" },
  micro: { marginTop: 10, fontSize: 12, fontWeight: "700", color: "rgba(0,0,0,0.35)" },
});
