import { getServiceClient } from "./supabase";

export const BUCKET = "resume-files";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Slugify for a storage key: Supabase object paths dislike spaces and unicode. */
function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").slice(-80);
}

export async function uploadDocx(prefix: string, filename: string, bytes: Buffer): Promise<string> {
  const path = `${prefix}/${Date.now()}-${safeName(filename)}`;
  const { error } = await getServiceClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: DOCX_TYPE, upsert: false });
  if (error) throw new StorageError(`Couldn't store ${filename}: ${error.message}`);
  return path;
}

export async function downloadDocx(path: string): Promise<Buffer> {
  const { data, error } = await getServiceClient().storage.from(BUCKET).download(path);
  if (error || !data) throw new StorageError(`Couldn't read ${path}: ${error?.message ?? "not found"}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Remove a stored object. Used only when deleting a template that no render
 *  references — the row goes first, so a failure here leaves an orphaned object
 *  rather than a row pointing at bytes that are gone. An orphan costs storage; a
 *  dangling row breaks the download. */
export async function removeDocx(path: string): Promise<void> {
  const { error } = await getServiceClient().storage.from(BUCKET).remove([path]);
  if (error) throw new StorageError(`Couldn't remove ${path}: ${error.message}`);
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}
