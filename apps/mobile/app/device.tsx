import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  Badge,
  Body,
  Button,
  Card,
  ErrorMessage,
  Heading,
  Label,
  Screen,
  s,
} from "../src/ui/components";
import { useDevice } from "../src/device/DeviceProvider";

export default function DeviceScreen() {
  const {
    session: state,
    nodes,
    notice,
    canCapture,
    controller,
    presentation,
  } = useDevice();
  const busy = state.phase === "connecting" || state.phase === "subscribing";
  const measurement = presentation.fresh ? state.measurement : null;
  return (
    <Screen
      back
      title="Connect LightGuide"
      subtitle="Connect your node to receive sensor readings while you use the app."
    >
      <ErrorMessage message={state.error} />
      <View style={s.row}>
        <Badge tone={presentation.warning ? "warning" : "accent"}>
          {state.phase.toUpperCase()}
        </Badge>
        {state.deviceInfo && (
          <Body muted>
            {state.deviceInfo.device_id} · firmware {state.deviceInfo.fw}
          </Body>
        )}
      </View>
      {state.phase !== "connected" && (
        <Button
          title={
            state.phase === "scanning" ? "Scan again" : "Find LightGuide node"
          }
          disabled={busy}
          onPress={() => void controller.scan()}
        />
      )}
      {state.phase !== "connected" &&
        nodes.map((node) => (
          <Card key={node.id}>
            <Label>LIGHTGUIDE NODE</Label>
            <Heading>{node.name}</Heading>
            <Body muted>
              {node.rssi == null ? "Signal unknown" : `Signal ${node.rssi} dBm`}
            </Body>
            <Button
              title={busy ? "Connecting…" : "Connect"}
              disabled={busy}
              onPress={() => void controller.connect(node)}
            />
          </Card>
        ))}
      {state.phase === "scanning" && nodes.length === 0 && (
        <Card>
          <Heading>Looking for LightGuide…</Heading>
          <Body muted>
            Keep your powered-on node nearby. Scanning takes up to 10 seconds.
          </Body>
        </Card>
      )}
      {state.phase === "connected" && (
        <Card>
          <Label>
            {presentation.fresh
              ? "LIVE SENSOR SNAPSHOT"
              : "WAITING FOR FRESH READINGS"}
          </Label>
          {!presentation.fresh && <Body>{presentation.detail}</Body>}
          <Heading>
            {measurement?.tof_valid
              ? `${measurement.distance_mm} mm`
              : "Distance unavailable"}
          </Heading>
          <Body>
            Roll{" "}
            {measurement?.imu_valid
              ? measurement.roll_deg.toFixed(1) + "°"
              : "—"}{" "}
            · Pitch{" "}
            {measurement?.imu_valid
              ? measurement.pitch_deg.toFixed(1) + "°"
              : "—"}{" "}
            · Yaw{" "}
            {measurement?.imu_valid
              ? measurement.yaw_deg.toFixed(1) + "°"
              : "—"}
          </Body>
          <Body muted>
            Spectral{" "}
            {measurement?.spectral_valid
              ? `13 gain-normalised channels · gain ${measurement.spectral_gain}×`
              : "unavailable"}
          </Body>
          <Body muted>Status: {state.status?.state ?? "unknown"}</Body>
          {state.status?.error && <Body>{state.status.error}</Body>}
          <Body muted>
            You can return Home. The device stays connected while you use the
            app. Closing the app may end the connection.
          </Body>
          <Button
            title="Capture these readings"
            disabled={!presentation.fresh}
            onPress={() => {
              if (controller.captureSnapshot())
                router.push("/capture?sensor=1");
            }}
          />
          <View style={s.row}>
            <Button
              kind="secondary"
              title="Refresh status"
              onPress={() => void controller.refreshStatus()}
            />
            <Button
              kind="secondary"
              title="Disconnect"
              onPress={() => void controller.disconnect()}
            />
          </View>
        </Card>
      )}
      {notice && (
        <Card>
          <Body>{notice}</Body>
          {canCapture && (
            <Button
              title="Open setup capture"
              onPress={() => router.push("/capture?sensor=1")}
            />
          )}
        </Card>
      )}
      <Card>
        <Body muted>
          Sensor connection does not establish stand position or calibrated
          accuracy. Recreation diagrams show saved or manually entered values.
        </Body>
      </Card>
    </Screen>
  );
}
