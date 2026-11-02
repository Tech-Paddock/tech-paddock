import type { getServiceClient } from "./supabase";
import { InvalidEvent } from "./events";

/**
 * Attachments (TEC-137 photos, TEC-203 any file): a private Storage bucket, written only here with
 * the service role and shown only through signed URLs. The event stores the
 * path (and a non-picture's original name) and nothing else. Follows apps/coffee/lib/storage.ts, copied locally.
 */

type SupabaseClient = ReturnType<typeof getServiceClient>;

export const BUCKET = "lando-photos";

/** What the phone's canvas downscale produces (always jpeg), plus the other two pictures: they are shown as thumbnails. */
export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type PhotoType = keyof typeof PHOTO_TYPES;

/**
 * Vercel refuses request bodies over about 4.5MB, and the bucket caps an object at 4MB. A downscaled photo is far
 * under this; any other file is held to it as it is, since it cannot be shrunk (TEC-203).
 */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_MB = MAX_PHOTO_BYTES / (1024 * 1024);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

/** A file name's extension for its stored path: 1 to 10 lowercase letters or digits after the last dot, else none. */
export function nameExt(name: unknown): string {
  return typeof name === "string" ? (/\.([A-Za-z0-9]{1,10})$/.exec(name.trim())?.[1].toLowerCase() ?? "") : "";
}

/**
 * The path an upload is stored at, or an `InvalidEvent` saying why it is
 * refused. The id is the phone's, lowercased, so a retry of one file is the
 * same object. A jpeg, png or webp takes its extension from its type; any
 * other file (TEC-203) from its name, or none. Over `MAX_PHOTO_BYTES` is refused with a plain reason.
 */
export function photoPath(id: unknown, type: unknown, size: number, name?: unknown): string {
  if (typeof id !== "string" || !UUID.test(id)) throw new InvalidEvent("an attachment needs an id");
  if (size <= 0) throw new InvalidEvent("that file is empty");
  if (size > MAX_PHOTO_BYTES) throw new InvalidEvent(`that file is over ${MAX_FILE_MB} MB`);
  const ext = typeof type === "string" && Object.hasOwn(PHOTO_TYPES, type) ? PHOTO_TYPES[type as PhotoType] : nameExt(name);
  return `health/${id.toLowerCase()}${ext ? `.${ext}` : ""}`;
}

/**
 * The content type an object is stored with. A file's own type is kept so a PDF opens as a PDF, but a type a browser
 * would run (a web page, a script, an SVG) is stored as plain bytes, so it downloads and never executes.
 */
export function storedContentType(type: unknown): string {
  if (typeof type !== "string" || !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(type)) return "application/octet-stream";
  const t = type.toLowerCase();
  return /html|xml|svg|javascript|ecmascript/.test(t) ? "application/octet-stream" : t;
}

/** A different photo under a stored photo's path: a stored photo never changes (RULES.md, Never 6). */
export class PhotoConflict extends Error {
  constructor(path: string) {
    super(`a different photo is already stored at ${path}`);
    this.name = "PhotoConflict";
  }
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Store a photo, never over another. The upload is `upsert: false`, so the
 * bucket itself refuses a path that holds an object. When it does, the stored
 * bytes are read back: the same bytes are a retry of this photo (the phone
 * re-sends one object after a dropped connection) and a success; different
 * bytes are a `PhotoConflict`. Nothing here deletes or overwrites.
 */
export async function uploadPhoto(
  db: SupabaseClient,
  path: string,
  bytes: ArrayBuffer | Buffer,
  type: string
): Promise<void> {
  const bucket = db.storage.from(BUCKET);
  const { error } = await bucket.upload(path, bytes, { contentType: storedContentType(type), upsert: false });
  if (!error) return;
  const e = error as { statusCode?: string | number; message?: string };
  if (String(e.statusCode) !== "409" && !/already exists|duplicate/i.test(e.message ?? "")) {
    throw new StorageError(`couldn't store the file: ${e.message}`);
  }
  const { data, error: readError } = await bucket.download(path);
  if (readError || !data) throw new StorageError(`couldn't check the stored file: ${readError?.message}`);
  const stored = new Uint8Array(await data.arrayBuffer());
  if (!sameBytes(stored, new Uint8Array(bytes))) throw new PhotoConflict(path);
}

/** Signed URLs for many paths in one request. A path that could not be signed is absent from the map. */
export async function signedPhotoUrls(
  db: SupabaseClient,
  paths: string[],
  seconds = 3600
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, seconds);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

/**
 * The paths with no object behind them. An entry is never saved naming a photo
 * that is not there (RULES.md, Never 5): a failed or skipped upload is refused
 * here even if the phone sent the path. A signing failure counts as missing.
 */
export async function missingPhotos(db: SupabaseClient, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const have = await signedPhotoUrls(db, paths, 60);
  return paths.filter((p) => !have.has(p));
}
