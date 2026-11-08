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

/**
 * The small attachments row (TEC-250, a local pattern; the Log feed's thumbnails are unchanged): one small **Attach**
 * link with a paperclip. Once tapped it offers Take photo (the camera) or Choose files (anything), inline. Then small
 * thumbnails in a row (a file as a small chip with its type). Tapping one opens a small Open / Remove panel under
 * the row (not a second sheet over the form's own). Each control keeps a 44px hit area; only what is drawn is small.
 * A failed upload stays on screen in red with Retry and ✕, and Save still waits for every one.
 */
const link = "inline-flex min-h-[44px] items-center gap-1.5 px-1 text-[13px] font-semibold text-ink-soft disabled:opacity-60";

export default function PhotoPicker({ photos }: { photos: Photos }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [offer, setOffer] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const full = photos.shots.length >= MAX_PHOTOS;
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    photos.add(e.target.files);
    e.target.value = ""; // the same file can be picked again
    setOffer(false);
  };
  const labelOf = (s: Shot) => s.name ?? (s.path ? attachmentLabel(s.path) : s.source?.name ?? "File");
  const extOf = (s: Shot) => (s.path ? pathExt(s.path) : /\.([A-Za-z0-9]{1,10})$/.exec(s.source?.name ?? "")?.[1]?.toLowerCase()) || "file";
  const chosen = photos.shots.find((s) => s.key === open && s.status === "done") ?? null;
  const failedShots = photos.shots.filter((s) => s.status === "failed");
  return (
    <div role="group" aria-label="Attachments" className="grid gap-1">
      <div className="flex flex-wrap items-center gap-x-2">
        {offer ? (
          <>
            <button type="button" disabled={full} onClick={() => camera.current?.click()} className={`${link} text-ink`}>
              Take photo
            </button>
            <button type="button" disabled={full} onClick={() => library.current?.click()} className={`${link} text-ink`}>
              Choose files
            </button>
            <button type="button" onClick={() => setOffer(false)} aria-label="Cancel attach" className={link}>
              ✕
            </button>
          </>
        ) : (
          <button type="button" disabled={full} onClick={() => setOffer(true)} className={link}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.4 3.4 0 014.8 4.8l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" />
            </svg>
            Attach
          </button>
        )}
        {/* Not inside the buttons: the camera one opens the rear camera on a phone. Choose files takes any file. */}
        <input ref={camera} type="file" accept="image/*" capture="environment" onChange={onFiles} className="hidden" tabIndex={-1} />
        <input ref={library} type="file" multiple onChange={onFiles} className="hidden" tabIndex={-1} />
        {photos.shots.map((s, i) => {
          const label = labelOf(s);
          const failed = s.status === "failed";
          const tile = s.picture ? (
            <span className={`relative block h-9 w-9 overflow-hidden rounded-[7px] border bg-paper ${failed ? "border-danger" : "border-line"}`}>
              {s.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.preview} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-[10px] text-ink-soft">?</span>
              )}
              {s.status === "working" && <span className="absolute inset-0 grid place-items-center bg-bar/60 text-[10px] text-paper">…</span>}
            </span>
          ) : (
            <span className={`flex h-9 max-w-[9rem] items-center gap-1 rounded-lg border bg-surface px-2 text-[13px] text-ink-soft ${failed ? "border-danger" : "border-line"}`}>
              <span className="shrink-0 rounded border border-line px-1 text-[10px] font-bold uppercase tracking-[0.06em]">{extOf(s)}</span>
              <span className="truncate">{label}</span>
              {s.status === "working" && <span className="shrink-0 text-[11px]">…</span>}
            </span>
          );
          return (
            <button
              key={s.key}
              type="button"
              data-attachment={s.picture ? "photo" : "file"}
              onClick={() => (failed ? undefined : setOpen(open === s.key ? null : s.key))}
              disabled={s.status === "working"}
              aria-label={s.picture ? `Photo ${i + 1}: options` : `${label}: options`}
              aria-expanded={open === s.key}
              className="grid min-h-[44px] min-w-[44px] place-items-center disabled:opacity-80"
            >
              {tile}
            </button>
          );
        })}
      </div>
      {chosen && (
        <div role="group" aria-label={`Options for ${labelOf(chosen)}`} className="flex flex-wrap items-center gap-x-1 rounded-[10px] border border-line bg-surface px-2 text-[13px]">
          <span className="mr-auto min-w-0 truncate text-ink-soft">{chosen.picture ? `Photo ${photos.shots.indexOf(chosen) + 1}` : labelOf(chosen)}</span>
          {chosen.preview && (
            <a href={chosen.preview} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(null)} className="grid min-h-[44px] place-items-center px-2 font-semibold underline">
              Open
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              photos.remove(chosen.key);
              setOpen(null);
            }}
            aria-label={chosen.picture ? `Remove photo ${photos.shots.indexOf(chosen) + 1}` : `Remove ${labelOf(chosen)}`}
            className="min-h-[44px] px-2 font-semibold text-danger"
          >
            Remove
          </button>
          <button type="button" onClick={() => setOpen(null)} aria-label="Close options" className="min-h-[44px] px-2 text-ink-soft">
            ✕
          </button>
        </div>
      )}
      {photos.notice && (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {photos.notice}
        </p>
      )}
      {failedShots.map((s) => (
        <div key={s.key} className="flex flex-wrap items-center gap-x-2 text-[13px]">
          <p role="alert" className="min-w-0 flex-1 break-words font-semibold text-danger">
            {labelOf(s)}: not uploaded{s.error ? `: ${s.error}` : ""}
          </p>
          <button type="button" onClick={() => photos.retry(s.key)} className="min-h-[44px] font-medium underline">
            Retry
          </button>
          <button type="button" onClick={() => photos.remove(s.key)} aria-label={`Remove ${labelOf(s)}`} className="min-h-[44px] px-2 text-ink-soft">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
