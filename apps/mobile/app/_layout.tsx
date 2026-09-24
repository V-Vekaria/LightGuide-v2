import React from "react";
import { DeviceProvider } from "../src/device/DeviceProvider";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StoreProvider } from "../src/ui/Store";
import { colors } from "../src/ui/theme";
export default function Layout() {
  return (
    <StoreProvider>
      <DeviceProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
      </DeviceProvider>
    </StoreProvider>
  );
}
