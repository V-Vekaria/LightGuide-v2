import React, { useState } from "react";
import { Text, View } from "react-native";
import { Screen } from "../src/ui/components";
import { RecreationGuide, GuideButton, g } from "../src/ui/RecreationGuide";
import {
  demoLight,
  demoConnected,
  demoPause,
  demoCue,
  demoRestored,
  movedDemo,
  nextDemoField,
  unknownLight,
  type LightState,
  type DemoConnection,
} from "../src/domain/recreation-guide";

export default function Simulation() {
  const [current, setCurrent] = useState<LightState>({ ...demoLight });
  const [saved, setSaved] = useState<LightState | null>(null);
  const [stage, setStage] = useState(0);
  const [link, setLink] = useState<DemoConnection>({ ...demoConnected });
  const [ambientChanged, setAmbientChanged] = useState(false);
  const [details, setDetails] = useState(false);
  const [how, setHow] = useState(false);
  const paused = demoPause(link);
  const restored = !!saved && demoRestored(saved, current, link);
  const save = () => {
    if (paused) return;
    setSaved({ ...current });
    setStage(1);
  };
  const move = () => {
    if (!saved) return;
    setCurrent(movedDemo(saved));
    setStage(2);
  };
  const adjust = () => {
    if (!saved || paused) return;
    const key = nextDemoField(saved, current);
    if (key) setCurrent((v) => ({ ...v, [key]: saved[key] }));
  };
  const check = () => {
    if (restored) setStage(4);
  };
  const restart = () => {
    setCurrent({ ...demoLight });
    setSaved(null);
    setStage(0);
    setLink({ ...demoConnected });
    setAmbientChanged(false);
  };
  const toggle = (key: keyof DemoConnection) => {
    setLink((v) => ({ ...v, [key]: !v[key] }));
    if (stage === 4) setStage(3);
  };
  const shift = (key: "x" | "z" | "height" | "yaw" | "tilt", by: number) => {
    setCurrent((v) => ({
      ...v,
      [key]: Math.max(
        key === "height" || key === "z" ? 20 : -180,
        Math.min(key === "height" || key === "z" ? 500 : 180, v[key]! + by),
      ),
    }));
    if (stage === 4) setStage(3);
  };
  const title =
    paused ??
    (!saved
      ? "Save a setup you like"
      : stage === 1
        ? "Setup saved"
        : stage === 2
          ? "The light has moved"
          : stage === 4
            ? "Demo complete — check a real test shot"
            : demoCue(saved, current, link, ambientChanged));
  const detail = paused
    ? "Guidance is paused. Saved values remain visible."
    : stage === 0
      ? "One portrait light and a softbox. Save the arrangement, move it, then find your way back."
      : stage === 1
        ? "Your virtual setup is saved for this session. Now move the light."
        : stage === 2
          ? "Open Recreate to compare the current light with the saved arrangement."
          : ambientChanged && restored
            ? "The position is restored, but ambient light has changed. Exposure and the photograph still need checking."
            : "Follow one correction at a time. In a real shoot, the photographer moves the equipment.";
  const actionTitle = !saved
    ? "Save setup"
    : stage === 1
      ? "Move light"
      : stage === 2
        ? "Open Recreate"
        : stage === 4
          ? "Restart demo"
          : restored
            ? "Check result"
            : "Simulate adjustment";
  const action = !saved
    ? save
    : stage === 1
      ? move
      : stage === 2
        ? () => setStage(3)
        : stage === 4
          ? restart
          : restored
            ? check
            : adjust;
  const displayed = {
    ...current,
    x: link.reference ? current.x : null,
    z: link.reference ? current.z : null,
    height: link.reference ? current.height : null,
    yaw: link.node && link.bluetooth ? current.yaw : null,
    tilt: link.node && link.bluetooth ? current.tilt : null,
  };
  return (
    <Screen
      back
      title="Recreate a setup."
      subtitle="Practice with the same guidance layout used for your saved setups. Every movement here is simulated."
    >
      <RecreationGuide
        mode="simulation"
        steps={["Reference", "Lights", "Camera", "Check"]}
        stage={stage === 0 ? 0 : stage === 1 ? 1 : stage < 4 ? 2 : 3}
        title={title}
        detail={detail}
        saved={saved ?? unknownLight}
        current={displayed}
        action={
          <GuideButton
            title={actionTitle}
            primary
            disabled={!!paused && stage !== 4}
            onPress={action}
          />
        }
        secondary={
          stage > 0 && stage < 4 ? (
            <GuideButton title="Restart demo" onPress={restart} />
          ) : undefined
        }
      >
        <GuideButton
          title={
            details ? "Hide light controls" : "Adjust light & test connections"
          }
          onPress={() => setDetails((v) => !v)}
        />
        {details && (
          <View style={{ gap: 14 }}>
            <Text style={g.small}>
              Move the virtual light. These controls do not move real equipment.
            </Text>
            {(
              [
                ["x", "Left", "Right", 5, "cm"],
                ["z", "Towards subject", "Away from subject", 5, "cm"],
                ["height", "Lower", "Raise", 5, "cm"],
                ["yaw", "Turn left", "Turn right", 5, "°"],
                ["tilt", "Tilt up", "Tilt down", 5, "°"],
              ] as const
            ).map(([key, minus, plus, amount, unit]) => (
              <View style={g.row} key={key}>
                <GuideButton
                  title={`${minus} ${amount}${unit}`}
                  onPress={() => shift(key, -amount)}
                />
                <GuideButton
                  title={`${plus} ${amount}${unit}`}
                  onPress={() => shift(key, amount)}
                />
              </View>
            ))}
            <View style={g.row}>
              <GuideButton
                title={link.node ? "Turn node off" : "Turn node on"}
                onPress={() => toggle("node")}
              />
              <GuideButton
                title={
                  link.bluetooth
                    ? "Disconnect Bluetooth"
                    : "Reconnect Bluetooth"
                }
                onPress={() => toggle("bluetooth")}
              />
              <GuideButton
                title={link.reference ? "Lose reference" : "Restore reference"}
                onPress={() => toggle("reference")}
              />
              <GuideButton
                title={
                  ambientChanged
                    ? "Restore ambient light"
                    : "Change ambient light"
                }
                onPress={() => {
                  setAmbientChanged((v) => !v);
                  if (stage === 4) setStage(3);
                }}
              />
            </View>
          </View>
        )}
        <GuideButton
          title={how ? "Hide how it works" : "How it works"}
          onPress={() => setHow((v) => !v)}
        />
        {how && (
          <View style={{ gap: 12 }}>
            <Text style={g.title}>Phone + stand module</Text>
            <Text style={g.text}>
              Phone reference → light position. Candidate depth, orientation and
              light sensors → ESP32 → Bluetooth → phone comparison →
              photographer adjustment.
            </Text>
            <Text style={g.text}>
              Optional stand display / indicator:{" "}
              {!link.node ? "OFF" : paused ? "PAUSED" : title}
            </Text>
            <Text style={g.small}>
              The diagram is a proposal. Live positioning, BLE and calibrated
              light measurements are unavailable in this app. A range sensor
              alone cannot locate the stand.
            </Text>
          </View>
        )}
        <Text style={g.small}>
          Session-only practice. 3 cm position / 3° orientation demo tolerance;
          no measured match or identical-photo claim. Nothing here changes your
          saved setups.
        </Text>
      </RecreationGuide>
    </Screen>
  );
}
