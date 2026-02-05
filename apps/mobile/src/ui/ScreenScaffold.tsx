import React, { useMemo } from "react";
import { Image, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UI } from "./tokens";
import { useTenantBranding } from "./useTenantBranding";

export type ScreenScaffoldProps = {
  title: string;
  subtitle?: string | null;
  scroll?: boolean;
  children: React.ReactNode;

  /**
   * Optional style overrides for the scroll content.
   * (Only used when scroll === true.)
   */
  contentContainerStyle?: ViewStyle;
} & Record<string, unknown>;

export function ScreenScaffold(props: ScreenScaffoldProps) {
  const insets = useSafeAreaInsets();

  const scroll = props.scroll !== false;
  const subtitle = (props.subtitle ?? "").trim() || null;

  const { state } = useTenantBranding();

  const tenantName = useMemo(() => {
    if (state.status === "ready") return state.tenantName;
    return "LeadRadar";
  }, [state]);

  const logoDataUri = useMemo(() => {
    if (state.status === "ready") return state.logoDataUri;
    return null;
  }, [state]);

  const headerPadTop = Math.max(insets.top, 10);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerPadTop }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {/* Tenant name (prominent) */}
            <Text style={styles.tenantName} numberOfLines={1}>
              {tenantName}
            </Text>

            {/* Screen title (secondary, still visible) */}
            <Text style={styles.title} numberOfLines={1}>
              {props.title}
            </Text>

            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {/* Right: logo (bigger, no frame) */}
          {logoDataUri ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image
              source={{ uri: logoDataUri }}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Tenant Logo"
            />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
        </View>
      </View>

      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, props.contentContainerStyle]}>{props.children}</ScrollView>
      ) : (
        <View style={styles.body}>{props.children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },

  header: {
    paddingHorizontal: UI.padX,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    backgroundColor: UI.bg,
  },

  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },

  headerLeft: { flex: 1, minWidth: 0 },

  tenantName: { fontSize: 20, fontWeight: "900", color: UI.text },
  title: { marginTop: 2, fontSize: 13, fontWeight: "800", color: "rgba(17,24,39,0.55)" },
  subtitle: { marginTop: 6, fontSize: 12, fontWeight: "700", color: "rgba(17,24,39,0.55)" },

  logo: { height: 34, width: 110 },
  logoPlaceholder: { height: 34, width: 110 },

  // Default content padding (matches your Home screen style baseline)
  content: { paddingHorizontal: UI.padX, paddingTop: 14, paddingBottom: 18, gap: 14 },

  // For scroll=false screens (they usually render their own ScrollView)
  body: { flex: 1 },
});
