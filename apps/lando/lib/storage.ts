import type { getServiceClient } from "./supabase";
import { InvalidEvent } from "./events";

/**
 * Health photos (TEC-137): a private Storage bucket, written only here with
 * the service role and shown only through signed URLs. The event stores the
 * path and nothing else. Follows apps/coffee/lib/storage.ts, copied locally.
 */

type SupabaseClient = ReturnType<typeof getServiceClient>;

export const BUCKET = "lando-photos";

/** What the phone's canvas downscale produces (always jpeg), and all the API accepts. */
export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type PhotoType = keyof typeof PHOTO_TYPES;

/** Vercel refuses request bodies over about 4.5MB; a downscaled photo is far under this. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

/**
 * The path an upload is stored at, or an `InvalidEvent` saying why it is
 * refused. The id is the phone's, lowercased, so a retry of one photo is the
 * same object.
 */
export function photoPath(id: unknown, type: unknown, size: number): string {
  if (typeof id !== "string" || !UUID.test(id)) throw new InvalidEvent("a photo needs an id");
  if (typeof type !== "string" || !Object.hasOwn(PHOTO_TYPES, type)) {
    throw new InvalidEvent("a photo must be a jpeg, png or webp");
  }
  if (size <= 0) throw new InvalidEvent("that photo is empty");
  if (size > MAX_PHOTO_BYTES) throw new InvalidEvent("that photo is too big");
  return `health/${id.toLowerCase()}.${PHOTO_TYPES[type as PhotoType]}`;
}

/** Store a photo. `upsert` so a retry after a lost response is the same photo, not an error. */
export async function uploadPhoto(
  db: SupabaseClient,
  path: string,
  bytes: ArrayBuffer | Buffer,
  type: PhotoType
): Promise<void> {
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
  if (error) throw new StorageError(`couldn't store the photo: ${error.message}`);
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
 * that is not there (charter, Never 5): a failed or skipped upload is refused
 * here even if the phone sent the path. A signing failure counts as missing.
 */
export async function missingPhotos(db: SupabaseClient, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const have = await signedPhotoUrls(db, paths, 60);
  return paths.filter((p) => !have.has(p));
}
