import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { apiFetch } from "../src/lib/api";
import { clearApiKey, getApiKey } from "../src/lib/auth";
import { getActiveEventId, setActiveEventId } from "../src/lib/eventStorage";
import { PoweredBy } from "../src/ui/PoweredBy";
import MobileContentHeader from "../src/ui/MobileContentHeader";
import { UI } from "../src/ui/tokens";
import { ACCENT_HEX } from "../src/lib/mobileConfig";
import { useBranding } from "../src/features/branding/useBranding";

type JsonObject = Record<string, unknown>;

type EventItem = {
  id: string;
  name: string;
};

type FormItem = {
  id: string;
  name: string;
};

type StatsSummary = {
  leadsToday: number;
  avgPerHour: number;
  pendingAttachments: number;
  lastLeadAt: string | null;
};

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function parseEvents(data: unknown): EventItem[] {
  const arr = Array.isArray(data)
    ? data
    : isObject(data) && Array.isArray(data.events)
      ? (data.events as unknown[])
      : isObject(data) && Array.isArray(data.items)
        ? (data.items as unknown[])
        : [];

  const out: EventItem[] = [];
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

function parseForms(data: unknown): FormItem[] {
  const arr = Array.isArray(data)
    ? data
    : isObject(data) && Array.isArray(data.forms)
      ? (data.forms as unknown[])
      : isObject(data) && Array.isArray(data.items)
        ? (data.items as unknown[])
        : [];

  const out: FormItem[] = [];
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

function parseStats(data: unknown): StatsSummary {
  const obj = isObject(data) ? data : {};
  return {
    leadsToday: Number(obj.leadsToday ?? 0),
    avgPerHour: Number(obj.avgPerHour ?? 0),
    pendingAttachments: Number(obj.pendingAttachments ?? 0),
    lastLeadAt: typeof obj.lastLeadAt === "string" ? obj.lastLeadAt : null,
  };
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: brandingState, branding } = useBranding();

  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>("");

  const [activeEvent, setActiveEventState] = useState<EventItem | null>(null);
  const [forms, setForms] = useState<FormItem[]>([]);
  const [stats, setStats] = useState<StatsSummary>({
    leadsToday: 0,
    avgPerHour: 0,
    pendingAttachments: 0,
    lastLeadAt: null,
  });

  const logoDataUrl = brandingState.kind === "ready" ? branding.logoDataUrl : null;
  const accentColor = brandingState.kind === "ready" ? branding.accentColor ?? ACCENT_HEX : ACCENT_HEX;

  const hasEvent = !!activeEvent;
  const hasSingleForm = forms.length === 1;

  const scrollPadBottom = useMemo(
    () => UI.tabBarBaseHeight + Math.max(insets.bottom, 0) + 48,
    [insets.bottom]
  );

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, [router]);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        router.replace("/provision");
        return;
      }

      const storedEventId = await getActiveEventId();

      const eventsRes = await apiFetch<unknown>({
        method: "GET",
        path: "/api/mobile/v1/events/active",
        apiKey,
        timeoutMs: 20_000,
      });

      if (!eventsRes.ok) {
        const status = eventsRes.status ?? 0;
        const code = eventsRes.code ?? "";
        const msg = eventsRes.message || `HTTP ${status || "?"}`;

        if (status === 402 || code === "PAYMENT_REQUIRED") {
          router.replace("/license");
          return;
        }

        if (status === 401 || code === "INVALID_API_KEY") {
          await reActivate();
          return;
        }

        setError(msg);
        setActiveEventState(null);
        setForms([]);
        return;
      }

      const events = parseEvents(eventsRes.data);
      let resolvedEvent = events.find((it) => it.id === storedEventId) ?? null;

      if (!resolvedEvent && events.length === 1) {
        resolvedEvent = events[0];
        await setActiveEventId(events[0].id);
      }

      setActiveEventState(resolvedEvent);

      if (resolvedEvent?.id) {
        const formsRes = await apiFetch<unknown>({
          method: "GET",
          path: `/api/mobile/v1/forms?eventId=${encodeURIComponent(resolvedEvent.id)}`,
          apiKey,
          timeoutMs: 20_000,
        });

        if (!formsRes.ok) {
          const status = formsRes.status ?? 0;
          const code = formsRes.code ?? "";
          const msg = formsRes.message || `HTTP ${status || "?"}`;

          if (status === 402 || code === "PAYMENT_REQUIRED") {
            router.replace("/license");
            return;
          }

          if (status === 401 || code === "INVALID_API_KEY") {
            await reActivate();
            return;
          }

          if (code === "EVENT_NOT_ACTIVE" || code === "NOT_FOUND") {
            setActiveEventState(null);
            setForms([]);
          } else {
            setError(msg);
            setForms([]);
          }
        } else {
          setForms(parseForms(formsRes.data));
        }
      } else {
        setForms([]);
      }

      const tzOffsetMinutes = String(new Date().getTimezoneOffset());

      const statsRes = await apiFetch<unknown>({
        method: "GET",
        path: `/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(tzOffsetMinutes)}`,
        apiKey,
        timeoutMs: 20_000,
      });

      if (!statsRes.ok) {
        const status = statsRes.status ?? 0;
        const code = statsRes.code ?? "";

        if (status === 402 || code === "PAYMENT_REQUIRED") {
          router.replace("/license");
          return;
        }

        if (status === 401 || code === "INVALID_API_KEY") {
          await reActivate();
          return;
        }

        setStats({
          leadsToday: 0,
          avgPerHour: 0,
          pendingAttachments: 0,
          lastLeadAt: null,
        });
      } else {
        setStats(parseStats(statsRes.data));
      }
    } finally {
      setBusy(false);
    }
  }, [reActivate, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => undefined;
    }, [load])
  );

  const primaryLabel = useMemo(() => {
    if (!hasEvent) return "Event wählen";
    if (!hasSingleForm) return "Lead erfassen";
    return `Lead erfassen · ${forms[0].name}`;
  }, [forms, hasEvent, hasSingleForm]);

  const onPrimary = useCallback(() => {
    if (!hasEvent) {
      router.push("/event-gate?next=home");
      return;
    }
    router.push("/capture");
  }, [hasEvent, router]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={UI.bg} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: scrollPadBottom }]}>
        <MobileContentHeader title="Start" logoDataUrl={logoDataUrl} />

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Bereit für den Einsatz</Text>
          <Text style={styles.heroTitle}>Lead-Erfassung in einem ruhigen Flow.</Text>
          <Text style={styles.heroText}>
            Event, Formular und Tagesstand auf einen Blick. Die stärkste Aktion bleibt bewusst zentral: Lead erfassen.
          </Text>

          <View style={styles.heroMetaRow}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillLabel}>Event</Text>
              <Text style={styles.heroPillValue}>{activeEvent?.name ?? "Nicht gewählt"}</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillLabel}>Formulare</Text>
              <Text style={styles.heroPillValue}>{forms.length}</Text>
            </View>
          </View>

          <Pressable style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={onPrimary}>
            <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
          </Pressable>

          <View style={styles.row}>
            <Pressable style={[styles.secondaryBtn, styles.secondaryBtnLeft]} onPress={() => router.push("/event-gate?next=home")}>
              <Text style={styles.secondaryBtnText}>Event wechseln</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => router.push("/forms")}>
              <Text style={styles.secondaryBtnText}>Formulare prüfen</Text>
            </Pressable>
          </View>
        </View>

        {busy ? (
          <View style={styles.card}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Übersicht wird geladen…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>Hinweis</Text>
            <Text style={styles.warnText}>{error}</Text>
            <View style={styles.row}>
              <Pressable style={[styles.secondaryBtn, styles.secondaryBtnLeft]} onPress={load}>
                <Text style={styles.secondaryBtnText}>Erneut laden</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={reActivate}>
                <Text style={styles.secondaryBtnText}>Neu aktivieren</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, styles.kpiCardLeft]}>
            <Text style={styles.kpiLabel}>Leads heute</Text>
            <Text style={styles.kpiValue}>{stats.leadsToday}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Ø pro Stunde</Text>
            <Text style={styles.kpiValue}>{stats.avgPerHour.toFixed(1)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Heute</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Aktives Event</Text>
            <Text style={styles.infoValue}>{activeEvent?.name ?? "Noch nicht gewählt"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Zugewiesene Formulare</Text>
            <Text style={styles.infoValue}>{forms.length ? forms.map((it) => it.name).join(", ") : "Keine"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Offene Attachments</Text>
            <Text style={styles.infoValue}>{stats.pendingAttachments}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Letzter Lead</Text>
            <Text style={styles.infoValue}>{fmtDateTime(stats.lastLeadAt)}</Text>
          </View>
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
  heroTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
    color: UI.text,
    letterSpacing: -0.3,
  },
  heroText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
  heroMetaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    marginBottom: 14,
  },
  heroPill: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  heroPillLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(0,0,0,0.48)",
    marginBottom: 3,
  },
  heroPillValue: {
    fontSize: 13,
    fontWeight: "800",
    color: UI.text,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryBtnLeft: {
    flex: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: UI.text,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(0,0,0,0.56)",
  },
  warnCard: {
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,120,120,0.28)",
    padding: 16,
  },
  warnTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 6,
  },
  warnText: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0,0,0,0.62)",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
  },
  kpiCardLeft: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(0,0,0,0.48)",
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: "900",
    color: UI.text,
    letterSpacing: -0.4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
    alignItems: "flex-start",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 10,
  },
  infoRow: {
    width: "100%",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(0,0,0,0.48)",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: UI.text,
  },
});
