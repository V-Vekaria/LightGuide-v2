import { Welcome } from "../src/ui/Welcome";
import Feather from "@expo/vector-icons/Feather";
import { todayKey, shootState, dateKey } from "../src/domain/shoot-dates";
import React, { useState, useCallback, useEffect } from "react";
import {
  Pressable,
  Text,
  View,
  useWindowDimensions,
  AppState,
} from "react-native";
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

const tabs = ["Home", "Setups", "Shoots", "Equipment"] as const;
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
  const tab = tabs.find((t) => t === params.tab) ?? "Home";
  const [welcomed, setWelcomed] = useState(
    () =>
      repo.setting("welcome-seen", false) ||
      repo.setups().length > 0 ||
      Boolean(repo.draft("capture:new")),
  );
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState<"active" | "archive" | "trash">("active"),
    [error, setError] = useState<string | null>(null);
  const [shootFilter, setShootFilter] = useState("Upcoming");
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const refreshDate = () => setToday(todayKey());
    const t = setInterval(refreshDate, 30000);
    const sub = AppState.addEventListener("change", refreshDate);
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, []);
  const [equipmentQuery, setEquipmentQuery] = useState("");
  const [equipmentType, setEquipmentType] = useState("all");
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
            router.setParams({ tab: t });
          }}
          style={{ alignItems: "center", gap: 5, padding: 7 }}
        >
          <Feather
            name={(["home", "grid", "calendar", "briefcase"] as const)[i]}
            size={21}
            color={tab === t ? c.accent : c.muted}
          />
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
        <Badge tone="muted">{item.category}</Badge>
        <Body muted>↗</Body>
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
  if (!welcomed) return <Welcome onDone={() => setWelcomed(true)} />;
  return (
    <Screen
      title={
        tab === "Home"
          ? "Ready for your next shoot?"
          : tab === "Setups"
            ? "Saved setups"
            : tab === "Shoots"
              ? "Shoots"
              : "Equipment"
      }
      subtitle={
        tab === "Home"
          ? "Save what worked. Find it later. Recreate it with confidence."
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
          </View>
          <Button
            title="Save a setup"
            onPress={() => router.push("/capture")}
          />
          <View style={{ height: 12 }} />
          <Button
            title="Try a guided demo"
            kind="secondary"
            onPress={() => router.push("/simulation")}
          />
          <View style={{ height: 24 }} />
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
            <Heading>Your equipment, ready to use</Heading>
            <Body>
              Add one record for each item you own. When saving a setup, select
              the equipment used so you can remember it during recreation.
            </Body>
            <Badge tone="warning">DEVICE CONNECTION IS SEPARATE</Badge>
            <Body>
              Connect a node from Home for live readings. Equipment below is a
              manual inventory; adding an item does not pair a device.
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
            options={["Upcoming", "Completed"]}
            value={shootFilter}
            onChange={setShootFilter}
          />
          <View style={{ height: 16 }} />
          {shootFilter === "Completed" && (
            <Body muted>
              Past plans appear here as Date passed. Mark a shoot completed when
              it actually took place.
            </Body>
          )}
          {repo
            .shoots()
            .filter(
              (shoot) =>
                (shootState(shoot, today) === "Planned") ===
                (shootFilter === "Upcoming"),
            )
            .map((shoot) => (
              <Card
                key={shoot.id}
                onPress={() =>
                  router.push({ pathname: "/shoot", params: { id: shoot.id } })
                }
              >
                <Badge>{shootState(shoot, today)}</Badge>
                <Heading>{shoot.name}</Heading>
                <Body muted>
                  {shoot.scheduled_at ? dateKey(shoot.scheduled_at) : "No date"}{" "}
                  · {shoot.category} ·{" "}
                  {
                    repo.recreations().filter((a) => a.shoot_id === shoot.id)
                      .length
                  }{" "}
                  recreation attempts
                </Body>
              </Card>
            ))}
          {repo.shoots().length === 0 && (
            <Card>
              <Heading>Space for your next idea.</Heading>
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
