import type { Repository } from "../data/repository";
const urls = new Map<string, string>();
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("lightguide-photos-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error("Photo storage is unavailable."));
  });
}
async function photoStore<T>(
  write: boolean,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction("photos", write ? "readwrite" : "readonly"),
        r = operation(t.objectStore("photos"));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () =>
        reject(new Error("Could not save photo. Check browser storage."));
      t.onabort = () => reject(new Error("Photo save was interrupted."));
    });
  } finally {
    db.close();
  }
}
export async function pickPhoto(
  repo: Repository,
  camera = false,
): Promise<string | null> {
  const file = await new Promise<globalThis.File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    if (camera) input.setAttribute("capture", "environment");
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!file) return null;
  if (
    file.size > 40 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("Choose a JPEG, PNG or WebP photo smaller than 40 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 80000000) {
    bitmap.close();
    throw new Error("Choose a photograph below 80 megapixels.");
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("Could not process this photograph.")),
      "image/jpeg",
      0.82,
    ),
  );
  if (blob.size > 10485760) throw new Error("Optimised photo exceeds 10 MB.");
  const id = crypto.randomUUID(),
    hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  try {
    await photoStore(true, (s) =>
      s.put({ original: file, optimised: blob }, id),
    );
    repo.registerImage({
      id,
      mime_type: "image/jpeg",
      width_px: canvas.width,
      height_px: canvas.height,
      byte_size: blob.size,
      sha256: hash,
      optimised_path: id + ".jpg",
    });
    return id;
  } catch (e) {
    await photoStore(true, (s) => s.delete(id));
    throw e;
  }
}
export async function photoUri(
  repo: Repository,
  id: string,
): Promise<string | null> {
  if (!repo.image(id)) return null;
  if (urls.has(id)) return urls.get(id)!;
  const data = await photoStore(false, (s) => s.get(id));
  if (!data) return null;
  const url = URL.createObjectURL(data.optimised);
  urls.set(id, url);
  return url;
}
export async function removeUnusedPhotos(repo: Repository) {
  for (const i of repo.orphanImages()) {
    repo.markImagePurging(i.id);
    await photoStore(true, (s) => s.delete(i.id));
    const url = urls.get(i.id);
    if (url) URL.revokeObjectURL(url);
    urls.delete(i.id);
    repo.finishImagePurge(i.id);
  }
}
export async function shareNotes(repo: Repository, id: string) {
  const url = URL.createObjectURL(
    new Blob([repo.exportSetup(id)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "lightguide-setup-notes.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
