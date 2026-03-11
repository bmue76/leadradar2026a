import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from "react-native-vision-camera";

type NativeQrScannerSheetProps = {
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onDetected: (rawCandidates: string[]) => void;
};

type ScannerUiState = "SEARCHING" | "SLOW" | "DETECTED";

const SLOW_STATE_DELAY_MS = 1200;
const AUTO_TORCH_DELAY_MS = 1400;
const DETECTED_HANDOFF_DELAY_MS = 40;

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

export function NativeQrScannerSheet(props: NativeQrScannerSheetProps) {
  const insets = useSafeAreaInsets();
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();

  const lockRef = useRef(false);

  const [permissionBusy, setPermissionBusy] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [torchOn, setTorchOn] = useState(false);
  const [torchTouched, setTorchTouched] = useState(false);
  const [autoTorchApplied, setAutoTorchApplied] = useState(false);

  const [uiState, setUiState] = useState<ScannerUiState>("SEARCHING");

  useEffect(() => {
    let cancelled = false;

    async function ensurePermission() {
      try {
        if (!hasPermission) {
          await requestPermission();
        }
      } finally {
        if (!cancelled) {
          setPermissionBusy(false);
        }
      }
    }

    void ensurePermission();

    return () => {
      cancelled = true;
      lockRef.current = false;
    };
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (permissionBusy || !hasPermission || !device || processing) return;

    setUiState("SEARCHING");

    const slowTimer = setTimeout(() => {
      if (!lockRef.current) {
        setUiState("SLOW");
      }
    }, SLOW_STATE_DELAY_MS);

    const autoTorchTimer = setTimeout(() => {
      if (
        !lockRef.current &&
        !processing &&
        device.hasTorch &&
        !torchOn &&
        !torchTouched
      ) {
        setTorchOn(true);
        setAutoTorchApplied(true);
      }
    }, AUTO_TORCH_DELAY_MS);

    return () => {
      clearTimeout(slowTimer);
      clearTimeout(autoTorchTimer);
    };
  }, [device, hasPermission, permissionBusy, processing, torchOn, torchTouched]);

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      if (lockRef.current || processing) return;

      const rawCandidates = uniqueNonEmpty(
        codes.map((code) => (typeof code.value === "string" ? code.value : ""))
      );

      if (rawCandidates.length === 0) return;

      lockRef.current = true;
      setProcessing(true);
      setUiState("DETECTED");

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      setTimeout(() => {
        props.onDetected(rawCandidates);
      }, DETECTED_HANDOFF_DELAY_MS);
    },
  });

  const headerTitle = props.title ?? "QR-Code scannen";
  const headerSubtitle =
    props.subtitle ?? "vCard / MECARD / BIZCARD oder andere Kontaktdaten scannen.";

  const footerPad = useMemo(() => Math.max(insets.bottom, 16), [insets.bottom]);

  const statusTitle =
    uiState === "DETECTED"
      ? "QR erkannt"
      : uiState === "SLOW" && autoTorchApplied && torchOn
        ? "Licht aktiviert"
        : uiState === "SLOW"
          ? "Noch nichts erkannt"
          : "Suche QR …";

  const statusText =
    uiState === "DETECTED"
      ? "Kontaktdaten werden übernommen …"
      : uiState === "SLOW" && autoTorchApplied && torchOn
        ? "Die Taschenlampe wurde automatisch aktiviert. QR ruhig und vollständig im Rahmen halten."
        : uiState === "SLOW"
          ? "Bitte QR ruhig halten, Abstand leicht variieren oder bei Bedarf die Taschenlampe einschalten."
          : "QR mittig in den Rahmen halten. Der Import startet automatisch.";

  if (Platform.OS === "web") {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <Text style={styles.headerText}>QR-Scan ist auf Web nicht verfügbar.</Text>
        </View>

        <View style={styles.centerCardWrap}>
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Nicht verfügbar</Text>
            <Text style={styles.stateText}>
              Dieser native QR-Scanner funktioniert nur auf Android und iPhone.
            </Text>

            <Pressable onPress={props.onClose} style={[styles.actionBtn, styles.actionBtnDark]}>
              <Text style={styles.actionBtnDarkText}>Zurück</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (permissionBusy) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <Text style={styles.headerText}>{headerSubtitle}</Text>
        </View>

        <View style={styles.centerCardWrap}>
          <View style={styles.stateCard}>
            <ActivityIndicator />
            <Text style={styles.stateTitle}>Kamera wird vorbereitet …</Text>
            <Text style={styles.stateText}>Bitte einen kurzen Moment warten.</Text>
          </View>
        </View>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <Text style={styles.headerText}>{headerSubtitle}</Text>
        </View>

        <View style={styles.centerCardWrap}>
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Kamera-Zugriff erforderlich</Text>
            <Text style={styles.stateText}>
              Bitte Kamera-Zugriff erlauben, damit QR-Kontaktdaten gescannt werden können.
            </Text>

            <View style={styles.stateActions}>
              <Pressable
                onPress={async () => {
                  setPermissionBusy(true);
                  try {
                    await requestPermission();
                  } finally {
                    setPermissionBusy(false);
                  }
                }}
                style={[styles.actionBtn, styles.actionBtnDark]}
              >
                <Text style={styles.actionBtnDarkText}>Kamera erlauben</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  void Linking.openSettings();
                }}
                style={[styles.actionBtn, styles.actionBtnGhost]}
              >
                <Text style={styles.actionBtnGhostText}>Einstellungen öffnen</Text>
              </Pressable>
            </View>

            <Pressable onPress={props.onClose} style={[styles.actionBtn, styles.actionBtnGhost]}>
              <Text style={styles.actionBtnGhostText}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <Text style={styles.headerText}>{headerSubtitle}</Text>
        </View>

        <View style={styles.centerCardWrap}>
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Keine Kamera verfügbar</Text>
            <Text style={styles.stateText}>
              Auf diesem Gerät wurde keine rückseitige Kamera gefunden.
            </Text>

            <Pressable onPress={props.onClose} style={[styles.actionBtn, styles.actionBtnDark]}>
              <Text style={styles.actionBtnDarkText}>Zurück</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <Text style={styles.headerText}>{headerSubtitle}</Text>
      </View>

      <View style={styles.viewport}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={!processing}
          codeScanner={codeScanner}
          photo={false}
          video={false}
          audio={false}
          torch={torchOn ? "on" : "off"}
        />

        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.frame} />
          {processing ? <View style={styles.processingCurtain} /> : null}

          <View style={styles.hintBox}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  uiState === "DETECTED"
                    ? styles.statusDotDetected
                    : uiState === "SLOW"
                      ? styles.statusDotSlow
                      : styles.statusDotSearching,
                ]}
              />
              <Text style={styles.hintTitle}>{statusTitle}</Text>
            </View>

            <Text style={styles.hintText}>{statusText}</Text>

            {autoTorchApplied && torchOn && !processing ? (
              <View style={styles.autoTorchPill}>
                <Text style={styles.autoTorchPillText}>Taschenlampe automatisch aktiv</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {uiState === "SLOW" && !processing ? (
        <View style={styles.helpCard}>
          <Text style={styles.helpCardTitle}>Tipps für schnelleren Scan</Text>
          <Text style={styles.helpCardText}>• QR sauber und komplett im Rahmen halten</Text>
          <Text style={styles.helpCardText}>• Abstand leicht variieren und ruhig halten</Text>
          <Text style={styles.helpCardText}>• bei dunkler Umgebung hilft die Taschenlampe stark</Text>
        </View>
      ) : null}

      <View style={[styles.footer, { paddingBottom: footerPad }]}>
        <View style={styles.footerRow}>
          <Pressable
            onPress={() => {
              setTorchTouched(true);
              setAutoTorchApplied(false);
              setTorchOn((prev) => !prev);
            }}
            disabled={processing || !device.hasTorch}
            style={[
              styles.footerBtnSecondary,
              (processing || !device.hasTorch) ? styles.footerBtnDisabled : null,
              torchOn ? styles.footerBtnSecondaryActive : null,
            ]}
          >
            <Text
              style={[
                styles.footerBtnSecondaryText,
                torchOn ? styles.footerBtnSecondaryTextActive : null,
              ]}
            >
              {torchOn ? "Taschenlampe aus" : "Taschenlampe an"}
            </Text>
          </Pressable>

          <Pressable
            onPress={props.onClose}
            disabled={processing}
            style={[styles.footerBtnPrimary, processing ? styles.footerBtnDisabled : null]}
          >
            <Text style={styles.footerBtnPrimaryText}>
              {processing ? "Bitte warten …" : "Abbrechen"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },

  headerText: {
    color: "rgba(255,255,255,0.76)",
    marginTop: 6,
    lineHeight: 20,
  },

  viewport: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#0b0b0b",
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  frame: {
    width: "72%",
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
    backgroundColor: "transparent",
  },

  processingCurtain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },

  hintBox: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 22,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(0,0,0,0.52)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },

  statusDotSearching: {
    backgroundColor: "#ffffff",
    opacity: 0.9,
  },

  statusDotSlow: {
    backgroundColor: "#fbbf24",
  },

  statusDotDetected: {
    backgroundColor: "#22c55e",
  },

  hintTitle: {
    color: "#ffffff",
    fontWeight: "900",
  },

  hintText: {
    color: "rgba(255,255,255,0.84)",
    marginTop: 6,
    lineHeight: 18,
  },

  autoTorchPill: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },

  autoTorchPillText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  helpCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 4,
  },

  helpCardTitle: {
    color: "#ffffff",
    fontWeight: "900",
    marginBottom: 4,
  },

  helpCardText: {
    color: "rgba(255,255,255,0.78)",
    lineHeight: 18,
  },

  footer: {
    paddingHorizontal: 20,
  },

  footerRow: {
    flexDirection: "row",
    gap: 10,
  },

  footerBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  footerBtnPrimaryText: {
    color: "#ffffff",
    fontWeight: "900",
  },

  footerBtnSecondary: {
    minWidth: 148,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  footerBtnSecondaryActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },

  footerBtnSecondaryText: {
    color: "#ffffff",
    fontWeight: "900",
  },

  footerBtnSecondaryTextActive: {
    color: "#111827",
  },

  footerBtnDisabled: {
    opacity: 0.55,
  },

  centerCardWrap: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  stateCard: {
    width: "100%",
    borderRadius: 22,
    padding: 18,
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  stateTitle: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 17,
  },

  stateText: {
    color: "rgba(255,255,255,0.78)",
    lineHeight: 20,
  },

  stateActions: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 4,
  },

  actionBtn: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  actionBtnDark: {
    backgroundColor: "#ffffff",
  },

  actionBtnDarkText: {
    color: "#111827",
    fontWeight: "900",
  },

  actionBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  actionBtnGhostText: {
    color: "#ffffff",
    fontWeight: "900",
  },
});
