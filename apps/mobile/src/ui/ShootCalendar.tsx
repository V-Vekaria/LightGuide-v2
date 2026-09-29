import React, { useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { Button, Field } from "./components";
import { colors as c } from "./theme";
import { todayKey, dateKey } from "../domain/shoot-dates";
export function ShootCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [month, setMonth] = useState(
      () => new Date(todayKey().slice(0, 7) + "-01T12:00:00Z"),
    );
  const y = month.getUTCFullYear(),
    m = month.getUTCMonth(),
    days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
    offset = (month.getUTCDay() + 6) % 7;
  return (
    <View style={{ gap: 8 }}>
      <Field
        label="Shoot date (optional)"
        value={value}
        onChange={onChange}
        placeholder="DD-MM-YYYY"
      />
      <Button
        title="Choose date"
        kind="secondary"
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#000B",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: c.panel,
              padding: 20,
              borderRadius: 16,
              gap: 18,
              width: "100%",
              maxWidth: 420,
              alignSelf: "center",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => setMonth(new Date(Date.UTC(y, m - 1, 1, 12)))}
                style={{ padding: 12 }}
              >
                <Feather name="chevron-left" size={22} color={c.text} />
              </Pressable>
              <Text style={{ color: c.text, fontWeight: "700" }}>
                {month.toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                onPress={() => setMonth(new Date(Date.UTC(y, m + 1, 1, 12)))}
                style={{ padding: 12 }}
              >
                <Feather name="chevron-right" size={22} color={c.text} />
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <Text
                  key={"day" + i}
                  style={{
                    width: "14.285%",
                    textAlign: "center",
                    color: c.muted,
                    paddingVertical: 8,
                  }}
                >
                  {d}
                </Text>
              ))}
              {Array.from({ length: offset + days }, (_, i) => {
                const day = i - offset + 1;
                const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const disabled = day < 1 || key < todayKey();
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={day > 0 ? key : "Blank day"}
                    accessibilityState={{
                      disabled,
                      selected: key === dateKey(value),
                    }}
                    disabled={disabled}
                    onPress={() => {
                      onChange(
                        `${String(day).padStart(2, "0")}-${String(m + 1).padStart(2, "0")}-${y}`,
                      );
                      setOpen(false);
                    }}
                    style={{
                      width: "14.285%",
                      minHeight: 46,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: disabled ? 0.3 : 1,
                      backgroundColor:
                        key === dateKey(value) ? c.accent : "transparent",
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: key === dateKey(value) ? c.accentInk : c.text,
                      }}
                    >
                      {day > 0 ? day : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button
              title="Close calendar"
              kind="secondary"
              onPress={() => setOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
