import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  formatLight,
  lightFields,
  type LightState,
} from "../domain/recreation-guide";

// Shared by the pitch demonstration and actual manual recreation.
export const guideColors = {
  bg: "#F3F4F1",
  surface: "#FFFFFF",
  ink: "#142B31",
  muted: "#52686C",
  line: "#D1DEDC",
  accent: "#117668",
  soft: "#E0F2EC",
};
const c = guideColors;
export function GuideButton({
  title,
  onPress,
  disabled = false,
  selected = false,
  primary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        g.button,
        (selected || primary) && g.primary,
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[g.text, (selected || primary) && { color: c.surface }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function GuideInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 150, gap: 6 }}>
      <Text style={g.small}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        maxLength={12}
        style={g.input}
        placeholder="Not measured"
        placeholderTextColor={c.muted}
      />
    </View>
  );
}
export function GuideSteps({
  items,
  active,
}: {
  items: string[];
  active: number;
}) {
  return (
    <View style={g.row}>
      {items.map((label, i) => (
        <View key={label} style={[g.step, i === active && g.primary]}>
          <Text style={[g.small, i === active && { color: c.surface }]}>
            {i + 1}. {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
function Dot({
  x,
  y,
  saved = false,
}: {
  x: number;
  y: number;
  saved?: boolean;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left: x - (saved ? 15 : 9),
        top: y - (saved ? 15 : 9),
        width: saved ? 30 : 18,
        height: saved ? 30 : 18,
        borderRadius: 16,
        borderWidth: saved ? 2 : 0,
        borderStyle: saved ? "dashed" : "solid",
        borderColor: c.muted,
        backgroundColor: saved ? "transparent" : c.accent,
      }}
    />
  );
}
function Ray({
  x,
  y,
  angle,
  side,
}: {
  x: number;
  y: number;
  angle: number;
  side: boolean;
}) {
  const a = (angle * Math.PI) / 180,
    dx = side ? Math.cos(a) * 60 : Math.sin(a) * 60,
    dy = side ? Math.sin(a) * 60 : -Math.cos(a) * 60;
  return (
    <View
      style={{
        position: "absolute",
        left: x + dx / 2 - 30,
        top: y + dy / 2,
        width: 60,
        height: 2,
        backgroundColor: c.accent,
        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
      }}
    />
  );
}
export function LightDiagram({
  saved,
  current,
  side,
  simulated,
}: {
  saved: LightState;
  current: LightState;
  side: boolean;
  simulated: boolean;
}) {
  const [width, setWidth] = useState(300);
  const { fontScale } = useWindowDimensions();
  const hasXY =
    (saved.x !== null && saved.z !== null) ||
    (current.x !== null && current.z !== null);
  const hasHeight = saved.height !== null || current.height !== null;
  if (fontScale > 1.4)
    return (
      <View style={g.diagramFallback}>
        <Text style={g.text}>
          {side
            ? "Side view: compare height and tilt in the values below."
            : "Top view: compare lateral position and front distance below."}
        </Text>
      </View>
    );
  if ((!side && !hasXY) || (side && !hasHeight))
    return (
      <View style={g.diagramFallback} testID="guide-position-unknown">
        <Text style={g.title}>
          {side ? "Height not recorded" : "Position not recorded"}
        </Text>
        <Text style={g.text}>
          Use your reference photo or notes. No position is assumed.
        </Text>
      </View>
    );
  const w = Math.max(180, width),
    h = 210,
    floor = 174;
  const maxDepth = Math.max(350, saved.z ?? 0, current.z ?? 0);
  const maxX = Math.max(170, Math.abs(saved.x ?? 0), Math.abs(current.x ?? 0));
  const maxH = Math.max(260, saved.height ?? 0, current.height ?? 0);
  const point = (v: LightState) =>
    side
      ? { x: 54, y: floor - ((v.height ?? 0) / maxH) * 152 }
      : {
          x: w / 2 + ((v.x ?? 0) / maxX) * (w / 2 - 40),
          y: 45 + ((v.z ?? 0) / maxDepth) * 132,
        };
  const target = point(saved),
    live = point(current),
    visible = side
      ? current.height !== null
      : current.x !== null && current.z !== null;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[g.diagram, { height: h }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        side
          ? "Side projection of light height and tilt. Horizontal spacing is illustrative."
          : "Top view of saved and current light position relative to the subject."
      }
    >
      {[85, 140, floor].map((y) => (
        <View
          key={y}
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            top: y,
            height: 1,
            backgroundColor: c.line,
          }}
        />
      ))}
      <View
        style={{
          position: "absolute",
          left: side ? w - 55 : w / 2 - 9,
          top: side ? floor - 98 : 28,
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: c.ink,
        }}
      />
      {side && (
        <View
          style={{
            position: "absolute",
            left: w - 50,
            top: floor - 78,
            width: 8,
            height: 78,
            backgroundColor: c.ink,
            borderRadius: 4,
          }}
        />
      )}
      <Text
        style={[
          g.diagramLabel,
          { left: side ? w - 87 : w / 2 + 15, top: side ? floor - 130 : 25 },
        ]}
      >
        Subject
      </Text>
      {(side
        ? saved.height !== null
        : saved.x !== null && saved.z !== null) && (
        <>
          {side && (
            <View
              style={{
                position: "absolute",
                left: target.x - 1,
                top: target.y + 15,
                height: Math.max(0, floor - target.y - 15),
                borderLeftWidth: 2,
                borderStyle: "dashed",
                borderColor: c.muted,
              }}
            />
          )}
          <Dot x={target.x} y={target.y} saved />
          {side && (
            <Text
              style={[
                g.diagramLabel,
                { left: target.x + 22, top: target.y - 20, maxWidth: w - 130 },
              ]}
            >
              Saved light{`\n${formatLight(saved.height, "cm")}`}
            </Text>
          )}
        </>
      )}
      {visible && (
        <>
          {side && (
            <View
              style={{
                position: "absolute",
                left: live.x - 1,
                top: live.y,
                height: floor - live.y,
                width: 2,
                backgroundColor: c.muted,
              }}
            />
          )}
          <Dot x={live.x} y={live.y} />
          {(side ? current.tilt : current.yaw) !== null && (
            <Ray
              x={live.x}
              y={live.y}
              angle={(side ? current.tilt : current.yaw)!}
              side={side}
            />
          )}
        </>
      )}
      <Text style={[g.diagramLabel, { left: 14, bottom: 9 }]}>
        {side
          ? "Stand height · spacing illustrative"
          : simulated
            ? "Fixed subject / camera reference"
            : "Saved reference"}
      </Text>
    </View>
  );
}
export function RecreationGuide({
  mode,
  stage,
  steps,
  title,
  detail,
  saved,
  current,
  action,
  secondary,
  controls,
  children,
  reference,
}: {
  mode: "manual" | "simulation";
  stage: number;
  steps: string[];
  title: string;
  detail: string;
  saved: LightState;
  current: LightState;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  controls?: React.ReactNode;
  children?: React.ReactNode;
  reference?: React.ReactNode;
}) {
  const [side, setSide] = useState(mode === "manual");
  const { width, fontScale } = useWindowDimensions();
  const wide = mode === "simulation" && width >= 850 && fontScale <= 1.4;
  const fields = lightFields.filter(([key]) =>
    mode === "manual"
      ? ["height", "distance", "power"].includes(key)
      : key !== "distance",
  );
  return (
    <View style={g.workspace} testID="recreation-guide">
      <GuideSteps items={steps} active={stage} />
      <Text
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={g.title}
        testID="guide-cue"
      >
        {title}
      </Text>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 18 }}>
        <View style={{ flex: wide ? 1.15 : undefined, minWidth: 0, gap: 10 }}>
          <Text style={g.badge}>
            {mode === "simulation" ? "SIMULATED SETUP" : "YOUR SAVED SETUP"}
          </Text>
          {mode === "simulation" && (
            <View style={g.row}>
              <GuideButton
                title="Top view"
                selected={!side}
                onPress={() => setSide(false)}
              />
              <GuideButton
                title="Side view"
                selected={side}
                onPress={() => setSide(true)}
              />
            </View>
          )}
          <Text style={g.small}>
            {side ? "Light height — side view" : "Light position — top view"}
          </Text>
          <LightDiagram
            saved={saved}
            current={current}
            side={side}
            simulated={mode === "simulation"}
          />
          <Text style={g.small}>
            {mode === "simulation"
              ? "● Simulated light · "
              : current.height !== null
                ? "● Entered now · "
                : ""}
            ◌ Saved target
          </Text>
          <View style={g.values}>
            <View style={g.valueRow}>
              <Text style={[g.small, g.cell]}>Setting</Text>
              <Text style={[g.small, g.cell]}>Now</Text>
              <Text style={[g.small, g.cell]}>Saved</Text>
            </View>
            {fields.map(([key, label, unit]) => (
              <View style={g.valueRow} key={key} testID={`guide-value-${key}`}>
                <Text style={[g.small, g.cell]}>{label}</Text>
                <Text style={[g.text, g.cell]}>
                  {current[key] === null
                    ? mode === "manual"
                      ? "Not measured"
                      : "Not recorded"
                    : formatLight(current[key], unit)}
                </Text>
                <Text style={[g.text, g.cell]}>
                  {formatLight(saved[key], unit)}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[g.cuePanel, { flex: wide ? 1 : undefined }]}>
          <Text style={g.badge}>
            {mode === "simulation"
              ? "SIMULATED · NO HARDWARE CONNECTED"
              : "MANUAL MODE · ENTER YOUR OWN READINGS"}
          </Text>
          {reference}
          <Text style={g.text}>{detail}</Text>
          {controls}
          {action}
          {secondary}
        </View>
      </View>
      {children}
    </View>
  );
}
export const g = StyleSheet.create({
  workspace: {
    backgroundColor: c.bg,
    borderRadius: 18,
    padding: 18,
    gap: 18,
    marginVertical: 14,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  text: { color: c.ink, fontSize: 16, lineHeight: 23, flexShrink: 1 },
  small: { color: c.muted, fontSize: 14, lineHeight: 21, flexShrink: 1 },
  title: { color: c.ink, fontSize: 25, lineHeight: 32, fontWeight: "500" },
  badge: { color: c.accent, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  step: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: c.surface,
  },
  button: {
    minHeight: 44,
    padding: 10,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    backgroundColor: c.surface,
    justifyContent: "center",
    flexShrink: 1,
  },
  primary: { backgroundColor: c.ink, borderColor: c.ink },
  cuePanel: {
    backgroundColor: c.surface,
    padding: 18,
    borderRadius: 16,
    gap: 14,
    minWidth: 0,
  },
  diagram: { width: "100%", overflow: "hidden" },
  diagramFallback: {
    minHeight: 180,
    justifyContent: "center",
    gap: 10,
    padding: 14,
  },
  diagramLabel: { position: "absolute", color: c.muted, fontSize: 12 },
  values: { gap: 0 },
  valueRow: {
    flexDirection: "row",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    paddingVertical: 9,
  },
  cell: { flex: 1, minWidth: 0, fontVariant: ["tabular-nums"] },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    backgroundColor: c.surface,
    color: c.ink,
    fontSize: 16,
    padding: 12,
    minHeight: 44,
  },
});
