import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function CollapsibleDetails(props: {
  title?: string;
  lines: Array<[string, string | undefined | null]>;
}) {
  const [open, setOpen] = useState(false);
  const visible = props.lines.filter(([, v]) => typeof v === "string" && (v as string).trim().length > 0);

  if (visible.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button">
        <Text style={styles.toggle}>{open ? "Details ausblenden" : (props.title || "Details anzeigen")}</Text>
      </Pressable>

      {open ? (
        <View style={styles.box}>
          {visible.map(([k, v]) => (
            <View key={k} style={styles.row}>
              <Text style={styles.key}>{k}</Text>
              <Text style={styles.val}>{String(v)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  toggle: { fontSize: 14, fontWeight: "700", color: "rgba(0,0,0,0.55)" },
  box: { marginTop: 10, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.045)", padding: 12 },
  row: { marginBottom: 10 },
  key: { fontSize: 12, fontWeight: "800", color: "rgba(0,0,0,0.45)" },
  val: { fontSize: 13, color: "rgba(0,0,0,0.75)", marginTop: 2 },
});
