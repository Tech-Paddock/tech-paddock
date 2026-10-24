"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PHOTOS } from "@/lib/events";
import { downscale } from "@/lib/image";

/**
 * The photos on a Health entry (TEC-137). Each is shrunk on the phone, then
 * uploaded to `/api/photos` the moment it is picked; the entry holds only the
 * storage paths. A photo is one of three things on screen: uploading, failed
 * (with its Retry and ✕, still visible), or done. The form's Save waits for
 * every photo to be done, so an entry is never saved without a photo the
 * person picked (charter, Never 5). A local pattern (no other app has one).
 */

export type Shot = {
  /** React key: the storage path for a photo the entry already had, else a fresh id. */
  key: string;
  /** What the upload is stored under (`/api/photos` `id`); fixed, so a retry is the same photo. */
  id: string;
  /** Set once the photo is in storage. */
  path: string | null;
  /** An object URL for one just picked, a signed URL for one the entry had, or none. */
  preview: string | null;
  status: "working" | "failed" | "done";
  error?: string;
  /** Kept so Retry never needs the phone's camera again. */
  source: File | null;
  blob: File | null;
};

export function usePhotos(initial: readonly string[], urls: Record<string, string>, onUrl: (path: string, url: string) => void) {
  const [shots, setShots] = useState<Shot[]>(() =>
    initial.map((path) => ({
      key: path,
      id: path,
      path,
      preview: urls[path] ?? null,
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
      const file = shot.blob ?? (await downscale(shot.source));
      if (!shot.blob) patch(key, { blob: file });
      const body = new FormData();
      body.set("id", shot.id);
      body.set("file", file);
      const res = await fetch("/api/photos", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onUrl(data.path, data.url);
      patch(key, { status: "done", path: data.path });
    } catch (e) {
      patch(key, { status: "failed", error: e instanceof TypeError ? "no connection" : (e as Error).message });
    }
  }

  function add(files: FileList | null) {
    if (!files?.length) return;
    setNotice(null);
    const room = MAX_PHOTOS - ref.current.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (picked.length < files.length) setNotice(`At most ${MAX_PHOTOS} photos on one entry.`);
    const fresh: Shot[] = picked.map((file) => {
      const preview = URL.createObjectURL(file);
      objectUrls.current.add(preview);
      const id = crypto.randomUUID();
      return { key: id, id, path: null, preview, status: "working", source: file, blob: null };
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
    /** The paths of the photos that are in storage, in the order shown. */
    paths: shots.flatMap((s) => (s.status === "done" && s.path ? [s.path] : [])),
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
    e.target.value = ""; // the same photo can be picked again
  };
  return (
    <div className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.06em] text-ink-soft">Photos</span>
      <div className="flex gap-2">
        <button type="button" disabled={full} onClick={() => camera.current?.click()} className={`${pick} disabled:opacity-60`}>
          Take photo
        </button>
        <button type="button" disabled={full} onClick={() => library.current?.click()} className={`${pick} disabled:opacity-60`}>
          Choose photos
        </button>
        {/* Not inside the buttons: the camera one opens the rear camera on a phone. */}
        <input ref={camera} type="file" accept="image/*" capture="environment" onChange={onFiles} className="hidden" tabIndex={-1} />
        <input ref={library} type="file" accept="image/*" multiple onChange={onFiles} className="hidden" tabIndex={-1} />
      </div>
      {photos.notice && <p className="text-[13px] text-ink-soft">{photos.notice}</p>}
      {photos.shots.length > 0 && (
        <ul aria-label="Photos on this entry" className="grid grid-cols-3 gap-2">
          {photos.shots.map((s, i) => (
            <li key={s.key} className="grid min-w-0 content-start gap-1">
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
                <>
                  <p role="alert" className="break-words text-[12px] font-semibold text-danger">
                    Not uploaded{s.error ? `: ${s.error}` : ""}
                  </p>
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => photos.retry(s.key)} className="min-h-[44px] font-medium underline">
                      Retry
                    </button>
                    <button type="button" onClick={() => photos.remove(s.key)} aria-label={`Remove photo ${i + 1}`} className="min-h-[44px] px-2 text-ink-soft">
                      ✕
                    </button>
                  </div>
                </>
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
          ))}
        </ul>
      )}
    </div>
  );
}
