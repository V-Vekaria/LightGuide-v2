import * as Picker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Directory, File, Paths } from "expo-file-system";
import { digest, CryptoDigestAlgorithm, randomUUID } from "expo-crypto";
import * as Sharing from "expo-sharing";
import type { Repository } from "../data/repository";

const folder = () => {
  const d = new Directory(Paths.document, "photos");
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};
function photoFile(name: string) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|original)$/.test(name))
    throw new Error("Invalid local photo path");
  return new File(folder(), name);
}
export async function pickPhoto(
  repo: Repository,
  camera = false,
): Promise<string | null> {
  if (camera) {
    const p = await Picker.requestCameraPermissionsAsync();
    if (!p.granted)
      throw new Error(
        "Camera access was declined. You can choose a photo instead.",
      );
  }
  const result = await (
    camera ? Picker.launchCameraAsync : Picker.launchImageLibraryAsync
  )({
    mediaTypes: ["images"],
    quality: 1,
    exif: false,
    allowsMultipleSelection: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error("No photograph was selected.");
  if (!/^(file|content):/.test(asset.uri))
    throw new Error("Only a selected local photograph can be saved.");
  if (
    asset.width * asset.height > 80000000 ||
    (asset.fileSize ?? 0) > 40 * 1024 * 1024
  )
    throw new Error("Choose a photograph smaller than 40 MB / 80 megapixels.");
  const id = randomUUID(),
    original = photoFile(id + ".original");
  const resized = await manipulateAsync(
    asset.uri,
    [
      {
        resize:
          asset.width >= asset.height
            ? { width: Math.min(1600, asset.width) }
            : { height: Math.min(1600, asset.height) },
      },
    ],
    { compress: 0.82, format: SaveFormat.JPEG },
  );
  const tmp = new File(Paths.cache, id + ".jpg"),
    final = photoFile(id + ".jpg");
  try {
    await new File(asset.uri).copy(original);
    await new File(resized.uri).copy(tmp);
    const bytes = await tmp.bytes();
    if (bytes.length > 10485760)
      throw new Error("Optimised photo exceeds 10 MB.");
    const hash = Array.from(
      new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await tmp.move(final);
    repo.registerImage({
      id,
      mime_type: "image/jpeg",
      width_px: resized.width,
      height_px: resized.height,
      byte_size: bytes.length,
      sha256: hash,
      optimised_path: id + ".jpg",
      original_path: id + ".original",
    });
    return id;
  } catch (e) {
    for (const f of [tmp, final, original]) if (f.exists) f.delete();
    throw new Error(
      "Could not save this photo. Please select it again and check that your phone has free storage.",
      { cause: e },
    );
  }
}
export async function photoUri(
  repo: Repository,
  id: string,
): Promise<string | null> {
  const row = repo.image(id);
  if (!row) return null;
  const file = photoFile(row.optimised_path);
  return file.exists ? file.uri : null;
}
export async function removeUnusedPhotos(repo: Repository) {
  for (const i of repo.orphanImages()) {
    repo.markImagePurging(i.id);
    for (const name of [i.optimised_path, i.id + ".original"]) {
      const f = photoFile(name);
      if (f.exists) f.delete();
    }
    repo.finishImagePurge(i.id);
  }
}
export async function shareNotes(repo: Repository, id: string) {
  const file = new File(Paths.cache, "lightguide-setup-notes.json");
  file.write(repo.exportSetup(id));
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing is unavailable on this device.");
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    dialogTitle: "Export setup notes (photos not included)",
  });
}

export async function backupPhoto(
  repo: Repository,
  id: string,
): Promise<string | null> {
  const row = repo.image(id);
  if (!row) return null;
  const f = photoFile(row.optimised_path);
  return f.exists ? f.base64() : null;
}
export async function restorePhoto(
  repo: Repository,
  id: string,
  path: string,
  base64: string,
  hash: string,
) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (bytes.length > 10485760) throw new Error("Backup photo is too large.");
  const actual = Array.from(
    new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (actual !== hash)
    throw new Error("Backup photo failed its integrity check.");
  const f = photoFile(path);
  if (f.exists) {
    const old = Array.from(
      new Uint8Array(
        await digest(CryptoDigestAlgorithm.SHA256, await f.bytes()),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (old !== hash)
      throw new Error(
        "An existing photo has conflicting content. Nothing was replaced.",
      );
    return;
  }
  const temp = new File(Paths.cache, id + ".restore");
  temp.write(bytes);
  temp.move(f);
}
