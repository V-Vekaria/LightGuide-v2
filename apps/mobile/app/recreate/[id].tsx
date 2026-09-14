import React, { useCallback, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
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
  Label,
  Photo,
  Screen,
  useResponsiveColumns,
  s,
} from "../../src/ui/components";
import {
  emptyScene,
  humanError,
  type Outcome,
  type Scene,
} from "../../src/domain/schema";
import { pickPhoto } from "../../src/media/media";

export default function Recreate() {
  const { repo, refresh } = useStore(),
    { id } = useLocalSearchParams<{ id: string }>();
  let attempt, scene, setup;
  try {
    attempt = repo.recreation(id);
    const version = repo.version(attempt.setup_version_id);
    scene = repo.scene(version.id);
    setup = repo.setup(version.setup_id);
  } catch (e) {
    return (
      <Screen back title="Attempt unavailable.">
        <ErrorMessage message={humanError(e)} />
      </Screen>
    );
  }
  return (
    <RecreationFlow
      key={id}
      id={id}
      target={scene}
      title={setup.title}
      deleted={Boolean(setup.deleted_at)}
    />
  );
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
  const columns = useResponsiveColumns();
  const { repo, refresh } = useStore(),
    attempt = repo.recreation(id);
  const progress = repo.setting("attempt:" + id, {
    step: 0,
    notes: "",
    outcome: "close_enough" as Outcome,
  });
  const [step, setStep] = useState(progress.step),
    [notes, setNotes] = useState(progress.notes),
    [outcome, setOutcome] = useState<Outcome>(
      progress.outcome ?? "close_enough",
    ),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [images, setImages] = useState<Scene["images"]>(
      () => repo.draft("attempt-photos:" + id)?.data.images ?? [],
    ),
    [elapsed, setElapsed] = useState(repo.setting("timer:" + id, 0));
  const clock = useRef({
    elapsed,
    at: performance.now(),
    active: AppState.currentState === "active",
  });
  useFocusEffect(
    useCallback(() => {
      if (attempt.status !== "in_progress" || deleted) return;
      clock.current.at = performance.now();
      clock.current.active = AppState.currentState === "active";
      const tick = () => {
        const now = performance.now(),
          v = clock.current;
        if (v.active) v.elapsed += Math.max(0, now - v.at);
        v.at = now;
        // Keep full-resolution timing in the ref and durable record, but avoid
        // continuously invalidating the native accessibility tree for a clock.
        setElapsed((shown) =>
          Math.floor(shown / 60000) === Math.floor(v.elapsed / 60000)
            ? shown
            : v.elapsed,
        );
        try {
          repo.setSetting("timer:" + id, Math.round(v.elapsed));
        } catch (e) {
          setError(humanError(e));
        }
      };
      const timer = setInterval(tick, 1000);
      const sub = AppState.addEventListener("change", (state) => {
        tick();
        clock.current.active = state === "active";
      });
      return () => {
        tick();
        clock.current.active = false;
        clearInterval(timer);
        sub.remove();
      };
    }, [id, attempt.status, deleted, repo]),
  );
  const camera = target.objects.find((o) => o.kind === "camera");
  const lights = target.objects.filter((o) => o.kind === "light");
  const steps = [
    {
      title: "Re-establish your scene",
      text: "Place the subject and background as shown in your saved setup. Use the same physical reference and check your photographs.",
    },
    ...lights.map((o) => ({
      title: `Position your ${o.role?.toLowerCase() ?? "main"} light`,
      text: `${o.settings.modifier_description ?? "Use your recorded modifier"}. Power: ${o.settings.power_label ?? "not recorded"}. Compare the saved measurements and photograph; mark this step complete after checking it yourself.`,
    })),
    {
      title: "Set your camera",
      text: camera
        ? `${camera.equipment.map((e) => e.name).join(" · ")}. ${camera.settings.focal_length_mm ?? "—"} mm, f/${camera.settings.aperture_f ?? "—"}, ${camera.settings.exposure_time_s ?? "—"} s, ISO ${camera.settings.iso ?? "—"}. ${camera.notes ?? ""} Make a test photograph.`
        : "Compare the camera position and framing. No numeric settings were recorded. Make a test photograph before continuing.",
    },
    {
      title: "Compare the result",
      text: "Compare shadows, highlights and the background with your original image. Record any adjustments and your own assessment.",
    },
  ];
  const advance = (next: number) => {
    try {
      repo.saveRecreationProgress(id, next, notes);
      setStep(next);
      setError(null);
    } catch (e) {
      setError(humanError(e));
    }
  };
  const addPhoto = async () => {
    setBusy(true);
    setError(null);
    try {
      const imageId = await pickPhoto(repo);
      if (imageId) {
        const next = [
          ...images,
          { image_id: imageId, role: "result" as const, object_id: null },
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
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };
  const complete = () => {
    try {
      const actual = { ...emptyScene(), images, notes: notes.trim() || null };
      const ms =
        clock.current.elapsed +
        (clock.current.active
          ? Math.max(0, performance.now() - clock.current.at)
          : 0);
      repo.completeRecreation(id, outcome, notes, actual, Math.round(ms));
      repo.discardDraft("attempt-photos:" + id);
      refresh();
      setError(null);
    } catch (e) {
      setError(humanError(e));
    }
  };
  if (attempt.status === "completed")
    return (
      <Screen back title="Recreation recorded." subtitle={title}>
        <Badge>PHOTOGRAPHER-REPORTED OUTCOME</Badge>
        <Card>
          <Heading>{attempt.outcome?.replaceAll("_", " ")}</Heading>
          <Body>
            {JSON.parse(attempt.feedback).notes || "No adjustments recorded."}
          </Body>
          <Body muted>
            {Math.round((attempt.duration_ms ?? 0) / 1000)} seconds of active
            guidance time · {new Date(attempt.completed_at!).toLocaleString()}
          </Body>
          <Body muted>
            No measured spatial match was asserted. This attempt retains its
            original target version.
          </Body>
        </Card>
        <View style={s.row}>
          {attempt.actual_snapshot &&
            JSON.parse(attempt.actual_snapshot).images.map(
              (i: Scene["images"][number]) => (
                <Photo
                  key={i.image_id}
                  id={i.image_id}
                  label="Recreated result"
                />
              ),
            )}
        </View>
        <Button
          title="Back to library"
          onPress={() =>
            router.replace({ pathname: "/", params: { tab: "Setups" } })
          }
        />
      </Screen>
    );
  return (
    <Screen back title="Recreate, one step at a time." subtitle={title}>
      <Badge tone="warning">MANUAL RECREATION</Badge>
      <ErrorMessage message={error} />
      {deleted ? (
        <Card>
          <Body>Restore the setup from Trash to continue this attempt.</Body>
        </Card>
      ) : (
        <>
          <View
            style={[
              s.row,
              { justifyContent: "space-between", marginVertical: 20 },
            ]}
          >
            <Label>
              STEP {Math.min(step + 1, steps.length)} OF {steps.length}
            </Label>
            <Body muted>
              {Math.floor(elapsed / 60000)}m active · recorded to the second
            </Body>
          </View>
          <Card>
            <Heading>{steps[Math.min(step, steps.length - 1)]!.title}</Heading>
            <Body>{steps[Math.min(step, steps.length - 1)]!.text}</Body>
            <View style={s.row}>
              {step > 0 && (
                <Button
                  title="Previous step"
                  kind="secondary"
                  onPress={() => advance(step - 1)}
                />
              )}
              <Button
                title={
                  step >= steps.length
                    ? "Steps completed"
                    : "Mark step complete"
                }
                disabled={step >= steps.length}
                onPress={() => advance(step + 1)}
              />
            </View>
          </Card>
          <View style={columns.split}>
            <Card style={columns.column}>
              <Label>ORIGINAL SETUP</Label>
              {target.images.length ? (
                target.images.map((i) => (
                  <Photo key={i.image_id} id={i.image_id} label={i.role} />
                ))
              ) : (
                <Body muted>No original photographs saved.</Body>
              )}
              <Body>{target.notes ?? "No original notes."}</Body>
              {lights.map((o) => (
                <View key={o.id}>
                  <Heading>{o.role ?? "Light"}</Heading>
                  <Body>Power: {o.settings.power_label ?? "Not recorded"}</Body>
                  <Body>
                    Modifier:{" "}
                    {o.settings.modifier_description ?? "Not recorded"}
                  </Body>
                  {o.measurements
                    .filter(
                      (m) =>
                        !o.measurements.some(
                          (n) => n.supersedes_measurement_id === m.id,
                        ),
                    )
                    .map((m) => (
                      <Body key={m.id} muted>
                        {m.kind}:{" "}
                        {typeof m.value === "number"
                          ? Math.round(m.value * 100) + " cm"
                          : "Not recorded"}{" "}
                        ({m.source})
                      </Body>
                    ))}
                </View>
              ))}
            </Card>
            <Card style={columns.column}>
              <Label>YOUR RECREATED RESULT</Label>
              <Button
                title="Add test photograph"
                kind="secondary"
                disabled={busy}
                onPress={addPhoto}
              />
              {images.map((i) => (
                <Photo key={i.image_id} id={i.image_id} label="New result" />
              ))}
              <Field
                label="Adjustments and feedback"
                multiline
                value={notes}
                onChange={(value) => {
                  setNotes(value);
                  try {
                    repo.saveRecreationProgress(id, step, value);
                  } catch (e) {
                    setError(humanError(e));
                  }
                }}
              />
              <Body>How close did you get?</Body>
              <Choice
                options={
                  [
                    "matched",
                    "close_enough",
                    "adapted",
                    "unsuccessful",
                  ] as const
                }
                value={outcome}
                onChange={(value) => {
                  try {
                    repo.saveRecreationProgress(id, step, notes, value);
                    setOutcome(value);
                    setError(null);
                  } catch (e) {
                    setError(humanError(e));
                  }
                }}
              />
              <Body muted>
                This is your assessment. Live positioning and sensor
                verification are not active here.
              </Body>
              <Button
                title="Finish and record outcome"
                disabled={busy || step < steps.length}
                onPress={complete}
              />
            </Card>
          </View>
          <Button
            title="Try simulated positioning guidance"
            kind="secondary"
            onPress={() => router.push("/simulation")}
          />
        </>
      )}
    </Screen>
  );
}
