import React, { useState } from "react";
import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import { useStore } from "../src/ui/Store";
import {
  Badge,
  Body,
  Button,
  Card,
  ErrorMessage,
  Heading,
  Screen,
} from "../src/ui/components";
import { humanError } from "../src/domain/schema";
import { removeUnusedPhotos } from "../src/media/media";
export default function Settings() {
  const { repo, refresh } = useStore(),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  return (
    <Screen
      back
      title="Your workspace. Your data."
      subtitle={`LightGuide ${Constants.expoConfig?.version ?? "unknown"} · ${Platform.OS === "web" ? "Browser preview" : "Build " + (Constants.nativeBuildVersion ?? "unknown")} · Offline prototype`}
    >
      <ErrorMessage message={error} />
      <Card>
        <Badge>LOCAL WORKSPACE</Badge>
        <Heading>Storage and privacy</Heading>
        <Body>
          Your setups and photographs stay on this device. Accounts, cloud
          backup, analytics and AI processing are not enabled.
        </Body>
        <Body muted>
          Uninstalling the app or clearing browser storage removes local data.
          Setup-note exports do not include photo files.
        </Body>
        <Button
          title="Clean expired Trash and unused photos"
          kind="secondary"
          onPress={async () => {
            try {
              repo.purgeExpired();
              await removeUnusedPhotos(repo);
              refresh();
              setNotice("Expired Trash and unreferenced photographs cleaned.");
              setError(null);
            } catch (e) {
              setError(humanError(e));
            }
          }}
        />
        {notice && <Body>{notice}</Body>}
      </Card>
      <Card>
        <Heading>Positioning and sensors</Heading>
        <Body>
          Use your saved photos and manually entered readings to recreate a
          setup. Connect a Protocol v2 node from Home for live sensor readings. Automatic spatial tracking remains unverified.
        </Body>
        <Body muted>
          The guided demo is practice only; it does not use the node or
          measure accuracy.
        </Body>
        <Button
          title="Open Android measurement app instructions"
          kind="secondary"
          onPress={() =>
            Linking.openURL(
              "https://github.com/V-Vekaria/LightGuide-v2/tree/main/experiments/phase-0-ar-positioning",
            ).catch(() => setError("Could not open the instructions."))
          }
        />
        <Body muted>
          {Platform.OS === "web"
            ? "This browser build is for workflow testing. It is not the AR/BLE product."
            : "Android is the first validation platform. iOS is unverified."}
        </Body>
      </Card>
      <Card>
        <Heading>Matching targets</Heading>
        <Body>
          Distance and height: 3 cm{"\n"}Direction and tilt: 3°{"\n"}Brightness:
          10% when calibrated and comparable
        </Body>
        <Body muted>
          These are targets for real testing. They do not assert measured
          accuracy. Spectral matching remains experimental.
        </Body>
      </Card>
    </Screen>
  );
}
