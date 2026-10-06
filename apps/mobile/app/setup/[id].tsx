import { formatShutter } from "../../src/domain/camera-settings";
import React, { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../../src/ui/Store";
import {
  Badge,
  Body,
  Button,
  Card,
  Confirm,
  ErrorMessage,
  Heading,
  Label,
  Photo,
  Screen,
  useResponsiveColumns,
  s,
} from "../../src/ui/components";
import { humanError } from "../../src/domain/schema";
import { shareNotes, removeUnusedPhotos } from "../../src/media/media";

export default function SetupDetail() {
  const columns = useResponsiveColumns();
  const { repo, refresh } = useStore(),
    { id, conflict } = useLocalSearchParams<{
      id: string;
      conflict?: string;
    }>();
  const [versionId, setVersionId] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [confirm, setConfirm] = useState<"trash" | "purge" | "version" | null>(
      null,
    ),
    [shoot, setShoot] = useState<string | null>(null);
  let setup, scene, version;
  try {
    setup = repo.setup(id);
    version = repo.version(versionId ?? setup.current_version_id);
    scene = repo.scene(version.id);
  } catch (e) {
    return (
      <Screen back title="Setup unavailable.">
        <ErrorMessage message={humanError(e)} />
      </Screen>
    );
  }
  const run = async (fn: () => unknown) => {
    try {
      await fn();
      refresh();
      setError(null);
    } catch (e) {
      setError(humanError(e));
    }
    setConfirm(null);
  };
  const simulated = scene.objects.some((o) => o.device_id === "simulation");
  return (
    <Screen
      back
      title={setup.title}
      subtitle="A saved record of your light, your settings and your result."
    >
      <View style={[s.row, { marginBottom: 20 }]}>
        <Badge>{setup.category}</Badge>
        {repo.isExampleSetup(setup.id) && <Badge>EXAMPLE SETUP · DEMO</Badge>}
        <Badge tone="muted">
          {version.id === setup.current_version_id
            ? "CURRENT VERSION"
            : "HISTORICAL VERSION"}
        </Badge>
        {simulated && <Badge tone="warning">DEMONSTRATION</Badge>}
        {setup.deleted_at && <Badge tone="warning">IN TRASH</Badge>}
      </View>
      <ErrorMessage message={error} />
      {conflict === "1" && (
        <Card>
          <Body>
            Your edit and the newer version were both preserved. Review the
            history and choose which one to use.
          </Body>
        </Card>
      )}
      {setup.deleted_at ? (
        <Card>
          <Heading>
            Restore before {new Date(setup.purge_after!).toLocaleDateString()}
          </Heading>
          <Body muted>
            Permanent deletion removes this setup, all versions and its
            recreation attempts.
          </Body>
          <Button
            title="Restore setup"
            onPress={() => run(() => repo.restore(id))}
          />
          <Button
            title="Permanently delete"
            kind="danger"
            onPress={() => setConfirm("purge")}
          />
        </Card>
      ) : (
        <View style={[s.row, { marginBottom: 24 }]}>
          <Button
            title="Recreate this version"
            onPress={() =>
              run(() => {
                const attempt = repo.startRecreation(version.id, shoot);
                router.push({
                  pathname: "/recreate/[id]",
                  params: { id: attempt },
                });
              })
            }
          />
          <Button
            title="Edit setup"
            kind="secondary"
            onPress={() =>
              router.push({ pathname: "/capture", params: { id } })
            }
          />
          <Button
            title="Add another light"
            kind="secondary"
            onPress={() =>
              router.push({
                pathname: "/capture",
                params: { id, light: repo.id() },
              })
            }
          />
          <Button
            title="Camera settings"
            kind="secondary"
            onPress={() => router.push({ pathname: "/camera", params: { id } })}
          />
          <Button
            title="Export setup notes"
            kind="secondary"
            onPress={() => run(() => shareNotes(repo, id))}
          />
        </View>
      )}
      <View style={columns.split}>
        <View style={columns.column}>
          {scene.images.length > 0 && (
            <Card>
              <View style={s.row}>
                {scene.images.map((i) => (
                  <Photo key={i.image_id} id={i.image_id} label={i.role} />
                ))}
              </View>
            </Card>
          )}
          {scene.objects
            .filter((o) => o.kind === "camera")
            .map((o) => (
              <Card key={o.id}>
                <Label>CAMERA</Label>
                <Body>
                  {o.equipment.map((e) => e.name).join(" · ") ||
                    "Camera not specified"}
                </Body>
                <Body>
                  {o.settings.focal_length_mm ?? "—"} mm · f/
                  {o.settings.aperture_f ?? "—"} ·{" "}
                  {formatShutter(o.settings.exposure_time_s) || "—"} s · ISO{" "}
                  {o.settings.iso ?? "—"}
                </Body>
                <Body muted>{o.notes ?? "No framing notes"}</Body>
              </Card>
            ))}
          <Card>
            <Label>SETUP NOTES</Label>
            <Body>{scene.notes || "No notes added."}</Body>
          </Card>
          {scene.objects
            .filter((o) => o.kind === "light")
            .map((o) => (
              <Card key={o.id}>
                <Label>{o.role ?? "LIGHT"}</Label>
                {!setup.deleted_at && (
                  <Button
                    title={"Edit " + (o.role ?? "light") + " details"}
                    kind="secondary"
                    onPress={() =>
                      router.push({
                        pathname: "/capture",
                        params: { id, light: o.id },
                      })
                    }
                  />
                )}
                <Heading>{o.name ?? "Light settings"}</Heading>
                <Body>Power: {o.settings.power_label ?? "Not recorded"}</Body>
                <Body>
                  Modifier: {o.settings.modifier_description ?? "Not recorded"}
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
                        ? `${Math.round(m.value * (m.unit === "m" ? 100 : 1)) * 1} ${m.unit === "m" ? "cm" : m.unit}`
                        : m.value === null
                          ? "Not recorded"
                          : JSON.stringify(m.value)}{" "}
                      ·{" "}
                      {m.source === "estimate"
                        ? "sample / estimated"
                        : m.source}
                    </Body>
                  ))}
                {o.equipment.map((e, i) => (
                  <Body key={i} muted>
                    {e.kind}: {e.name}
                  </Body>
                ))}
              </Card>
            ))}
        </View>
        <View style={columns.column}>
          <Card>
            <Heading>Version history</Heading>
            <Body muted>
              Previous measurements stay intact. Select a version to inspect it.
            </Body>
            {repo.versions(id).map((v, i) => (
              <Button
                key={v.id}
                kind="secondary"
                title={`${v.id === version.id ? "✓ " : ""}Version ${repo.versions(id).length - i} · ${new Date(v.created_at).toLocaleString()}`}
                onPress={() => setVersionId(v.id)}
              />
            ))}
            {version.id !== setup.current_version_id && !setup.deleted_at && (
              <Button
                title="Make this the current version"
                onPress={() => setConfirm("version")}
              />
            )}
          </Card>
          {!setup.deleted_at && (
            <Card>
              <Heading>Attach recreation to a shoot</Heading>
              <Button
                title={shoot === null ? "✓ No shoot" : "No shoot"}
                kind="secondary"
                onPress={() => setShoot(null)}
              />
              {repo.shoots().map((sh) => (
                <Button
                  key={sh.id}
                  title={(shoot === sh.id ? "✓ " : "") + sh.name}
                  kind="secondary"
                  onPress={() => setShoot(sh.id)}
                />
              ))}
            </Card>
          )}
          <Card>
            <Heading>Recreation history</Heading>
            {repo.recreations(id).length ? (
              repo.recreations(id).map((r) => (
                <View key={r.id} style={{ gap: 8, marginBottom: 12 }}>
                  <Body>
                    {r.outcome?.replaceAll("_", " ") ??
                      r.status.replaceAll("_", " ")}{" "}
                    · {new Date(r.started_at).toLocaleDateString()}
                  </Body>
                  <Button
                    title="View attempt"
                    kind="secondary"
                    onPress={() =>
                      router.push({
                        pathname: "/recreate/[id]",
                        params: { id: r.id },
                      })
                    }
                  />
                </View>
              ))
            ) : (
              <Body muted>No attempts recorded yet.</Body>
            )}
          </Card>
        </View>
      </View>
      {!setup.deleted_at && (
        <Card>
          <View style={s.row}>
            <Button
              title={setup.archived_at ? "Unarchive setup" : "Archive setup"}
              kind="secondary"
              onPress={() => run(() => repo.archive(id, !setup.archived_at))}
            />
            <Button
              title="Move to Trash"
              kind="danger"
              onPress={() => setConfirm("trash")}
            />
          </View>
          <Body muted>
            Archive organises your library. Trash starts a 30-day restore
            period.
          </Body>
        </Card>
      )}
      {confirm && (
        <Confirm
          title={
            confirm === "trash"
              ? "Move setup to Trash?"
              : confirm === "purge"
                ? "Permanently delete this setup?"
                : "Change the current version?"
          }
          message={
            confirm === "purge"
              ? "All versions and associated recreation attempts will be removed. This cannot be undone. Images still used by other setups are retained."
              : confirm === "trash"
                ? "You can restore it for 30 days."
                : "All versions remain available, and existing recreation targets will not change."
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            run(async () => {
              if (confirm === "trash") repo.trash(id);
              else if (confirm === "version")
                repo.chooseVersion(id, version.id, setup.current_version_id);
              else {
                repo.purgeSetup(id);
                await removeUnusedPhotos(repo);
                router.replace({ pathname: "/", params: { tab: "Setups" } });
              }
            })
          }
        />
      )}
    </Screen>
  );
}
