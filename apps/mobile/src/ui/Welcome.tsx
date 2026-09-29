import React, { useState } from "react";
import { Image, View } from "react-native";
import { router } from "expo-router";
import { Body, Button, Card, Choice, Heading, Screen } from "./components";
import { useStore } from "./Store";
export function Welcome({ onDone }: { onDone: () => void }) {
  const { repo } = useStore(),
    [page, setPage] = useState(0),
    [type, setType] = useState("Portrait"),
    [experience, setExperience] = useState("Beginner");
  const done = (capture = false) => {
    repo.setSetting("photography-preferences", { type, experience });
    repo.setSetting("welcome-seen", true);
    onDone();
    if (capture) router.navigate("/capture");
  };
  return (
    <Screen title="">
      {page === 0 ? (
        <>
          <Image
            source={require("../../assets/portrait.jpg")}
            resizeMode="cover"
            accessibilityLabel="Example portrait lighting"
            style={{
              width: "100%",
              height: 280,
              borderRadius: 12,
              marginBottom: 24,
            }}
          />
          <Heading>Keep the lighting that worked.</Heading>
          <Body>Save a setup. Recreate it next time.</Body>
          <View style={{ height: 24 }} />
          <Button title="Start my first setup" onPress={() => setPage(1)} />
          <View style={{ height: 12 }} />
          <Button
            title="Try the guided demo"
            kind="secondary"
            onPress={() => {
              done();
              router.navigate("/simulation");
            }}
          />
          <View style={{ height: 12 }} />
          <Button
            title="Explore workspace"
            kind="secondary"
            onPress={() => done()}
          />
          <View style={{ height: 16 }} />
          <Body muted>Works offline. No account needed.</Body>
        </>
      ) : (
        <>
          <Heading>Make LightGuide yours</Heading>
          <Card>
            <Body>What do you photograph?</Body>
            <Choice
              options={["Portrait", "Product", "Both"]}
              value={type}
              onChange={setType}
            />
            <Body>Your experience</Body>
            <Choice
              options={["Beginner", "Intermediate", "Professional"]}
              value={experience}
              onChange={setExperience}
            />
          </Card>
          <Button title="Continue to setup" onPress={() => done(true)} />
          <View style={{ height: 12 }} />
          <Button
            title="Skip for now"
            kind="secondary"
            onPress={() => done(true)}
          />
        </>
      )}
    </Screen>
  );
}
