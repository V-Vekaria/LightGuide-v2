import React from "react";
import Feather from "@expo/vector-icons/Feather";
import {
  useWindowDimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { colors as c } from "./theme";
import { useDevice } from "../device/DeviceProvider";

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}
export function Body({
  children,
  muted = false,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: TextStyle;
}) {
  return (
    <Text style={[s.body, muted && { color: c.muted }, style]}>{children}</Text>
  );
}
export function Heading({
  children,
  testID,
}: {
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <Text accessibilityRole="header" testID={testID} style={s.heading}>
      {children}
    </Text>
  );
}
export function Badge({
  children,
  tone = "accent",
}: {
  children: React.ReactNode;
  tone?: "accent" | "warning" | "muted";
}) {
  return (
    <View
      style={[
        s.badge,
        { backgroundColor: tone === "warning" ? "#3A2C1E" : c.raised },
      ]}
    >
      <Text
        style={{
          color:
            tone === "warning"
              ? c.warning
              : tone === "muted"
                ? c.muted
                : c.accent,
          fontSize: 11,
          fontWeight: "700",
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function Button({
  title,
  onPress,
  kind = "primary",
  disabled = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor:
            kind === "primary"
              ? c.accent
              : kind === "danger"
                ? "#3B2428"
                : c.raised,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text
        style={{
          color:
            kind === "primary"
              ? c.accentInk
              : kind === "danger"
                ? c.danger
                : c.text,
          fontWeight: "700",
          fontSize: 14,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.card, style]}
    >
      {children}
    </Pressable>
  ) : (
    <View style={[s.card, style]}>{children}</View>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder = "",
  multiline = false,
  numeric = false,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
  testID?: string;
}) {
  return (
    <View style={{ gap: 8, marginBottom: 16 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#7E939F"
        multiline={multiline}
        keyboardType={numeric ? "decimal-pad" : "default"}
        maxLength={
          multiline ? 4000 : label.toLowerCase().includes("notes") ? 4000 : 240
        }
        style={[
          s.input,
          multiline && { minHeight: 100, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.row}>
      {options.map((o) => (
        <Pressable
          key={o}
          accessibilityRole="button"
          accessibilityLabel={o.replaceAll("_", " ")}
          accessibilityState={{ selected: o === value }}
          aria-pressed={o === value}
          onPress={() => onChange(o)}
          style={[
            s.chip,
            o === value && {
              borderColor: c.accent,
              backgroundColor: "#203B34",
            },
          ]}
        >
          <Text
            style={{
              color: o === value ? c.accent : c.muted,
              textTransform: "capitalize",
              fontSize: 13,
            }}
          >
            {o.replaceAll("_", " ")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[s.card, { borderColor: c.danger, marginVertical: 10 }]}
    >
      <Text style={{ color: c.danger }}>{message}</Text>
    </View>
  ) : null;
}
export function Screen({
  title,
  subtitle,
  children,
  back = false,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  back?: boolean;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { presentation, canCapture } = useDevice();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          minHeight: 56,
          gap: 12,
          borderBottomWidth: 1,
          borderColor: c.border,
        }}
      >
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="← Back"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/")
            }
            style={{ padding: 10 }}
          >
            <Feather name="arrow-left" size={22} color={c.text} />
          </Pressable>
        )}
        <Text
          style={{ color: c.text, fontSize: 18, fontWeight: "700", flex: 1 }}
        >
          {back ? "LightGuide" : "LightGuide"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Connect LightGuide device"
          onPress={() => router.navigate("/device")}
          style={{ padding: 10 }}
        >
          <Feather
            name="bluetooth"
            size={21}
            color={presentation.fresh ? c.accent : c.muted}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          disabled={pathname === "/settings"}
          onPress={() => router.navigate("/settings")}
          style={{ padding: 10 }}
        >
          <Feather name="settings" size={21} color={c.muted} />
        </Pressable>
      </View>
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: 6,
          borderBottomWidth: 1,
          borderColor: c.border,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={presentation.label}
          accessibilityHint={presentation.detail}
          testID="device-status"
          onPress={() => {
            if (pathname !== "/device") router.navigate("/device");
          }}
          style={{ minHeight: 44, justifyContent: "center", gap: 3 }}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color: presentation.warning ? c.warning : c.accent,
              fontSize: 13,
              fontWeight: "700",
            }}
          >
            {presentation.label}
          </Text>
          {presentation.warning && (
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {presentation.detail}
            </Text>
          )}
        </Pressable>
        {canCapture && pathname !== "/device" && pathname !== "/capture" && (
          <Button
            title="Save button received · open capture"
            kind="secondary"
            onPress={() => router.navigate("/capture?sensor=1")}
          />
        )}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 32,
          alignSelf: "center",
          width: "100%",
          maxWidth: 720,
        }}
      >
        {title ? (
          <Text accessibilityRole="header" style={s.title}>
            {title}
          </Text>
        ) : null}
        {subtitle && (
          <Text
            style={{
              color: c.muted,
              lineHeight: 22,
              marginTop: 8,
              marginBottom: 20,
            }}
          >
            {subtitle}
          </Text>
        )}
        {children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

export { PhotoPreview as Photo, PhotoComparison } from "./PhotoViewer";
export function Confirm({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: "#000B",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Card style={{ width: "100%", maxWidth: 420 }}>
          <Heading>{title}</Heading>
          <Body muted>{message}</Body>
          <View style={s.row}>
            <Button title="Cancel" kind="secondary" onPress={onCancel} />
            <Button title="Confirm" kind="danger" onPress={onConfirm} />
          </View>
        </Card>
      </View>
    </Modal>
  );
}
export const s = StyleSheet.create({
  title: {
    fontSize: 28,
    lineHeight: 34,
    color: c.text,
    fontWeight: "700",
    letterSpacing: -1,
  },
  heading: { fontSize: 21, color: c.text, fontWeight: "600", marginBottom: 10 },
  body: { color: c.text, fontSize: 14, lineHeight: 22 },
  label: {
    color: c.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  card: {
    backgroundColor: c.panel,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  button: {
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  fieldLabel: { fontSize: 13, color: c.text, fontWeight: "600" },
  input: {
    color: c.text,
    backgroundColor: c.bg,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    minHeight: 48,
  },
  chip: {
    borderRadius: 24,
    borderColor: c.border,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  split: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  column: { flex: 1, minWidth: 270 },
});

// Wrapped flex rows can mismeasure their height on native narrow screens.
export function useResponsiveColumns() {
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 760 && fontScale <= 1.3;
  return { split: wide ? s.split : { gap: 4 }, column: wide ? s.column : {} };
}
