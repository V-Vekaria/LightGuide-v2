import React, { useState, useCallback } from "react";
import {
  Pressable,
  Image,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useStore } from "../src/ui/Store";
import {
  Badge,
  Body,
  Button,
  Card,
  Choice,
  ErrorMessage,
  Field,
  Heading,
  Label,
  Photo,
  Screen,
  s,
} from "../src/ui/components";
import { colors as c } from "../src/ui/theme";
import type { Setup } from "../src/data/repository";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { dateKey, shootState, todayKey } from "../src/domain/shoot-dates";

const tabs = ["Home", "Shoots", "Create", "Setups", "Equipment"] as const;
export default function Home() {
  const { repo, refresh } = useStore();
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  const { width, fontScale } = useWindowDimensions();
  const wideLayout = width >= 760 && fontScale <= 1.3;
  const params = useLocalSearchParams<{ tab?: string }>();
  const onboarding = repo.setting<{
    complete: boolean;
    photographyType: "portrait" | "product" | "other";
    experience: "new" | "some" | "experienced";
  } | null>("onboarding-v1", null);
  const tab = tabs.find((t) => t === params.tab) ?? "Home";
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState<"active" | "archive" | "trash">("active"),
    [error, setError] = useState<string | null>(null);
  const [equipmentQuery, setEquipmentQuery] = useState("");
  const [equipmentType, setEquipmentType] = useState("all");
  const [shootView, setShootView] = useState<"upcoming" | "completed">("upcoming");
  if (!onboarding?.complete)
    return <Onboarding onComplete={refresh} />;
  const equipment = repo
    .equipment()
    .filter(
      (item) =>
        (equipmentType === "all" || item.kind === equipmentType) &&
        [item.name, item.manufacturer, item.model]
          .join(" ")
          .toLowerCase()
          .includes(equipmentQuery.trim().toLowerCase()),
    );
  const setups = repo.setups(),
    attempts = repo.recreations(),
    draft = repo.draft("capture:new");
  const today = todayKey();
  const visibleShoots = repo.shoots().filter((shoot) =>
    shootView === "completed"
      ? shootState(shoot, today) !== "Planned"
      : shootState(shoot, today) === "Planned",
  );
  const footer = (
    <View
      style={{
        backgroundColor: c.panel,
        borderTopWidth: 1,
        borderTopColor: c.border,
        paddingVertical: 12,
        flexDirection: "row",
        justifyContent: "space-around",
      }}
    >
      {tabs.map((t, i) => (
        <Pressable
          key={t}
          accessibilityRole="button"
          accessibilityLabel={t + " tab"}
          accessibilityState={{ selected: tab === t }}
          onPress={() => {
            if (t === tab) return;
            if (t === "Create") router.navigate("/capture");
            else router.setParams({ tab: t });
          }}
          style={{ alignItems: "center", gap: 5, padding: 7 }}
        >
          <Text style={{ color: tab === t ? c.accent : c.muted, fontSize: 18 }}>
            <MaterialCommunityIcons
              name={(["home-outline", "calendar-blank-outline", "plus-circle-outline", "layers-outline", "briefcase-outline"] as const)[i]}
              size={22}
              color={tab === t ? c.accent : c.muted}
            />
          </Text>
          <Text
            style={{
              color: tab === t ? c.accent : c.muted,
              fontSize: 10,
              fontWeight: "600",
            }}
          >
            {t}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  const setupCard = (item: Setup) => (
    <Card
      key={item.id}
      onPress={() =>
        router.push({ pathname: "/setup/[id]", params: { id: item.id } })
      }
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={s.row}>
          <Badge tone="muted">{item.category}</Badge>
          {repo.isExampleSetup(item.id) && <Badge>EXAMPLE SETUP · DEMO</Badge>}
        </View>
        <MaterialCommunityIcons name="chevron-right" color={c.muted} size={24} />
      </View>
      {(() => {
        const photos = repo.scene(item.current_version_id).images;
        const photo = photos.find((p) => p.role === "result") ?? photos[0];
        return photo ? (
          <Photo
            id={photo.image_id}
            label="Setup preview"
            compact
            interactive={false}
          />
        ) : (
          <Body muted>No photo saved</Body>
        );
      })()}
      <Heading>{item.title}</Heading>
      <Body muted>
        Saved {new Date(item.updated_at).toLocaleDateString()} · On this device
      </Body>
    </Card>
  );
  return (
    <Screen
      title={
        tab === "Home"
          ? "Ready for your next shoot?"
          : tab === "Setups"
            ? "Your setup library."
            : tab === "Shoots"
              ? "Make room for the shoot."
              : "Know your equipment."
      }
      subtitle={
        tab === "Home"
          ? "Save your setup so you can recreate it next time."
          : tab === "Setups"
            ? "Every saved version stays available, even when you change your setup."
            : tab === "Shoots"
              ? "Keep shoot plans and recreation attempts connected."
              : "Your equipment inventory. Tap an item to edit its details."
      }
      footer={footer}
    >
      <ErrorMessage message={error} />
      {tab === "Home" && (
        <>
          <View style={[s.row, { marginBottom: 24 }]}>
            <Badge>OFFLINE READY</Badge>
            <Body muted>Saved on this device</Body>
            <Button
              title="Connect LightGuide device"
              kind="secondary"
              onPress={() => router.push("/device")}
            />
          </View>
          <View style={wideLayout ? s.split : { gap: 4 }}>
            <View style={wideLayout ? [s.column, { flex: 1.4 }] : {}}>
              <Card
                style={{
                  backgroundColor: "#183B33",
                  borderColor: "#326052",
                  padding: 26,
                }}
              >
                <Label>MEASURE · SAVE · RECREATE</Label>
                <Text
                  style={{
                    fontSize: 29,
                    color: c.text,
                    fontWeight: "600",
                    lineHeight: 35,
                  }}
                >
                  Good lighting deserves{"\n"}a second take.
                </Text>
                <Body style={{ color: "#B9D3C8" }}>
                  Save a photo and your lighting notes. Recreate them with
                  manual checks; live sensors are not connected.
                </Body>
                <View style={s.row}>
                  <Button
                    title="Save a setup"
                    onPress={() => router.push("/capture")}
                  />
                  <Button
                    title="Try a guided demo"
                    kind="secondary"
                    onPress={() => router.push("/simulation")}
                  />
                </View>
              </Card>
            </View>
            <Card
              style={wideLayout ? [s.column, { justifyContent: "center" }] : {}}
            >
              <Label>YOUR WORKSPACE</Label>
              <Text style={{ fontSize: 44, color: c.text, fontWeight: "600" }}>
                {setups.length.toString().padStart(2, "0")}
              </Text>
              <Body muted>
                active setups ·{" "}
                {attempts.filter((a) => a.status === "completed").length}{" "}
                recreations recorded
              </Body>
              <Body muted>
                Connect a LightGuide node from Home when you want live readings.
              </Body>
            </Card>
          </View>
          {draft && (
            <Card>
              <Badge tone="warning">UNFINISHED CAPTURE</Badge>
              <Heading>{draft.data.title || "Your draft is safe"}</Heading>
              <Button
                title="Continue draft"
                onPress={() => router.push("/capture")}
              />
            </Card>
          )}
          {attempts
            .filter((a) => a.status === "in_progress")
            .map((a) => (
              <Card key={a.id}>
                <Label>RECREATION IN PROGRESS</Label>
                <Body>
                  {repo.setup(repo.version(a.setup_version_id).setup_id).title}
                </Body>
                <Button
                  title="Resume recreation"
                  kind="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/recreate/[id]",
                      params: { id: a.id },
                    })
                  }
                />
              </Card>
            ))}
          <View
            style={[
              s.row,
              {
                justifyContent: "space-between",
                marginTop: 12,
                marginBottom: 16,
              },
            ]}
          >
            <Heading>Recently saved</Heading>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.replace({ pathname: "/", params: { tab: "Setups" } })
              }
            >
              <Text style={{ color: c.accent }}>View library →</Text>
            </Pressable>
          </View>
          {setups.length ? (
            setups.slice(0, 4).map(setupCard)
          ) : (
            <Card>
              <Heading>Your first setup starts here.</Heading>
              <Body muted>
                You do not need a complete equipment list or live sensors. Start
                with a name and add the details you want to remember.
              </Body>
            </Card>
          )}
        </>
      )}
      {tab === "Setups" && (
        <>
          <View style={{ marginBottom: 20 }}>
            <Choice
              options={["active", "archive", "trash"] as const}
              value={filter}
              onChange={setFilter}
            />
          </View>
          <Field
            label="Search setups"
            value={query}
            onChange={setQuery}
            placeholder="Search by name"
          />
          {repo.setups(filter, query).map(setupCard)}
          {repo.setups(filter, query).length === 0 && (
            <Card>
              <Heading>
                {filter === "trash" ? "Trash is empty." : "No setups here yet."}
              </Heading>
              <Body muted>
                {filter === "trash"
                  ? "Deleted setups can be restored for 30 days."
                  : "Save a setup or try a different search."}
              </Body>
            </Card>
          )}
          <Button
            title="Create setup"
            onPress={() => router.push("/capture")}
          />
        </>
      )}
      {tab === "Equipment" && (
        <>
          <Card>
            <Heading>How your inventory works</Heading>
            <Body>
              Add one record for each item you own. When saving a setup, select
              the equipment used so you can remember it during recreation.
            </Body>
            <Badge tone="warning">LIVE CONNECTION UNAVAILABLE</Badge>
            <Body>
              This build cannot connect to a LightGuide sensor. Equipment below
              is a manual inventory; adding an item does not pair a device.
            </Body>
          </Card>
          <Button
            title="Add equipment"
            onPress={() => router.push("/equipment")}
          />
          <View style={{ height: 20 }} />
          <Field
            label="Search equipment"
            value={equipmentQuery}
            onChange={setEquipmentQuery}
            placeholder="Name, manufacturer or model"
          />
          <Label>Filter by equipment type</Label>
          <Choice
            options={[
              "all",
              "camera",
              "lens",
              "light",
              "modifier",
              "reflector",
              "other",
            ]}
            value={equipmentType}
            onChange={setEquipmentType}
          />
          <View style={{ height: 16 }} />
          {equipment.map((e) => (
            <Card
              key={e.id}
              onPress={() =>
                router.push({ pathname: "/equipment", params: { id: e.id } })
              }
            >
              <Label>{e.kind}</Label>
              <Body muted>Item name</Body>
              <Heading>{e.name}</Heading>
              <Body muted>
                {[e.manufacturer, e.model].filter(Boolean).join(" · ") ||
                  "Manual equipment record"}
              </Body>
            </Card>
          ))}
          {equipment.length === 0 && repo.equipment().length > 0 && (
            <Card>
              <Heading>No matching equipment.</Heading>
              <Body muted>Try another name or choose All.</Body>
            </Card>
          )}
          {repo.equipment().length === 0 && (
            <Card>
              <Heading>Start with your main light.</Heading>
              <Body muted>
                Cameras, lenses and modifiers can be added as you need them.
              </Body>
            </Card>
          )}
        </>
      )}
      {tab === "Shoots" && (
        <>
          <Button title="Plan a shoot" onPress={() => router.push("/shoot")} />
          <View style={{ height: 20 }} />
          <Choice
            options={["upcoming", "completed"] as const}
            value={shootView}
            onChange={setShootView}
          />
          <View style={{ height: 16 }} />
          {visibleShoots.map((shoot) => (
            <Card
              key={shoot.id}
              onPress={() =>
                router.push({ pathname: "/shoot", params: { id: shoot.id } })
              }
            >
              <Badge>{shootState(shoot, today)}</Badge>
              <Heading>{shoot.name}</Heading>
              <Body muted>
                {shoot.category} · {shoot.scheduled_at ? dateKey(shoot.scheduled_at).split("-").reverse().join("/") : "No date"} ·{" "}
                {
                  repo.recreations().filter((a) => a.shoot_id === shoot.id)
                    .length
                }{" "}
                recreation attempts
              </Body>
            </Card>
          ))}
          {visibleShoots.length === 0 && (
            <Card>
              <Heading>{shootView === "completed" ? "No completed shoots." : "Space for your next idea."}</Heading>
              <Body muted>
                Give your shoot a name. Attach a recreation when you are ready.
              </Body>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function Onboarding({ onComplete }: { onComplete: () => void }) {
  const { repo } = useStore();
  const [step, setStep] = useState(0);
  const [photographyType, setPhotographyType] = useState<
    "portrait" | "product" | "other"
  >("portrait");
  const [experience, setExperience] = useState<"new" | "some" | "experienced">(
    "new",
  );
  const finish = (demo: boolean) => {
    repo.setSetting("onboarding-v1", {
      complete: true,
      photographyType,
      experience,
    });
    onComplete();
    if (demo) router.push("/simulation");
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 24,
          alignSelf: "center",
          width: "100%",
          maxWidth: 520,
        }}
      >
        <Text
          style={{
            color: c.text,
            letterSpacing: 5,
            fontSize: 15,
            fontWeight: "700",
            marginBottom: 36,
          }}
        >
          LIGHTGUIDE
        </Text>
        {step === 0 && (
          <>
            <Image
              source={require("../assets/demo/soft-portrait-placement.png")}
              accessibilityLabel="Example portrait lighting setup"
              resizeMode="cover"
              style={{ width: "100%", height: 280, borderRadius: 18, marginBottom: 24 }}
            />
            <Badge>WELCOME</Badge>
            <Text style={[s.title, { marginTop: 18 }]}>Keep the lighting that worked.</Text>
            <Body muted style={{ fontSize: 17, lineHeight: 26, marginVertical: 16 }}>
              Save a setup. Recreate it next time. LightGuide works offline and
              does not require an account.
            </Body>
            <Card style={{ backgroundColor: "#183B33", borderColor: "#326052" }}>
              <Heading>One example is ready for you</Heading>
              <Body>
                Soft portrait — Example setup is bundled for learning and is
                always labelled as demo content.
              </Body>
            </Card>
            <Button title="Continue" onPress={() => setStep(1)} />
          </>
        )}
        {step === 1 && (
          <>
            <Badge>YOUR STARTING POINT</Badge>
            <Text style={[s.title, { marginTop: 18 }]}>Make it yours.</Text>
            <Heading>What do you shoot?</Heading>
            <Choice
              options={["portrait", "product", "other"] as const}
              value={photographyType}
              onChange={setPhotographyType}
            />
            <View style={{ height: 26 }} />
            <Heading>Lighting experience</Heading>
            <Choice
              options={["new", "some", "experienced"] as const}
              value={experience}
              onChange={setExperience}
            />
            <View style={{ height: 30 }} />
            <Button title="Continue" onPress={() => setStep(2)} />
            <View style={{ height: 10 }} />
            <Button title="Back" kind="secondary" onPress={() => setStep(0)} />
          </>
        )}
        {step === 2 && (
          <>
            <Badge>GUIDED DEMO</Badge>
            <Text style={[s.title, { marginTop: 18 }]}>Learn the complete loop.</Text>
            <Body muted style={{ fontSize: 17, lineHeight: 26, marginVertical: 16 }}>
              Practice Reference → Lights → Camera → Check without hardware.
              Every generated reading is prominently marked SIMULATION / EXAMPLE DATA.
            </Body>
            <Button title="Try the guided demo" onPress={() => finish(true)} />
            <View style={{ height: 10 }} />
            <Button title="Go to Home" kind="secondary" onPress={() => finish(false)} />
            <View style={{ height: 10 }} />
            <Button title="Back" kind="secondary" onPress={() => setStep(1)} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
