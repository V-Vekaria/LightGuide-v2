import React, { useCallback, useRef, useState } from "react";
import { AppState, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useStore } from "../../src/ui/Store";
import {
  Badge,
  Body,
  Button,
  Card,
  Choice,
  ErrorMessage,
  Field,
  Heading,
  Photo,
  PhotoComparison,
  Screen,
  s,
} from "../../src/ui/components";
import { LightDiagram } from "../../src/ui/RecreationGuide";
import { StepNav } from "../../src/ui/StepNav";
import { colors as c } from "../../src/ui/theme";
import {
  emptyScene,
  humanError,
  type Outcome,
  type Scene,
} from "../../src/domain/schema";
import {
  savedLight,
  manualCue,
  parseManualCm,
  unknownLight,
} from "../../src/domain/recreation-guide";
import { formatShutter } from "../../src/domain/camera-settings";
import { pickPhoto } from "../../src/media/media";

type Workspace = {
  stage: number;
  light: number;
  readings: Record<string, { height: string; distance: string }>;
  camera: Record<string, string>;
};
export default function Recreate() {
  const { repo } = useStore(),
    { id } = useLocalSearchParams<{ id: string }>();
  try {
    const attempt = repo.recreation(id),
      version = repo.version(attempt.setup_version_id),
      setup = repo.setup(version.setup_id);
    return (
      <RecreationFlow
        key={id}
        id={id}
        target={repo.scene(version.id)}
        title={setup.title}
        deleted={Boolean(setup.deleted_at)}
      />
    );
  } catch (e) {
    return (
      <Screen back title="Attempt unavailable">
        <ErrorMessage message={humanError(e)} />
      </Screen>
    );
  }
}
function RecreationFlow({
  id,
  target,
  title,
  deleted,
}: {
  id: string;
  target: Scene;
  title: string;
  deleted: boolean;
}) {
  const { repo, refresh } = useStore(),
    attempt = repo.recreation(id),
    lights = target.objects.filter((o) => o.kind === "light"),
    camera = target.objects.find((o) => o.kind === "camera");
  const previous = repo.setting("attempt:" + id, {
    step: 0,
    notes: "",
    outcome: null as Outcome | null,
  });
  const previousStage =
    previous.step === 0
      ? 0
      : previous.step <= lights.length
        ? 1
        : previous.step === lights.length + 1
          ? 2
          : 3;
  const [work, setWork] = useState<Workspace>(() =>
    repo.setting("workspace:" + id, {
      stage: previousStage,
      light: 0,
      readings: {},
      camera: {},
    }),
  );
  const [notes, setNotes] = useState(previous.notes),
    [outcome, setOutcome] = useState<Outcome | null>(previous.outcome ?? null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [help, setHelp] = useState(false);
  const [images, setImages] = useState<Scene["images"]>(
    () => repo.draft("attempt-photos:" + id)?.data.images ?? [],
  );
  const [resumed] = useState(() =>
    Boolean(repo.setting("workspace:" + id, null)),
  );
  const clock = useRef({
    elapsed: repo.setting("timer:" + id, 0),
    at: performance.now(),
    active: false,
  });
  useFocusEffect(
    useCallback(() => {
      if (attempt.status !== "in_progress" || deleted) return;
      clock.current.at = performance.now();
      clock.current.active = AppState.currentState === "active";
      const tick = () => {
        const t = performance.now(),
          v = clock.current;
        if (v.active) v.elapsed += Math.max(0, t - v.at);
        v.at = t;
        try {
          repo.setSetting("timer:" + id, Math.round(v.elapsed));
        } catch (e) {
          setError(humanError(e));
        }
      };
      const timer = setInterval(tick, 5000),
        sub = AppState.addEventListener("change", (state) => {
          tick();
          clock.current.active = state === "active";
        });
      return () => {
        tick();
        clock.current.active = false;
        clearInterval(timer);
        sub.remove();
      };
    }, [repo, id, attempt.status, deleted]),
  );
  const update = (patch: Partial<Workspace>) => {
    const next = { ...work, ...patch };
    try {
      repo.setSetting("workspace:" + id, next);
      setWork(next);
      setError(null);
    } catch (e) {
      setError(humanError(e));
    }
  };
  const navigate = (stage: number) => {
    update({ stage });
  };
  const light = lights[work.light] ?? lights[0],
    inputs = work.readings[light?.id ?? ""] ?? { height: "", distance: "" },
    saved = savedLight(target, light?.id);
  const current = {
    ...unknownLight,
    height: parseManualCm(inputs.height),
    distance: parseManualCm(inputs.distance),
  };
  const invalid = Object.values(inputs).some(
    (v) => v.trim() !== "" && parseManualCm(v) === null,
  );
  const reading = (key: "height" | "distance", value: string) => {
    if (light)
      update({
        readings: { ...work.readings, [light.id]: { ...inputs, [key]: value } },
      });
  };
  const originalResult = target.images.find((p) => p.role === "result"),
    placement =
      target.images.find((p) => p.role === "setup") ??
      target.images.find((p) => p.role === "reference");
  const pair = (
    <View style={{ flexDirection: "row", gap: 12, marginVertical: 16 }}>
      {[
        { photo: originalResult, label: "Result" },
        { photo: placement, label: "Placement" },
      ].map(({ photo, label }) => (
        <View key={label} style={{ flex: 1 }}>
          {photo ? (
            <Photo id={photo.image_id} label={label} compact />
          ) : (
            <Card>
              <Body muted>No {label.toLowerCase()} photo</Body>
            </Card>
          )}
        </View>
      ))}
    </View>
  );
  const addPhoto = async () => {
    setBusy(true);
    try {
      const image = await pickPhoto(repo);
      if (image) {
        const next = [
          ...images,
          { image_id: image, role: "result" as const, object_id: null },
        ];
        repo.saveDraft("attempt-photos:" + id, {
          title: "Recreation photos",
          category: "portrait",
          notes: "",
          role: "",
          power: "",
          modifier: "",
          distance: "",
          height: "",
          equipmentIds: [],
          images: next,
        });
        setImages(next);
      }
      setError(null);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };
  const record = () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!outcome) throw new Error("Choose your assessment before saving.");
      const elapsed =
        clock.current.elapsed +
        (clock.current.active
          ? Math.max(0, performance.now() - clock.current.at)
          : 0);
      repo.completeRecreation(
        id,
        outcome,
        notes,
        { ...emptyScene(), images, notes: notes.trim() || null },
        Math.round(elapsed),
      );
      repo.discardDraft("attempt-photos:" + id);
      refresh();
      setError(null);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };
  if (attempt.status === "completed")
    return (
      <Screen back title="Assessment saved" subtitle={title}>
        <Badge>YOUR ASSESSMENT</Badge>
        <Card>
          <Heading>{attempt.outcome?.replaceAll("_", " ")}</Heading>
          <Body>
            {JSON.parse(attempt.feedback).notes || "No adjustments recorded."}
          </Body>
          <Body muted>
            Your saved setup is unchanged. This is your judgement, not a
            sensor-verified match.
          </Body>
        </Card>
        <PhotoComparison
          originals={target.images.map((p) => ({
            id: p.image_id,
            label: "Original " + p.role + " 1",
          }))}
          results={
            attempt.actual_snapshot
              ? JSON.parse(attempt.actual_snapshot).images.map(
                  (p: Scene["images"][number]) => ({
                    id: p.image_id,
                    label: "New result 1",
                  }),
                )
              : []
          }
        />
        <Button
          title="Back to library"
          onPress={() =>
            router.replace({ pathname: "/", params: { tab: "Setups" } })
          }
        />
      </Screen>
    );
  if (deleted)
    return (
      <Screen back title={title}>
        <Body>Restore this setup from Trash before continuing.</Body>
      </Screen>
    );
  return (
    <Screen back title={title} subtitle="Recreation">
      <StepNav active={work.stage} onChange={navigate} />
      <Badge>MANUAL RECREATION</Badge>
      <ErrorMessage message={error} />
      {resumed && (
        <Body muted>
          Previous entries are retained. Recheck them: the light or camera may
          have moved.
        </Body>
      )}
      {work.stage === 0 && (
        <>
          <Heading>Use the same reference point</Heading>
          {placement ? (
            <Photo id={placement.image_id} label="Saved light placement" />
          ) : (
            pair
          )}
          <Body>Place the subject at the saved position.</Body>
          <Card>
            <Body>
              {target.notes ||
                "No reference notes saved. Check your placement photograph."}
            </Body>
          </Card>
          <Badge>Manual mode</Badge>
          <View style={{ height: 16 }} />
          <Button title="Reference checked" onPress={() => navigate(1)} />
        </>
      )}
      {work.stage === 1 && (
        <>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Heading>{light?.role || light?.name || "Light"}</Heading>
            <Body muted>
              {lights.length
                ? `${work.light + 1} of ${lights.length}`
                : "No saved light"}
            </Body>
          </View>
          <Body muted>Light height — side view</Body>
          <LightDiagram
            saved={saved}
            current={current}
            side
            simulated={false}
          />
          <Body muted>Manual readings</Body>
          {pair}
          <View
            style={{
              flexDirection: "row",
              paddingBottom: 10,
              borderBottomWidth: 1,
              borderColor: c.border,
            }}
          >
            {["Measurement", "Saved", "Now"].map((t, i) => (
              <Text
                key={t}
                style={{
                  color: c.muted,
                  flex: i === 0 ? 1.4 : 1,
                  fontSize: 12,
                }}
              >
                {t}
              </Text>
            ))}
          </View>
          {(["height", "distance"] as const).map((key) => (
            <View
              key={key}
              testID={"guide-value-" + key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderBottomWidth: 1,
                borderColor: c.border,
                paddingVertical: 12,
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: c.text,
                  flex: 1.4,
                  textTransform: "capitalize",
                }}
              >
                {key}
              </Text>
              <Text style={{ color: c.text, flex: 1 }}>
                {saved[key] === null
                  ? "Unknown"
                  : `${Math.round(saved[key]!)} cm`}
              </Text>
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: c.panel,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: c.border,
                }}
              >
                <TextInput
                  accessibilityLabel={
                    (key === "height" ? "Height" : "Distance") + " now (cm)"
                  }
                  keyboardType="decimal-pad"
                  value={inputs[key]}
                  onChangeText={(v) => reading(key, v)}
                  style={{ color: c.text, flex: 1, minHeight: 48, padding: 8 }}
                  maxLength={20}
                />
                <Text style={{ color: c.muted, paddingRight: 8 }}>cm</Text>
              </View>
            </View>
          ))}
          <View style={{ height: 12 }} />
          <Card>
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              <Feather name="move" size={24} color={c.accent} />
              <View style={{ flex: 1 }}>
                <Heading testID="guide-cue">
                  {invalid
                    ? "Check your measurements"
                    : manualCue(saved, current)}
                </Heading>
                <Body muted>Based on your entries.</Body>
              </View>
            </View>
          </Card>
          <Button
            title={help ? "Hide measurement guide" : "Show measurement guide"}
            kind="secondary"
            onPress={() => setHelp(!help)}
          />
          {help && (
            <Card>
              <Body>
                Measure height from the floor to the light centre. Measure
                distance from the modifier front to the same subject point used
                when saving. Missing readings stay unknown.
              </Body>
            </Card>
          )}
          {lights.length > 1 && (
            <>
              <Body muted>Current light</Body>
              <Choice
                options={lights.map((l, i) => `${i + 1}. ${l.role || "Light"}`)}
                value={`${work.light + 1}. ${light?.role || "Light"}`}
                onChange={(v) => update({ light: Number(v.split(".")[0]) - 1 })}
              />
            </>
          )}
          <View style={{ height: 12 }} />
          <Button
            title="Next: camera"
            disabled={invalid}
            onPress={() => navigate(2)}
          />
        </>
      )}
      {work.stage === 2 && (
        <>
          <Heading>Check your camera</Heading>
          <Body muted>
            {camera?.equipment.map((e) => e.name).join(" · ") ||
              "Camera not specified"}
          </Body>
          <Body>Read these from your camera.</Body>
          <View style={{ height: 16 }} />
          {(
            [
              [
                "Shutter speed",
                "shutter",
                formatShutter(camera?.settings.exposure_time_s ?? null),
              ],
              [
                "Aperture",
                "aperture",
                String(camera?.settings.aperture_f ?? ""),
              ],
              ["ISO", "iso", String(camera?.settings.iso ?? "")],
              [
                "Focal length (mm)",
                "focal",
                String(camera?.settings.focal_length_mm ?? ""),
              ],
            ] as const
          ).map(([label, key, value]) => (
            <View
              key={key}
              style={{
                borderBottomWidth: 1,
                borderColor: c.border,
                marginBottom: 14,
              }}
            >
              <Body muted>
                Saved {label.toLowerCase()}: {value || "Unknown"}
              </Body>
              <Field
                label={label + " now"}
                value={work.camera[key] ?? ""}
                onChange={(v) =>
                  update({ camera: { ...work.camera, [key]: v } })
                }
              />
            </View>
          ))}
          <Button title="Camera settings checked" onPress={() => navigate(3)} />
          <View style={{ height: 10 }} />
          <Button
            title="Skip camera check"
            kind="secondary"
            onPress={() => navigate(3)}
          />
        </>
      )}
      {work.stage === 3 && (
        <>
          <Heading>Compare the result</Heading>
          <View style={{ flexDirection: "row", gap: 12, marginVertical: 12 }}>
            <View style={{ flex: 1 }}>
              {originalResult ? (
                <Photo
                  id={originalResult.image_id}
                  label="Saved result"
                  compact
                />
              ) : (
                <Body muted>No saved result</Body>
              )}
            </View>
            <View style={{ flex: 1 }}>
              {images[0] ? (
                <Photo id={images[0].image_id} label="New result" compact />
              ) : (
                <Card>
                  <Body muted>Add a new result</Body>
                </Card>
              )}
            </View>
          </View>
          <PhotoComparison
            originals={target.images.map((p) => ({
              id: p.image_id,
              label: "Original " + p.role + " 1",
            }))}
            results={images.map((p) => ({
              id: p.image_id,
              label: "New result 1",
            }))}
          />
          <View style={{ height: 12 }} />
          <Button
            title="Add test photograph"
            kind="secondary"
            disabled={busy}
            onPress={addPhoto}
          />
          <Body muted>
            Compare shadow edges, direction and brightness. LightGuide does not
            calculate an image match.
          </Body>
          <View style={{ height: 20 }} />
          <Heading>How close is the result?</Heading>
          <Choice
            options={["Close enough", "Needs adjustment", "Not evaluated"]}
            value={
              outcome === "close_enough"
                ? "Close enough"
                : outcome === "unsuccessful"
                  ? "Needs adjustment"
                  : outcome === "not_evaluated"
                    ? "Not evaluated"
                    : ""
            }
            onChange={(v) => {
              const next: Outcome =
                v === "Close enough"
                  ? "close_enough"
                  : v === "Needs adjustment"
                    ? "unsuccessful"
                    : "not_evaluated";
              try {
                repo.saveRecreationProgress(id, lights.length + 3, notes, next);
                setOutcome(next);
              } catch (e) {
                setError(humanError(e));
              }
            }}
          />
          <View style={{ height: 16 }} />
          <Field
            label="Adjustments and feedback"
            multiline
            value={notes}
            onChange={(v) => {
              setNotes(v);
              try {
                repo.saveRecreationProgress(
                  id,
                  lights.length + 3,
                  v,
                  outcome ?? undefined,
                );
              } catch (e) {
                setError(humanError(e));
              }
            }}
          />
          <Body muted>
            Your judgement.
            {images.length ? "" : " No comparison photograph attached."}
          </Body>
          <View style={{ height: 12 }} />
          <Button
            title="Save assessment"
            disabled={busy || !outcome}
            onPress={record}
          />
        </>
      )}
      <View style={{ height: 16 }} />
      <Button
        title="Save and exit"
        kind="secondary"
        onPress={() => router.replace("/")}
      />
    </Screen>
  );
}
