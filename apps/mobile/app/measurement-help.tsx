import React from "react";
import { Body, Card, Heading, Label, Screen } from "../src/ui/components";

export default function MeasurementHelp() {
  return (
    <Screen back title="Measurement help" subtitle="Use the same physical reference points each time.">
      <Card>
        <Label>HEIGHT</Label>
        <Heading>Measure from floor to light centre</Heading>
        <Body>1. Place the stand on the floor mark.</Body>
        <Body>2. Measure vertically to the centre of the light or modifier.</Body>
        <Body>3. Record the same point next time.</Body>
        <Body muted>
          Height is manual entry / confirmation. The LightGuide node does not
          currently measure absolute stand height.
        </Body>
      </Card>
      <Card>
        <Label>DISTANCE</Label>
        <Heading>Measure light to subject reference</Heading>
        <Body>1. Choose a repeatable point on the subject or set.</Body>
        <Body>2. Measure from the modifier's front centre to that point.</Body>
        <Body>3. Save the reference point in setup notes.</Body>
        <Body muted>
          A device distance reading describes the sensor-to-surface distance.
          It must never be relabelled as stand height.
        </Body>
      </Card>
    </Screen>
  );
}
