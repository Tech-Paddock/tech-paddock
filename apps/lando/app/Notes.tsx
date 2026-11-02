"use client";

import { useState } from "react";
import { attachmentLabel, eventNames, eventPhotos, isImagePath, pathExt, type JournalEvent } from "@/lib/events";
import { mayOverflow, noteText } from "@/lib/notes";
import { toLocalInput, whenLabel } from "@/lib/localtime";
import type { LogBody } from "./LogForm";

/** A note on its way to the database, or one that did not get there (the Journal's pending list, notes only). */
export type PendingNote = { body: LogBody; status: "saving" | "failed"; error?: string };

type Props = {
  /** Live notes, newest first (`liveNotes`). */
  notes: JournalEvent[];
  pending: PendingNote[];
  /** Whether the journal has been read; before it, the list says so rather than "No notes". */
  loaded: boolean;
  loadError: string | null;
  now: Date;
  nameOf: (id: string | null) => string | null;
  /** Signed URLs by storage path. */
  photoUrls: Record<string, string>;
  onAdd: () => void;
  /** Opens a note to correct or delete it. */
  onEdit: (note: JournalEvent) => void;
  onRetry: (body: LogBody) => void;
  onDiscard: (id: string) => void;
};

const chip = "flex min-h-[44px] min-w-0 max-w-full items-center gap-2 rounded-[10px] border border-line bg-paper px-2.5";

/**
 * The attachments of a note, in the list. A picture is a thumbnail that opens the full picture; any other file is
 * a chip with its type and name that opens the file. Each is an `<a>` on a signed URL, kept beside the note's
 * buttons rather than inside them, because a link can't sit inside a button (TEC-204). One whose URL could not be
 * signed says so instead of looking like a link.
 */
function Attachments({ note, photoUrls }: { note: JournalEvent; photoUrls: Record<string, string> }) {
  const paths = eventPhotos(note);
  const names = eventNames(note);
  if (!paths.length) return null;
  const pictures = paths.filter(isImagePath);
  const files = paths.filter((p) => !isImagePath(p));
  return (
    <div className="mt-2 grid gap-1.5">
      {pictures.length > 0 && (
        <ul aria-label="Photos on this note" className="flex flex-wrap gap-1.5">
          {pictures.map((path, i) => (
            <li key={path}>
              {photoUrls[path] ? (
                <a href={photoUrls[path]} target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${i + 1}`} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrls[path]} alt={`Photo ${i + 1}`} loading="lazy" className="h-16 w-16 rounded-[10px] border border-line object-cover" />
                </a>
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-[10px] border border-line px-1 text-center text-[11px] leading-tight text-ink-soft">Photo unavailable</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul aria-label="Files on this note" className="grid gap-1.5">
          {files.map((path) => {
            const label = attachmentLabel(path, names);
            const ext = pathExt(path) || "file";
            return (
              <li key={path} data-attachment="file" className="min-w-0">
                {photoUrls[path] ? (
                  <a href={photoUrls[path]} target="_blank" rel="noopener noreferrer" title={label} className={chip}>
                    <span className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{ext}</span>
                    <span className="min-w-0 flex-1 truncate font-medium underline">{label}</span>
                  </a>
                ) : (
                  <span title={label} className={chip}>
                    <span className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{ext}</span>
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <span className="shrink-0 text-[12px] text-ink-soft">unavailable</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A note's words: two lines, and a tap on them opens the rest (a second tap closes it). */
function NoteText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = mayOverflow(text);
  const words = <p className={`whitespace-pre-wrap break-words ${open || !long ? "" : "line-clamp-2"}`}>{text}</p>;
  if (!long) return words;
  return (
    <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="block min-h-[44px] w-full py-1 text-left">
      {words}
      <span className="mt-0.5 block text-[12px] font-semibold text-ink-soft">{open ? "Show less" : "Tap to read all"}</span>
    </button>
  );
}

/**
 * The Notes tab (TEC-204): an Add note button, then every note, newest first. Each shows when it is dated and who
 * wrote it, its text clamped to two lines (tap to expand), its attachments, and an Edit button that opens the
 * note to correct or delete it. There is no search. Notes that are still saving, or that did not save, sit above
 * the list with their Retry, as an entry does in the Log feed (RULES.md, Never 5).
 */
export default function Notes({ notes, pending, loaded, loadError, now, nameOf, photoUrls, onAdd, onEdit, onRetry, onDiscard }: Props) {
  const when = (iso: string) => whenLabel(toLocalInput(iso), now);
  const empty = loaded && notes.length === 0 && pending.length === 0;
  return (
    <section aria-label="Notes" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onAdd}
        className="flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--tone-2-bg)] px-3 py-1 text-[15px] font-bold text-[var(--tone-2-ink)] shadow-[0_3px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--tone-2-lip)]"
      >
        Add note
      </button>

      {!loaded && <p className="text-ink-soft">{loadError ? "" : "Loading…"}</p>}
      {empty && <p className="text-ink-soft">No notes yet. Tap Add note to keep one.</p>}

      <ul className="flex flex-col gap-1.5">
        {pending.map((p) => (
          <li key={p.body.id} data-note="pending" className="rounded-xl border border-dashed border-line bg-surface px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="tabular-nums text-ink-soft">{when(p.body.at)}</span>
              {p.status === "saving" ? (
                <span className="text-ink-soft">Saving…</span>
              ) : (
                <span className="flex items-center gap-3">
                  <span className="text-urgent" title={p.error}>
                    Not saved
                  </span>
                  <button type="button" onClick={() => onRetry(p.body)} className="min-h-[44px] font-medium underline">
                    Retry
                  </button>
                  <button type="button" onClick={() => onDiscard(p.body.id)} className="min-h-[44px] px-1 text-ink-soft" aria-label="Discard this note">
                    ✕
                  </button>
                </span>
              )}
            </div>
            <p className="line-clamp-2 whitespace-pre-wrap break-words">{(p.body.details as { text?: string }).text ?? ""}</p>
          </li>
        ))}
        {notes.map((n) => {
          const who = nameOf(n.person_id);
          const text = noteText(n);
          return (
            <li key={n.id} data-note="saved" className="rounded-xl border border-line bg-surface px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-ink-soft">
                  <time dateTime={n.at} className="tabular-nums">
                    {when(n.at)}
                  </time>
                  {who && <span> · {who}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onEdit(n)}
                  aria-label={`Edit the note from ${when(n.at)}`}
                  className="min-h-[44px] shrink-0 px-2 font-semibold underline"
                >
                  Edit
                </button>
              </div>
              <NoteText text={text} />
              <Attachments note={n} photoUrls={photoUrls} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
