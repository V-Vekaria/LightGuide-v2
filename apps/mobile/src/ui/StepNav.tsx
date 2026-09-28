import React from "react";
import { Pressable, Text, View, Keyboard } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { colors as c } from "./theme";
const icons = ["image", "sun", "camera", "check-circle"] as const;
export function StepNav({
  labels = ["Reference", "Lights", "Camera", "Check"],
  active,
  onChange,
}: {
  labels?: string[];
  active: number;
  onChange: (step: number) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderBottomWidth: 1,
        borderColor: c.border,
        marginBottom: 18,
      }}
    >
      {labels.map((label, i) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: active === i }}
          onPress={() => {
            Keyboard.dismiss();
            onChange(i);
          }}
          style={{
            flex: 1,
            minHeight: 64,
            paddingVertical: 8,
            alignItems: "center",
            gap: 6,
            borderBottomWidth: active === i ? 2 : 0,
            borderColor: c.accent,
          }}
        >
          <Feather
            name={icons[i] ?? "circle"}
            size={21}
            color={active === i ? c.accent : c.muted}
          />
          <Text
            style={{ fontSize: 12, color: active === i ? c.accent : c.muted }}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
