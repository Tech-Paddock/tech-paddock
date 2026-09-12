import { getServiceClient } from "./supabase";

export const BUCKET = "coffee-files";

/** What the canvas downscale produces, and all the API accepts. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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
