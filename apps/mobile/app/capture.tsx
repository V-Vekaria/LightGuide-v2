import React, { useState, useRef } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../src/ui/Store";
import {
  Badge,
  Body,
  Button,
  Card,
  Choice,
  Confirm,
  ErrorMessage,
  Field,
  Heading,
  Label,
  Photo,
  Screen,
  useResponsiveColumns,
  s,
} from "../src/ui/components";
import {
  blankDraft,
  draftFromScene,
  sceneFromDraft,
} from "../src/domain/capture";
import { emptyScene, humanError, type Scene } from "../src/domain/schema";
import type { CaptureDraft } from "../src/data/repository";
import { pickPhoto } from "../src/media/media";

export default function Capture() {
  const columns = useResponsiveColumns();
  const { repo, refresh } = useStore(),
    { id, light } = useLocalSearchParams<{ id?: string; light?: string }>();
  const key = id ? "capture:" + id + (light ? ":" + light : "") : "capture:new";
  const [initial] = useState(() => {
    try {
      const saved = id ? repo.setup(id) : null,
        draft = repo.draft(key),
        baseVersion = draft?.baseVersion ?? saved?.current_version_id ?? null,
        base = baseVersion ? repo.scene(baseVersion) : emptyScene();
      return {
        base,
        baseVersion,
        data:
          draft?.data ??
          (saved
            ? draftFromScene(saved.title, saved.category, base, light)
            : { ...blankDraft, images: [], equipmentIds: [] }),
        error: null,
      };
    } catch (e) {
      return {
        base: emptyScene(),
        baseVersion: null,
        data: { ...blankDraft },
        error: humanError(e),
      };
    }
  });
  const [form, setForm] = useState<CaptureDraft>(initial.data),
    [error, setError] = useState<string | null>(initial.error),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [discard, setDiscard] = useState(false),
    [precision, setPrecision] = useState(
      Boolean(initial.data.distance || initial.data.height),
    );
  const [showCamera, setShowCamera] = useState(Boolean(form.camera));
  const cameraFields = form.camera ?? {
    focal: "",
    aperture: "",
    shutter: "",
    iso: "",
    equipmentIds: [],
  };
  const setCamera = (patch: Partial<NonNullable<CaptureDraft["camera"]>>) =>
    change({ ...form, camera: { ...cameraFields, ...patch } });
  const currentForm = useRef(form);
  currentForm.current = form;
  const change = (next: CaptureDraft) => {
    currentForm.current = next;
    setForm(next);
    try {
      repo.saveDraft(key, next, id ?? null, initial.baseVersion);
      setError(null);
      setSaved(true);
    } catch (e) {
      setError(humanError(e));
      setSaved(false);
    }
  };
  const photo = async (
    role: Scene["images"][number]["role"],
    camera = false,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const imageId = await pickPhoto(repo, camera);
      if (imageId)
        change({
          ...currentForm.current,
          images: [
            ...currentForm.current.images,
            { image_id: imageId, role, object_id: null },
          ],
        });
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };
  const publish = () => {
    setBusy(true);
    try {
      if (initial.error) throw new Error(initial.error);
      const result = repo.publish({
        id,
        baseVersion: initial.baseVersion ?? undefined,
        title: form.title,
        category: form.category,
        scene: sceneFromDraft(form, repo, initial.base, light),
        draftKey: key,
      });
      refresh();
      router.replace({
        pathname: "/setup/[id]",
        params: { id: result.id, conflict: result.conflict ? "1" : undefined },
      });
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      back
      title={
        id ? "Keep the original. Save a new take." : "Remember this lighting."
      }
      subtitle="Start with a name. Add photographs and the details that will help you recreate it."
    >
      <ErrorMessage message={error} />
      <View style={[s.row, { marginBottom: 20 }]}>
        <Badge>LOCAL CAPTURE</Badge>
        {saved && <Body muted>Draft saved on this device</Body>}
      </View>
      <View style={columns.split}>
        <View style={columns.column}>
          <Card>
            <Label>01 / THE SETUP</Label>
            <Field
              label="Setup name"
              value={form.title}
              onChange={(title) => change({ ...form, title })}
              placeholder="Window-style portrait"
            />
            <Choice
              options={["portrait", "product"] as const}
              value={form.category}
              onChange={(category) => change({ ...form, category })}
            />
            <Field
              label="Setup notes"
              value={form.notes}
              multiline
              onChange={(notes) => change({ ...form, notes })}
              placeholder="What made this setup work?"
            />
          </Card>
          <Card>
            <Label>02 / PHOTOGRAPHS</Label>
            <Heading>Keep the result and the room.</Heading>
            <Body muted>
              Photos are stored locally. No image is sent to an AI service.
            </Body>
            <View style={s.row}>
              <Button
                title="Add result photo"
                kind="secondary"
                disabled={busy}
                onPress={() => photo("result")}
              />
              <Button
                title="Add setup photo"
                kind="secondary"
                disabled={busy}
                onPress={() => photo("setup")}
              />
              <Button
                title="Take setup photo"
                kind="secondary"
                disabled={busy}
                onPress={() => photo("setup", true)}
              />
            </View>
            {form.images.map((im) => (
              <View key={im.image_id} style={{ gap: 8 }}>
                <Photo id={im.image_id} label={im.role} />
                <Button
                  title="Remove photo from this draft"
                  kind="secondary"
                  onPress={() =>
                    change({
                      ...form,
                      images: form.images.filter(
                        (i) => i.image_id !== im.image_id,
                      ),
                    })
                  }
                />
              </View>
            ))}
          </Card>
        </View>
        <View style={columns.column}>
          <Card>
            <Label>03 / LIGHT DETAILS</Label>
            <Field
              label="Light role"
              value={form.role}
              onChange={(role) => change({ ...form, role })}
            />
            <Field
              label="Power (optional)"
              value={form.power}
              onChange={(power) => change({ ...form, power })}
              placeholder="1/16 or 25%"
            />
            <Field
              label="Modifier (optional)"
              value={form.modifier}
              onChange={(modifier) => change({ ...form, modifier })}
              placeholder="Large softbox"
            />
            <Button
              title={
                precision ? "Hide measurements" : "Add manual measurements"
              }
              kind="secondary"
              onPress={() => setPrecision((v) => !v)}
            />
            {precision && (
              <>
                <Body muted>
                  Use the same points every time: measure height to the light's
                  centre above the floor, and distance from the modifier's front
                  centre to your chosen point on the subject. Record that
                  subject point and any floor marks in setup notes. These are
                  manual readings.
                </Body>
                <Field
                  label="Distance to subject (cm)"
                  numeric
                  value={form.distance}
                  onChange={(distance) => change({ ...form, distance })}
                />
                <Field
                  label="Light height above floor (cm)"
                  numeric
                  value={form.height}
                  onChange={(height) => change({ ...form, height })}
                />
              </>
            )}
          </Card>
          <Card>
            <Button
              title={
                showCamera
                  ? "Hide camera settings"
                  : "Add camera settings (optional)"
              }
              kind="secondary"
              onPress={() => setShowCamera((v) => !v)}
            />
            {showCamera && (
              <>
                <Body muted>
                  Save these with the setup. Leave unknown settings blank.
                </Body>
                <Field
                  label="Focal length (mm)"
                  numeric
                  value={cameraFields.focal}
                  onChange={(focal) => setCamera({ focal })}
                />
                <Field
                  label="Aperture (f-number)"
                  numeric
                  value={cameraFields.aperture}
                  onChange={(aperture) => setCamera({ aperture })}
                />
                <Field
                  label="Shutter speed"
                  value={cameraFields.shutter}
                  placeholder="1/200 or 0.005 seconds"
                  onChange={(shutter) => setCamera({ shutter })}
                />
                <View style={s.row}>
                  {["1/60", "1/125", "1/200", "1/250"].map((shutter) => (
                    <Button
                      key={shutter}
                      title={shutter}
                      kind="secondary"
                      onPress={() => setCamera({ shutter })}
                    />
                  ))}
                </View>
                <Field
                  label="ISO"
                  numeric
                  value={cameraFields.iso}
                  onChange={(iso) => setCamera({ iso })}
                />
                <Body muted>Camera and lens used</Body>
                {repo
                  .equipment()
                  .filter((e) => ["camera", "lens"].includes(e.kind))
                  .map((e) => (
                    <Button
                      key={e.id}
                      kind="secondary"
                      title={
                        (cameraFields.equipmentIds.includes(e.id)
                          ? "✓ "
                          : "＋ ") + e.name
                      }
                      onPress={() =>
                        setCamera({
                          equipmentIds: cameraFields.equipmentIds.includes(e.id)
                            ? cameraFields.equipmentIds.filter(
                                (id) => id !== e.id,
                              )
                            : [...cameraFields.equipmentIds, e.id],
                        })
                      }
                    />
                  ))}
              </>
            )}
          </Card>
          <Card>
            <Heading>Equipment used</Heading>
            <Button
              title="Add equipment without leaving this draft"
              kind="secondary"
              onPress={() =>
                router.push({
                  pathname: "/equipment",
                  params: { returnToCapture: "1" },
                })
              }
            />
            {repo.equipment().length ? (
              repo.equipment().map((e) => (
                <Button
                  key={e.id}
                  kind="secondary"
                  title={
                    (form.equipmentIds.includes(e.id) ? "✓ " : "＋ ") + e.name
                  }
                  onPress={() =>
                    change({
                      ...form,
                      equipmentIds: form.equipmentIds.includes(e.id)
                        ? form.equipmentIds.filter((i) => i !== e.id)
                        : [...form.equipmentIds, e.id],
                    })
                  }
                />
              ))
            ) : (
              <Body muted>
                You can add equipment later. It will not block saving.
              </Body>
            )}
          </Card>
        </View>
      </View>
      <Button
        title={busy ? "Saving…" : id ? "Save new version" : "Save setup"}
        disabled={busy || Boolean(initial.error)}
        onPress={publish}
      />
      <View style={{ height: 12 }} />
      <Button
        title="Discard draft"
        kind="secondary"
        disabled={busy}
        onPress={() => setDiscard(true)}
      />
      {discard && (
        <Confirm
          title="Discard this draft?"
          message="The unsaved changes will be removed. Previously saved versions stay intact."
          onCancel={() => setDiscard(false)}
          onConfirm={() => {
            repo.discardDraft(key);
            refresh();
            router.replace("/");
          }}
        />
      )}
    </Screen>
  );
}
