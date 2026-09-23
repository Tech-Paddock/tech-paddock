/**
 * What a recipe file has to be before a model is shown it.
 *
 * **The fourth way in, added 2026-09-22 on Joel's word ("missing from a file").**
 * A photo of a card, a screenshot, a scanned page or a PDF. It follows the rules
 * the link path already follows, for the same reasons:
 *
 * - **The recipe is kept and nothing else.** A nutrition panel in the photo is
 *   ignored and the macros are estimated here, so an imported recipe reads
 *   `estimate` whichever way it came in.
 * - **Illegible is refused, not guessed**, and that is enforced twice. See
 *   `readRecipeFile` in `lib/anthropic.ts`.
 * - **The file is never stored.** It travels in the draft request and is gone
 *   when that request ends. No bucket, no column, and so no photo of someone's
 *   handwriting sitting in a database that was never designed to hold one.
 *
 * **The size cap is Vercel's, not a preference.** A serverless function refuses
 * a request body over 4.5 MB, and base64 costs a third on top, so 3 MB of file
 * is what fits with room for the rest of the JSON. The browser shrinks photos
 * well under that before they are sent (`app/Book.tsx`), so in practice this
 * only bites on a large PDF, and it says so.
 */

export const FILE_TYPES = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "document",
} as const;

export type FileMediaType = keyof typeof FILE_TYPES;

export const MAX_FILE_BYTES = 3 * 1024 * 1024;

export type RecipeFile = { mediaType: FileMediaType; data: string };

/** Decoded size of a base64 string, without decoding it. */
export function base64Bytes(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

export function isFileMediaType(value: unknown): value is FileMediaType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FILE_TYPES, value);
}

/**
 * The server's own check, because the browser's is a convenience. Returns the
 * file or a sentence saying what is wrong with it.
 */
export function validateRecipeFile(raw: unknown): { file: RecipeFile } | { error: string } {
  const o = (raw ?? {}) as { mediaType?: unknown; data?: unknown };

  if (!isFileMediaType(o.mediaType)) {
    return { error: "That kind of file can't be read. Use a photo (JPEG, PNG, WebP) or a PDF." };
  }
  if (typeof o.data !== "string" || o.data.length === 0) {
    return { error: "The file arrived empty." };
  }
  // Strict base64 only. A data: URL prefix or stray whitespace is the browser
  // half getting it wrong, and the model API would reject it less helpfully.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(o.data)) {
    return { error: "The file arrived garbled. Try choosing it again." };
  }
  if (base64Bytes(o.data) > MAX_FILE_BYTES) {
    return { error: "That file is over 3 MB. A photo of the page, or a shorter PDF, will fit." };
  }
  return { file: { mediaType: o.mediaType, data: o.data } };
}
