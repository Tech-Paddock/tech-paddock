"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PHOTOS, attachmentLabel, isImagePath, pathExt } from "@/lib/events";
import { downscale } from "@/lib/image";

/**
 * The photos and files on an entry or an upcoming item (TEC-137, any file since TEC-203). A picture is shrunk on
 * the phone; any other file goes up as it is, up to 4 MB, and a bigger one is refused on the form with a plain
 * line. Each is uploaded to `/api/photos` the moment it is picked; the entry holds only the storage paths (and a
 * file's original name). An attachment is one of three things on screen: uploading, failed (with its Retry and
 * ✕, still visible), or done. The form's Save waits for every one to be done, so an entry is never saved without
 * an attachment the person picked (RULES.md, Never 5). Pictures show as thumbnails; other files as a chip with
 * their name, opening through a signed URL. A local pattern (no other app has one).
 */

/** The biggest a file that cannot be shrunk may be: the bucket's limit (Vercel refuses bodies over about 4.5MB). */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Whether a picked file goes through the canvas shrink: a raster picture (not a GIF, which would stop moving, or an SVG). */
export const isShrinkable = (f: Pick<File, "type" | "name">) =>
  /^image\/(jpeg|png|webp|heic|heif|bmp|avif)$/i.test(f.type) || (f.type === "" && /\.(jpe?g|png|webp|heic|heif|bmp|avif)$/i.test(f.name));

/** The line shown when files are over the limit. */
export function tooBigText(names: readonly string[]): string {
  const mb = MAX_FILE_BYTES / (1024 * 1024);
  return names.length === 1
    ? `${names[0]} is over ${mb} MB, so it can't be attached.`
    : `${names.length} files are over ${mb} MB, so they can't be attached: ${names.join(", ")}.`;
}

export type Shot = {
  /** React key: the storage path for a photo the entry already had, else a fresh id. */
  key: string;
  /** What the upload is stored under (`/api/photos` `id`); fixed, so a retry is the same photo. */
  id: string;
  /** Set once the photo is in storage. */
  path: string | null;
  /** A picture: an object URL for one just picked, or a signed URL for one the entry had. A file: its signed URL. Or none. */
  preview: string | null;
  /** Shown as a thumbnail (a jpeg, png or webp); anything else is a chip. */
  picture: boolean;
  /** The original name of a file that is not a picture. */
  name: string | null;
  status: "working" | "failed" | "done";
  error?: string;
  /** Kept so Retry never needs the phone's camera again. */
  source: File | null;
  blob: File | null;
};

export function usePhotos(
  initial: readonly string[],
  initialNames: Record<string, string>,
  urls: Record<string, string>,
  onUrl: (path: string, url: string) => void
) {
  const [shots, setShots] = useState<Shot[]>(() =>
    initial.map((path) => ({
      key: path,
      id: path,
      path,
      preview: urls[path] ?? null,
      picture: isImagePath(path),
      name: initialNames[path] ?? null,
      status: "done" as const,
      source: null,
      blob: null,
    }))
  );
  const [notice, setNotice] = useState<string | null>(null);
  const ref = useRef(shots);
  ref.current = shots;
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const made = objectUrls.current;
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const patch = (key: string, change: Partial<Shot>) =>
    setShots((list) => list.map((s) => (s.key === key ? { ...s, ...change } : s)));

  async function run(key: string) {
    const shot = ref.current.find((s) => s.key === key);
    if (!shot?.source) return;
    patch(key, { status: "working", error: undefined });
    try {
      let file = shot.blob;
      if (!file) {
        if (isShrinkable(shot.source)) {
          try {
            file = await downscale(shot.source);
          } catch (e) {
            // A picture this browser cannot read (a HEIC): kept as a file when it fits, else said plainly.
            if (shot.source.size > MAX_FILE_BYTES) throw new Error(`${(e as Error).message} It is over 4 MB, so it can't be sent as it is.`);
            file = shot.source;
          }
        } else file = shot.source;
        patch(key, { blob: file });
      }
      // Only a jpeg, png or webp is a picture; anything else keeps its name and shows as a chip.
      const picture = /^image\/(jpeg|png|webp)$/.test(file.type);
      const name = picture ? null : shot.source.name;
      const body = new FormData();
      body.set("id", shot.id);
      body.set("file", file);
      body.set("name", shot.source.name);
      const res = await fetch("/api/photos", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onUrl(data.path, data.url);
      patch(key, { status: "done", path: data.path, picture, name, preview: picture ? shot.preview : data.url });
    } catch (e) {
      patch(key, { status: "failed", error: e instanceof TypeError ? "no connection" : (e as Error).message });
    }
  }

  function add(files: FileList | null) {
    if (!files?.length) return;
    setNotice(null);
    const room = MAX_PHOTOS - ref.current.length;
    // A file that cannot be shrunk and is over the limit is refused here, on the form, never silently.
    const all = Array.from(files);
    const tooBig = all.filter((f) => !isShrinkable(f) && f.size > MAX_FILE_BYTES);
    const fits = all.filter((f) => !tooBig.includes(f));
    const picked = fits.slice(0, Math.max(0, room));
    const notes = [
      ...(tooBig.length ? [tooBigText(tooBig.map((f) => f.name))] : []),
      ...(picked.length < fits.length ? [`At most ${MAX_PHOTOS} attachments on one entry.`] : []),
    ];
    if (notes.length) setNotice(notes.join(" "));
    const fresh: Shot[] = picked.map((file) => {
      const picture = isShrinkable(file);
      const preview = picture ? URL.createObjectURL(file) : null;
      if (preview) objectUrls.current.add(preview);
      const id = crypto.randomUUID();
      return { key: id, id, path: null, preview, picture, name: picture ? null : file.name, status: "working", source: file, blob: null };
    });
    if (!fresh.length) return;
    ref.current = [...ref.current, ...fresh];
    setShots(ref.current);
    for (const s of fresh) void run(s.key);
  }

  function remove(key: string) {
    const shot = ref.current.find((s) => s.key === key);
    if (shot?.preview && objectUrls.current.delete(shot.preview)) URL.revokeObjectURL(shot.preview);
    setShots((list) => list.filter((s) => s.key !== key));
    setNotice(null);
  }

  return {
    shots,
    notice,
    add,
    retry: (key: string) => void run(key),
    remove,
    working: shots.some((s) => s.status === "working"),
    failed: shots.some((s) => s.status === "failed"),
    /** The paths of the attachments that are in storage, in the order shown. */
    paths: shots.flatMap((s) => (s.status === "done" && s.path ? [s.path] : [])),
    /** The original name of each stored file that is not a picture, by its path. */
    names: Object.fromEntries(shots.flatMap((s) => (s.status === "done" && s.path && !s.picture && s.name ? [[s.path, s.name]] : []))) as Record<string, string>,
  };
}

type Photos = ReturnType<typeof usePhotos>;

const pick =
  "min-h-[44px] flex-1 rounded-[10px] border border-line bg-surface px-3 py-2 font-medium active:translate-y-px";

export default function PhotoPicker({ photos }: { photos: Photos }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const full = photos.shots.length >= MAX_PHOTOS;
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    photos.add(e.target.files);
    e.target.value = ""; // the same file can be picked again
  };
  const pictures = photos.shots.filter((s) => s.picture);
  const files = photos.shots.filter((s) => !s.picture);
  const item = (s: Shot, i: number) => {
            const label = s.name ?? (s.path ? attachmentLabel(s.path) : s.source?.name ?? "File");
            const ext = (s.path ? pathExt(s.path) : /\.([A-Za-z0-9]{1,10})$/.exec(s.source?.name ?? "")?.[1]?.toLowerCase()) || "file";
            const retryBar = (
              <>
                <p role="alert" className="break-words text-[12px] font-semibold text-danger">
                  Not uploaded{s.error ? `: ${s.error}` : ""}
                </p>
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => photos.retry(s.key)} className="min-h-[44px] font-medium underline">
                    Retry
                  </button>
                  <button type="button" onClick={() => photos.remove(s.key)} aria-label={s.picture ? `Remove photo ${i + 1}` : `Remove ${label}`} className="min-h-[44px] px-2 text-ink-soft">
                    ✕
                  </button>
                </div>
              </>
            );
            if (!s.picture) {
              // A file that is not a picture: a chip with its name and type, opening through its signed URL.
              return (
                <li key={s.key} data-attachment="file" className="min-w-0 space-y-1">
                  <div className={`flex min-h-[44px] items-center gap-2 rounded-[10px] border bg-surface px-2.5 ${s.status === "failed" ? "border-danger" : "border-line"}`}>
                    <span className="shrink-0 rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{ext}</span>
                    {s.status === "done" && s.preview ? (
                      <a href={s.preview} target="_blank" rel="noopener noreferrer" title={label} className="min-w-0 flex-1 truncate font-medium underline">
                        {label}
                      </a>
                    ) : (
                      <span title={label} className="min-w-0 flex-1 truncate">
                        {label}
                      </span>
                    )}
                    {s.status === "working" && <span className="shrink-0 text-[12px] text-ink-soft">Uploading…</span>}
                    {s.status !== "failed" && (
                      <button type="button" onClick={() => photos.remove(s.key)} aria-label={`Remove ${label}`} className="min-h-[44px] shrink-0 px-2 text-[13px] text-ink-soft">
                        Remove
                      </button>
                    )}
                  </div>
                  {s.status === "failed" && retryBar}
                </li>
              );
            }
            return (
              <li key={s.key} data-attachment="photo" className="grid min-w-0 content-start gap-1">
                <div
                  className={`relative aspect-square overflow-hidden rounded-[10px] border bg-paper ${
                    s.status === "failed" ? "border-danger" : "border-line"
                  }`}
                >
                  {s.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.preview} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center px-1 text-center text-[12px] text-ink-soft">Photo unavailable</span>
                  )}
                  {s.status === "working" && (
                    <span className="absolute inset-x-0 bottom-0 bg-bar/70 px-1 py-0.5 text-center text-[12px] text-paper">Uploading…</span>
                  )}
                </div>
                {s.status === "failed" ? (
                  retryBar
                ) : (
                  <button
                    type="button"
                    onClick={() => photos.remove(s.key)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="min-h-[44px] self-start px-2 text-[13px] text-ink-soft"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
  };
  return (
    <div className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.06em] text-ink-soft">Attachments</span>
      <div className="flex gap-2">
        <button type="button" disabled={full} onClick={() => camera.current?.click()} className={`${pick} disabled:opacity-60`}>
          Take photo
        </button>
        <button type="button" disabled={full} onClick={() => library.current?.click()} className={`${pick} disabled:opacity-60`}>
          Attach
        </button>
        {/* Not inside the buttons: the camera one opens the rear camera on a phone. Attach takes any file. */}
        <input ref={camera} type="file" accept="image/*" capture="environment" onChange={onFiles} className="hidden" tabIndex={-1} />
        <input ref={library} type="file" multiple onChange={onFiles} className="hidden" tabIndex={-1} />
      </div>
      {photos.notice && (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {photos.notice}
        </p>
      )}
      {photos.shots.length > 0 && (
        <>
          {/* Pictures as thumbnails, then files as chips, so a file never leaves a gap in the thumbnail rows. */}
          {pictures.length > 0 && (
            <ul aria-label="Photos on this entry" className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
              {pictures.map(item)}
            </ul>
          )}
          {files.length > 0 && (
            <ul aria-label="Files on this entry" className="grid gap-2">
              {files.map(item)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
