import type { SqlDriver } from '../db/driver';
import { newUuid, nowIso } from '../domain/ids';
import type { AllowlistedExif, ImageMimeType, ImageRecord } from '../domain/types';

const EMPTY_EXIF: AllowlistedExif = {
  cameraMake: null,
  cameraModel: null,
  lensModel: null,
  focalLengthMm: null,
  apertureF: null,
  exposureTimeS: null,
  iso: null,
};

interface ImageRow {
  id: string;
  owner_id: string | null;
  local_uri: string;
  mime_type: string;
  width_px: number | null;
  height_px: number | null;
  byte_size: number | null;
  sha256: string | null;
  exif: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  purge_after: string | null;
}

function rowToImage(row: ImageRow): ImageRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    localUri: row.local_uri,
    mimeType: row.mime_type as ImageMimeType,
    widthPx: row.width_px,
    heightPx: row.height_px,
    byteSize: row.byte_size,
    sha256: row.sha256,
    exif: JSON.parse(row.exif) as AllowlistedExif,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    purgeAfter: row.purge_after,
  };
}

/**
 * Registers a photograph already written to durable local storage.
 * STATUS: metadata persistence only. There is no cloud upload path in this
 * delivery (images.storage_key/upload_state from DATABASE_SCHEMA.md are
 * intentionally absent) - "optimised cloud images" is explicitly deferred.
 * The caller is responsible for having copied the file to app-owned storage
 * with a temp-file-then-move per OFFLINE_SYNC.md section 4, so a photo is
 * never reported saved before its bytes are durably on disk.
 */
export function registerImage(
  db: SqlDriver,
  input: {
    localUri: string;
    mimeType: ImageMimeType;
    widthPx?: number;
    heightPx?: number;
    byteSize?: number;
    exif?: Partial<AllowlistedExif>;
  },
): ImageRecord {
  const id = newUuid();
  const now = nowIso();
  const exif: AllowlistedExif = { ...EMPTY_EXIF, ...input.exif };
  db.run(
    `INSERT INTO images (id, owner_id, local_uri, mime_type, width_px, height_px, byte_size, sha256, exif, created_at, updated_at, archived_at, deleted_at, purge_after)
     VALUES (?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL)`,
    [
      id,
      input.localUri,
      input.mimeType,
      input.widthPx ?? null,
      input.heightPx ?? null,
      input.byteSize ?? null,
      JSON.stringify(exif),
      now,
      now,
    ],
  );
  return getImage(db, id)!;
}

export function getImage(db: SqlDriver, id: string): ImageRecord | undefined {
  const row = db.get<ImageRow>('SELECT * FROM images WHERE id = ?', [id]);
  return row ? rowToImage(row) : undefined;
}
