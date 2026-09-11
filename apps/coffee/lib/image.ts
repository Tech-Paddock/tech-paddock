/**
 * Downscale a photo in the browser before it is uploaded.
 *
 * Three problems, one fix: an iPhone shot is 3-5MB of HEIC, the Anthropic API
 * accepts only jpeg/png/webp/gif, and Vercel rejects request bodies over about
 * 4.5MB with an opaque error. Re-encoding through a canvas solves all three,
 * and 1568px on the long edge is Claude's optimal image size — larger is
 * downscaled server-side anyway, so this costs no accuracy.
 */
const MAX_EDGE = 1568;
const QUALITY = 0.85;

export async function downscale(file: File): Promise<File> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap handles HEIC wherever the browser can decode it at all,
  // and is the fast path. Safari has historically needed the <img> fallback.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("That file isn't an image this browser can read."));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
