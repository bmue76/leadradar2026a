import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

import { apiFetch } from "../src/lib/api";
import { clearApiKey, getApiKey } from "../src/lib/auth";
import { getActiveEventId } from "../src/lib/eventStorage";
import { PoweredBy } from "../src/ui/PoweredBy";
import MobileContentHeader from "../src/ui/MobileContentHeader";
import { UI } from "../src/ui/tokens";
import { ACCENT_HEX } from "../src/lib/mobileConfig";
import { useBranding } from "../src/features/branding/useBranding";

type JsonObject = Record<string, unknown>;
type CaptureModeKey = "businessCard" | "qr" | "contacts" | "manual";

type FormListItem = {
  id: string;
  name: string;
};

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function parseForms(data: unknown): FormListItem[] {
  const arr = Array.isArray(data)
    ? data
    : isObject(data) && Array.isArray(data.forms)
      ? (data.forms as unknown[])
      : isObject(data) && Array.isArray(data.items)
        ? (data.items as unknown[])
        : [];

  const out: FormListItem[] = [];
  for (const it of arr) {
    if (!isObject(it)) continue;
    const id = pickString(it.id);
    if (!id) continue;

    out.push({
      id,
      name: pickString(it.name) ?? id,
    });
  }
  return out;
}

function buildFormPath(formId: string, eventId: string, mode: CaptureModeKey): string {
  const q = `eventId=${encodeURIComponent(eventId)}&mode=${encodeURIComponent(mode)}`;
  return `/forms/${encodeURIComponent(formId)}?${q}`;
}

export default function CaptureLauncherScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const [busyMode, setBusyMode] = useState<CaptureModeKey | null>(null);

  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;
  const accentColor = brandingState.kind === "ready" ? branding.accentColor ?? ACCENT_HEX : ACCENT_HEX;

  const scrollPadBottom = useMemo(
    () => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 48,
    [insets.bottom]
  );

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, [router]);

  const openMode = useCallback(
    async (mode: CaptureModeKey) => {
      setBusyMode(mode);

      try {
        const apiKey = await getApiKey();
        if (!apiKey) {
          router.replace("/provision");
          return;
        }

        const eventId = await getActiveEventId();
        if (!eventId) {
          router.replace("/event-gate?next=capture");
          return;
        }

        const res = await apiFetch<unknown>({
          method: "GET",
          path: `/api/mobile/v1/forms?eventId=${encodeURIComponent(eventId)}`,
          apiKey,
          timeoutMs: 20_000,
        });

        if (!res.ok) {
          const status = res.status ?? 0;
          const code = res.code ?? "";
          const msg = res.message || `HTTP ${status || "?"}`;

          if (status === 402 || code === "PAYMENT_REQUIRED") {
            router.replace("/license");
            return;
          }

          if (status === 401 || code === "INVALID_API_KEY") {
            await reActivate();
            return;
          }

          if (code === "EVENT_NOT_ACTIVE" || code === "NOT_FOUND") {
            router.replace("/event-gate?next=capture");
            return;
          }

          Alert.alert("Formulare konnten nicht geladen werden", msg);
          return;
        }

        const forms = parseForms(res.data);

        if (forms.length === 0) {
          Alert.alert(
            "Kein Formular verfügbar",
            "Für das aktuell gewählte Event ist kein aktives Formular zugewiesen."
          );
          return;
        }

        if (forms.length === 1) {
          router.push(buildFormPath(forms[0].id, eventId, mode));
          return;
        }

        router.push(`/forms?eventId=${encodeURIComponent(eventId)}&mode=${encodeURIComponent(mode)}`);
      } finally {
        setBusyMode(null);
      }
    },
    [reActivate, router]
  );

  const isBusy = busyMode !== null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: scrollPadBottom }]}>
        <MobileContentHeader title="Lead erfassen" logoDataUrl={logoDataUrl} />

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Capture Launcher</Text>
          <Text style={styles.title}>Erfassungsart zuerst. Formular danach.</Text>
          <Text style={styles.text}>
            Der Flow bleibt bewusst klar: zuerst die Art der Erfassung wählen, danach das passende Formular öffnen.
          </Text>
        </View>

        <View style={styles.grid}>
          <Pressable
            style={[styles.card, isBusy && busyMode !== "businessCard" ? styles.cardDisabled : null]}
            onPress={() => void openMode("businessCard")}
            disabled={isBusy}
          >
            <View style={styles.iconWrap}>
              {busyMode === "businessCard" ? <ActivityIndicator color={accentColor} /> : <Ionicons name="card-outline" size={24} color={UI.text} />}
            </View>
            <Text style={styles.cardTitle}>Visitenkarte scannen</Text>
            <Text style={styles.cardText}>Kamera oder Fotoauswahl für OCR-gestützte Erfassung.</Text>
          </Pressable>

          <Pressable
            style={[styles.card, isBusy && busyMode !== "qr" ? styles.cardDisabled : null]}
            onPress={() => void openMode("qr")}
            disabled={isBusy}
          >
            <View style={styles.iconWrap}>
              {busyMode === "qr" ? <ActivityIndicator color={accentColor} /> : <Ionicons name="qr-code-outline" size={24} color={UI.text} />}
            </View>
            <Text style={styles.cardTitle}>QR-Code scannen</Text>
            <Text style={styles.cardText}>Native QR-Erkennung mit Übergabe ins Kontakt-Mapping.</Text>
          </Pressable>

          <Pressable
            style={[styles.card, isBusy && busyMode !== "contacts" ? styles.cardDisabled : null]}
            onPress={() => void openMode("contacts")}
            disabled={isBusy}
          >
            <View style={styles.iconWrap}>
              {busyMode === "contacts" ? <ActivityIndicator color={accentColor} /> : <Ionicons name="people-outline" size={24} color={UI.text} />}
            </View>
            <Text style={styles.cardTitle}>Aus Kontakten</Text>
            <Text style={styles.cardText}>Bestehenden Kontakt übernehmen und im Formular ergänzen.</Text>
          </Pressable>

          <Pressable
            style={[styles.card, isBusy && busyMode !== "manual" ? styles.cardDisabled : null]}
            onPress={() => void openMode("manual")}
            disabled={isBusy}
          >
            <View style={styles.iconWrap}>
              {busyMode === "manual" ? <ActivityIndicator color={accentColor} /> : <Ionicons name="create-outline" size={24} color={UI.text} />}
            </View>
            <Text style={styles.cardTitle}>Manuell erfassen</Text>
            <Text style={styles.cardText}>Direkt ins Formular springen und Lead klassisch erfassen.</Text>
          </Pressable>
        </View>

        <PoweredBy />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  body: {
    paddingHorizontal: UI.padX,
    paddingTop: 8,
    gap: 14,
  },
  hero: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 18,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: UI.text,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
    color: UI.text,
    letterSpacing: -0.3,
  },
  text: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
  grid: {
    gap: 10,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 6,
  },
  cardText: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
});
