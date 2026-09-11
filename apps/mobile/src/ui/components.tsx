import React, { useEffect, useState } from "react";
import {
  Image,
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
import { router } from "expo-router";
import { colors as c } from "./theme";
import { photoUri } from "../media/media";
import { useStore } from "./Store";

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
export function Heading({ children }: { children: React.ReactNode }) {
  return <Text style={s.heading}>{children}</Text>;
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
          accessibilityState={{ selected: o === value }}
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
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 40,
          alignSelf: "center",
          width: "100%",
          maxWidth: 1080,
        }}
      >
        {back && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/")
            }
            style={{ paddingVertical: 12 }}
          >
            <Text style={{ color: c.accent }}>← Back</Text>
          </Pressable>
        )}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 32,
          }}
        >
          <Text
            style={{
              color: c.text,
              fontSize: 18,
              fontWeight: "700",
              letterSpacing: -0.5,
            }}
          >
            ◈ LIGHTGUIDE
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push("/settings")}
          >
            <Text style={{ color: c.muted }}>Settings ↗</Text>
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={s.title}>
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{
              color: c.muted,
              lineHeight: 23,
              marginTop: 8,
              marginBottom: 24,
              maxWidth: 650,
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
export function Photo({ id, label }: { id: string; label?: string }) {
  const { repo, revision } = useStore();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    photoUri(repo, id)
      .then((u) => {
        if (active) setUri(u);
      })
      .catch(() => {
        if (active) setUri(null);
      });
    return () => {
      active = false;
    };
  }, [id, repo, revision]);
  return (
    <View style={{ gap: 6, flex: 1, minWidth: 140 }}>
      {uri ? (
        <Image
          accessibilityLabel={label ?? "Saved photograph"}
          source={{ uri }}
          style={{ width: "100%", height: 200, borderRadius: 12 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            height: 140,
            backgroundColor: c.raised,
            borderRadius: 12,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: c.muted }}>Photo unavailable</Text>
        </View>
      )}
      {label && <Label>{label}</Label>}
    </View>
  );
}
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
    fontSize: 34,
    lineHeight: 40,
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
    borderRadius: 18,
    padding: 20,
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
    minHeight: 46,
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
