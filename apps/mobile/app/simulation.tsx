import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  Badge,
  Body,
  Button,
  Card,
  Heading,
  Label,
  Screen,
  s,
} from "../src/ui/components";
import { evaluatePose, type Pose } from "../src/domain/spatial";
import { colors as c } from "../src/ui/theme";
const target: Pose = {
  referenceId: "demo-reference",
  objectId: "demo-light",
  position: [0, 1.8, 1.5],
  quaternion: [0, 0, 0, 1],
  observedAtMs: 0,
  source: "simulation",
  quality: "valid",
};
export default function Simulation() {
  const [position, setPosition] = useState<[number, number, number]>([
      0.18, 1.68, 1.61,
    ]),
    [lost, setLost] = useState(false),
    [now, setNow] = useState(performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, []);
  const result = evaluatePose(
    target,
    {
      ...target,
      position,
      observedAtMs: now,
      quality: lost ? "lost" : "valid",
    },
    now,
  );
  const move = (axis: number, delta: number) =>
    setPosition(
      (v) => v.map((n, i) => (i === axis ? n + delta : n)) as typeof position,
    );
  return (
    <Screen
      back
      title="Find the saved position."
      subtitle="An interactive demonstration of the guidance. No camera or sensor is being read."
    >
      <Badge tone="warning">SIMULATED DATA · NEVER A MEASURED MATCH</Badge>
      <View style={s.split}>
        <Card style={s.column}>
          <Label>TOP VIEW</Label>
          <View
            style={{
              height: 240,
              backgroundColor: c.bg,
              borderRadius: 12,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 36,
                height: 36,
                borderWidth: 2,
                borderColor: c.accent,
                borderRadius: 18,
                transform: [{ translateX: -18 }, { translateY: -18 }],
              }}
            />
            <View
              style={{
                position: "absolute",
                left: `${Math.max(5, Math.min(95, 50 + position[0] * 100))}%`,
                top: `${Math.max(5, Math.min(95, 50 + (position[2] - 1.5) * 100))}%`,
                width: 18,
                height: 18,
                backgroundColor: c.cyan,
                borderRadius: 9,
                transform: [{ translateX: -9 }, { translateY: -9 }],
              }}
            />
            <Text
              style={{
                position: "absolute",
                bottom: 12,
                left: 12,
                color: c.muted,
                fontSize: 11,
              }}
            >
              ○ Saved target ● Simulated light
            </Text>
          </View>
          <Heading>{result.label}</Heading>
          {result.delta && (
            <>
              <Body>
                Horizontal: {Math.abs(result.delta[0] * 100).toFixed(1)} cm{" "}
                {result.delta[0] > 0 ? "left" : "right"}
              </Body>
              <Body>
                Height: {Math.abs(result.delta[1] * 100).toFixed(1)} cm{" "}
                {result.delta[1] > 0 ? "lower" : "raise"}
              </Body>
              <Body>
                Depth: {Math.abs(result.delta[2] * 100).toFixed(1)} cm{" "}
                {result.delta[2] > 0 ? "back" : "forward"}
              </Body>
            </>
          )}
        </Card>
        <Card style={s.column}>
          <Heading>Move the simulated light</Heading>
          <Body muted>
            Each control moves 1 cm. Try losing tracking to see guidance
            disappear.
          </Body>
          <View style={s.row}>
            <Button
              title="Left 1 cm"
              kind="secondary"
              onPress={() => move(0, -0.01)}
            />
            <Button
              title="Right 1 cm"
              kind="secondary"
              onPress={() => move(0, 0.01)}
            />
            <Button
              title="Raise 1 cm"
              kind="secondary"
              onPress={() => move(1, 0.01)}
            />
            <Button
              title="Lower 1 cm"
              kind="secondary"
              onPress={() => move(1, -0.01)}
            />
            <Button
              title="Back 1 cm"
              kind="secondary"
              onPress={() => move(2, -0.01)}
            />
            <Button
              title="Forward 1 cm"
              kind="secondary"
              onPress={() => move(2, 0.01)}
            />
          </View>
          <Button
            title={lost ? "Reacquire tracking" : "Simulate tracking loss"}
            kind="secondary"
            onPress={() => setLost((v) => !v)}
          />
          <Button
            title="Place at saved target"
            onPress={() => setPosition([...target.position])}
          />
          <Body muted>
            The real test target is 3 cm and 3°. Meeting it here proves only the
            demonstration logic.
          </Body>
        </Card>
      </View>
    </Screen>
  );
}
