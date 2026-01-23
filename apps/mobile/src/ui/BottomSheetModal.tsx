import React, { useEffect, useMemo } from "react";
import { Animated, Modal, Pressable, StyleSheet, View, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function BottomSheetModal({ visible, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get("window").height;

  // Use memo (not refs) to satisfy react-hooks/refs rule
  const translateY = useMemo(() => new Animated.Value(screenH), [screenH]);

  const bottomPad = Math.max(insets.bottom, 12);

  useEffect(() => {
    if (!visible) return;

    translateY.setValue(screenH);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, screenH, translateY]);

  function closeWithAnim() {
    Animated.timing(translateY, {
      toValue: screenH,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeWithAnim}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeWithAnim} />

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: bottomPad,
              transform: [{ translateY }],
            },
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
});
