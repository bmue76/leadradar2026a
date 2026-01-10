import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { getApiKey } from "../src/lib/auth";

export default function Index() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const key = await getApiKey();
      if (cancelled) return;
      router.replace(key ? "/forms" : "/provision");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
