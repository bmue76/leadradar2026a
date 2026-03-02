import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { useLicenseGate } from "../src/lib/useLicenseGate";

type UiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string; traceId?: string };

export default function ActivationScreen() {
  const router = useRouter();
  const { activate, derived, state } = useLicenseGate();

  const [code, setCode] = useState("");
  const [ui, setUi] = useState<UiState>({ kind: "idle" });

  const expiredHint = useMemo(() => {
    if (!derived.expired) return null;
    const d = derived.expiresAt;
    const iso = d ? d.toISOString().slice(0, 10) : undefined;
    return iso ? `Deine Lizenz ist abgelaufen (gültig bis ${iso}).` : "Deine Lizenz ist abgelaufen.";
  }, [derived.expired, derived.expiresAt]);

  const onPaste = async () => {
    try {
      const txt = await Clipboard.getStringAsync();
      if (txt && txt.trim().length > 0) setCode(txt);
    } catch {
      Alert.alert("Einfügen nicht möglich", "Bitte Code manuell einfügen.");
    }
  };

  const onSubmit = async () => {
    setUi({ kind: "loading" });
    const res = await activate(code);

    if (!res.ok) {
      setUi({ kind: "error", message: res.message, traceId: res.traceId });
      return;
    }

    setUi({ kind: "success" });
    router.replace("/forms");
  };

  const disabled = ui.kind === "loading";

  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 }}>
      <Text style={{ fontSize: 28, fontWeight: "700", letterSpacing: -0.2 }}>Gerät aktivieren</Text>
      <Text style={{ marginTop: 10, fontSize: 15, opacity: 0.75 }}>
        Gib den Aktivierungscode ein, den du erhalten hast.
      </Text>

      {expiredHint ? (
        <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" }}>
          <Text style={{ fontSize: 14, opacity: 0.85 }}>{expiredHint}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: 18 }}>
        <Text style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>Aktivierungscode</Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!disabled}
            placeholder="z.B. ABCD-1234"
            style={{
              flex: 1,
              height: 52,
              borderRadius: 14,
              paddingHorizontal: 14,
              fontSize: 16,
              backgroundColor: "rgba(0,0,0,0.05)",
            }}
          />

          <Pressable
            onPress={onPaste}
            disabled={disabled}
            style={{
              height: 52,
              paddingHorizontal: 14,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: disabled ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", opacity: 0.9 }}>Einfügen</Text>
          </Pressable>
        </View>

        <Text style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
          Tipp: Bindestriche/Leerzeichen sind ok. Lang drücken → Einfügen.
        </Text>
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={disabled}
        style={{
          marginTop: 18,
          height: 52,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: disabled ? "rgba(0,0,0,0.2)" : "black",
        }}
      >
        {ui.kind === "loading" ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>Aktivieren</Text>
        )}
      </Pressable>

      {ui.kind === "success" ? (
        <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" }}>
          <Text style={{ fontSize: 14, opacity: 0.85 }}>Aktiviert. Du kannst jetzt Leads erfassen.</Text>
        </View>
      ) : null}

      {ui.kind === "error" ? (
        <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" }}>
          <Text style={{ fontSize: 14, fontWeight: "700" }}>Aktivierung fehlgeschlagen</Text>
          <Text style={{ marginTop: 6, fontSize: 14, opacity: 0.85 }}>{ui.message}</Text>
          <Text style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>traceId: {ui.traceId ?? "—"}</Text>

          <Pressable
            onPress={() => setUi({ kind: "idle" })}
            style={{ marginTop: 10, paddingVertical: 10, alignSelf: "flex-start" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600" }}>Erneut versuchen</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flex: 1 }} />

      {/* Placeholder actions (kein Backend nötig) */}
      <View style={{ gap: 10 }}>
        <Pressable
          onPress={() =>
            Alert.alert(
              "Noch nicht implementiert",
              "„Code erneut senden“ ist im MVP als Platzhalter vorgesehen (kein Backend-Endpoint in TP 9.2)."
            )
          }
          style={{ paddingVertical: 10 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", opacity: 0.9 }}>Code erneut senden</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/settings")} style={{ paddingVertical: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", opacity: 0.9 }}>Einstellungen</Text>
          <Text style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
            Base URL / Konto-Kürzel prüfen (wichtig bei Aktivierungsfehlern).
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            const last4 = state?.licenseKeyLast4 ? `…${state.licenseKeyLast4}` : "—";
            Alert.alert(
              "Status",
              `Lizenz: ${derived.active ? "AKTIV" : derived.expired ? "ABGELAUFEN" : "INAKTIV"}\nCode: ${last4}`
            );
          }}
          style={{ paddingVertical: 10 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", opacity: 0.9 }}>Hilfe</Text>
          <Text style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
            Zeigt den aktuellen Gate-Status (lokal). Support kann die traceId nutzen.
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
