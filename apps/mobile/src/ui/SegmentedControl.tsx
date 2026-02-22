import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ACCENT_HEX } from "../lib/mobileConfig";

export type Segment<T extends string> = { key: T; label: string };

export default function SegmentedControl<T extends string>(props: {
  value: T;
  segments: Segment<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrap}>
      {props.segments.map((s) => {
        const active = s.key === props.value;
        return (
          <Pressable
            key={s.key}
            onPress={() => props.onChange(s.key)}
            style={[styles.seg, active ? styles.active : styles.idle]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active ? styles.labelActive : styles.labelIdle]}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.045)",
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  seg: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  active: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  idle: { backgroundColor: "transparent" },
  label: { fontSize: 14, fontWeight: "700" },
  labelActive: { color: ACCENT_HEX },
  labelIdle: { color: "rgba(0,0,0,0.55)" },
});
