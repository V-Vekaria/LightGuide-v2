import React, { useState } from "react";
import { router } from "expo-router";
import {
  Body,
  Button,
  Card,
  Confirm,
  ErrorMessage,
  Heading,
  Screen,
} from "../src/ui/components";
import { useStore } from "../src/ui/Store";
import {
  exportRecords,
  parseBackup,
  restoreRecords,
  type Backup,
} from "../src/data/backup";
import { backupPhoto, restorePhoto } from "../src/media/media";
import { chooseBackup, shareBackup } from "../src/media/backup-files";
import { humanError } from "../src/domain/schema";
export default function BackupScreen() {
  const { repo, refresh } = useStore(),
    [pending, setPending] = useState<Backup | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      back
      title="Backup and restore"
      subtitle="Keep a copy outside this phone."
    >
      <ErrorMessage message={error} />
      <Card>
        <Heading>Your workspace and photos</Heading>
        <Body>
          Includes setups, versions, shoots, equipment, attempts, drafts and
          saved optimised photos. Original camera-resolution files are not
          included.
        </Body>
        <Body muted>
          Store the backup somewhere private. Anyone with the file can read its
          contents. Backups from the browser design prototype use a different
          format.
        </Body>
        <Button
          title="Export backup"
          disabled={busy}
          onPress={() =>
            run(async () => {
              const b = exportRecords(repo);
              let size = 0;
              for (const image of b.tables.images!) {
                const photo = await backupPhoto(repo, String(image.id));
                if (!photo)
                  throw new Error(
                    "A saved photograph is missing. Restore access to it before exporting a complete backup.",
                  );
                size += photo.length;
                if (size > 60 * 1024 * 1024)
                  throw new Error("Photos exceed the 60 MB backup limit.");
                b.photos[String(image.id)] = photo;
              }
              await shareBackup(JSON.stringify(b));
              setNotice("Backup prepared. Use the share sheet to save a copy.");
            })
          }
        />
      </Card>
      <Card>
        <Heading>Restore a backup</Heading>
        <Body>
          This replaces the local workspace. Export your current workspace
          first. You can review the backup before confirming.
        </Body>
        <Button
          title="Choose backup file"
          kind="secondary"
          disabled={busy}
          onPress={() =>
            run(async () => {
              const text = await chooseBackup();
              if (text) setPending(parseBackup(text));
            })
          }
        />
      </Card>
      {notice && <Body>{notice}</Body>}
      {pending && (
        <Confirm
          title="Replace this workspace?"
          message={`${pending.tables.setups!.length} setups, ${pending.tables.shoots!.length} shoots and ${Object.keys(pending.photos).length} photos will replace the current data.`}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const b = pending;
            setPending(null);
            run(async () => {
              for (const im of b.tables.images!) {
                const data = b.photos[String(im.id)],
                  media = b.tables.local_media!.find(
                    (m) => m.image_id === im.id,
                  );
                if (!data || !media)
                  throw new Error("Backup is missing a saved photograph.");
                await restorePhoto(
                  repo,
                  String(im.id),
                  String(media.optimised_path),
                  data,
                  String(im.sha256),
                );
              }
              restoreRecords(repo, b);
              refresh();
              router.replace("/");
            });
          }}
        />
      )}
    </Screen>
  );
}
