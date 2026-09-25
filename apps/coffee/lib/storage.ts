import { getServiceClient } from "./supabase";

export const BUCKET = "coffee-files";

/** What the canvas downscale produces, and all the API accepts. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

export function isImageType(value: string): value is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(value);
}

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").slice(-80);
}

export async function uploadPhoto(filename: string, bytes: Buffer, contentType: string): Promise<string> {
  const path = `bags/${Date.now()}-${safeName(filename)}`;
  const { error } = await getServiceClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new StorageError(`Couldn't store ${filename}: ${error.message}`);
  return path;
}

export async function signedPhotoUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data } = await getServiceClient().storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/**
 * Signed URLs for many photos in one request, keyed by path.
 *
 * The library signs every bag's photo on every load, and one storage round trip
 * per bag grew with the shelf. A path that could not be signed is simply absent
 * from the map, which renders as the placeholder — the same as a bag with no
 * photo, and the one case here where that is honest: the photo is decoration,
 * and the row it belongs to was read.
 */
export async function signedPhotoUrls(paths: string[], seconds = 3600): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data } = await getServiceClient().storage.from(BUCKET).createSignedUrls(paths, seconds);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

/**
 * Remove a bag's photo. Best effort by design: the row is already gone by the
 * time this runs, and a leftover object is a smaller problem than a row
 * pointing at a file that no longer exists.
 */
export async function deletePhoto(path: string): Promise<void> {
  await getServiceClient().storage.from(BUCKET).remove([path]);
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}
