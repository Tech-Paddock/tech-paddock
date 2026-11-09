"use client";

import { useRef, useState } from "react";
import { InvalidEvent, NOTE_MAX, eventNames, eventPhotos, parseDetails, type Details, type JournalEvent } from "@/lib/events";
import { noteText, noteWhenError } from "@/lib/notes";
import { fromLocalInput, toLocalInput } from "@/lib/localtime";
import { nameBoxWidth } from "@/lib/names";
import PhotoPicker, { usePhotos } from "./Photos";
import { Box, Field, input, inputFull, type LogBody, type Person } from "./LogForm";
import WhenStep, { type WhenChoice } from "./WhenStep";

type Props = {
  /** Set when correcting a note; the form opens on its values. */
  event?: JournalEvent;
  people: Person[];
  phonePerson: string | null;
  /** Signed URLs by storage path, for the attachments a note being corrected already has. */
  photoUrls: Record<string, string>;
  /** An attachment just uploaded: its signed URL, kept so the list can show it once the note is saved. */
  onPhotoUrl: (path: string, url: string) => void;
  /** A new note: handed off at once, never awaited (RULES.md, Never 5). */
  onLog: (body: LogBody) => void;
  /** A correction or a delete: awaited, and its error shown here. */
  onChange: (body: Record<string, unknown>) => Promise<{ error: string | null }>;
};

/**
 * The Note form (TEC-204), in the usual bottom sheet. Box 1 is When and Logging as, as on every form, but the
 * When can't be in the future and there is no Repeat: a note is not a plan. Box 2 is the note, a required long
 * text of 1 to NOTE_MAX characters, and the attachments built for every form (TEC-203), reused as they are.
 * Saving a new note never waits; a correction or a delete is a new event that voids the old one and is awaited.
 * A local pattern (no other app has one).
 */
export default function NoteForm({ event, people, phonePerson, photoUrls, onPhotoUrl, onLog, onChange }: Props) {
  const editing = !!event;
  const openedAt = useRef(new Date().toISOString());
  const [stepOpen, setStepOpen] = useState(false);
  const [personId, setPersonId] = useState(event ? event.person_id ?? "" : phonePerson ?? "");
  const [text, setText] = useState(event ? noteText(event) : "");
  const photos = usePhotos(event ? eventPhotos(event) : [], event ? eventNames(event) : {}, photoUrls, onPhotoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Fixed when the form opens, so pressing Save again after a lost response is the same row, never a second one.
  const saveId = useRef(crypto.randomUUID());
  const deleteId = useRef(crypto.randomUUID());
  const photoBlock = photos.working || photos.failed;
  const left = NOTE_MAX - text.length;

  /** Save: the note's own checks, then the When step (TEC-252). Nothing is saved here. */
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (photoBlock) {
      setError(photos.failed ? "An attachment didn't upload — retry it, or remove it." : "An attachment is still uploading.");
      return;
    }
    if (!text.trim()) {
      setError("Write the note — it can't be empty.");
      return;
    }
    setStepOpen(true);
  }

  /** The step's choice. Now on a new note is the moment of this save; keep is a correction's own time, to the millisecond. */
  async function commit(choice: WhenChoice) {
    setError(null);
    const at =
      choice.kind === "at" ? fromLocalInput(choice.value) : choice.kind === "keep" && event ? event.at : new Date().toISOString();
    if (!at) {
      setError("pick a time");
      return;
    }
    const future = noteWhenError(new Date(at), new Date());
    if (future) {
      setError(future);
      return;
    }
    let details: Details;
    try {
      // The same check the server makes, so a mistake is caught before the sheet closes.
      details = parseDetails("note", {
        text,
        ...(photos.paths.length ? { photos: photos.paths, ...(Object.keys(photos.names).length ? { names: photos.names } : {}) } : {}),
      });
    } catch (err) {
      setStepOpen(false);
      setError(err instanceof InvalidEvent ? err.message : "check the form");
      return;
    }
    const body: LogBody = { id: saveId.current, kind: "note", at, person_id: personId || null, details, note: null };
    if (!editing) {
      onLog(body);
      return;
    }
    setBusy(true);
    const { error } = await onChange({ ...body, voids: event.id });
    setBusy(false);
    if (error) setError(error);
  }

  async function remove() {
    if (!event) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    const { error } = await onChange({ id: deleteId.current, kind: "void", voids: event.id, person_id: personId || null });
    setBusy(false);
    if (error) setError(error);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      {/* The note, required, and its attachments. */}
      <Box section="entry" label="The note">
        <Field label="Note" htmlFor="n-text">
          <textarea
            id="n-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={NOTE_MAX}
            required
            aria-required="true"
            placeholder="Write the note"
            data-autofocus={editing ? undefined : true}
            className={`${inputFull} block resize-y leading-snug`}
          />
        </Field>
        <p className={`text-right text-[12px] tabular-nums ${left <= 100 ? "font-semibold text-ink" : "text-ink-soft"}`} aria-live="polite">
          {left} characters left
        </p>
        <div data-section="photos">
          <PhotoPicker photos={photos} />
        </div>
      </Box>

      {error && !stepOpen && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {/* The bottom row (TEC-252): Logging as, on one line beside Save, as on every form. */}
      <div data-section="save" className="flex items-center gap-2">
        <label htmlFor="n-who" className="shrink-0 text-[13px] text-ink-soft">
          as
        </label>
        <select
          id="n-who"
          aria-label="Logging as"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className={`${input} h-[44px] shrink-0`}
          style={{ width: nameBoxWidth(people.map((p) => p.display_name)) }}
        >
          <option value="">Nobody</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || photoBlock}
          className="min-h-[44px] min-w-0 flex-1 rounded-[14px] bg-[var(--tone-2-bg)] px-4 py-2.5 text-lg font-bold text-[var(--tone-2-ink)] shadow-[0_4px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_2px_0_var(--tone-2-lip)] disabled:opacity-60"
        >
          {busy ? "Saving…" : photos.working ? "Uploading attachment…" : photos.failed ? "Fix the attachment to save" : editing ? "Save changes" : "Save note"}
        </button>
      </div>
      {editing && (
        <button type="button" onClick={remove} disabled={busy} className="min-h-[44px] self-start font-semibold text-danger disabled:opacity-60">
          {confirmDelete ? "Tap again to delete" : "Delete this note"}
        </button>
      )}
      {stepOpen && (
        <WhenStep
          dateOnly={false}
          initial={toLocalInput(event?.at ?? openedAt.current)}
          stored={editing}
          editing={editing}
          allowFuture={false}
          check={(v) => {
            const at = fromLocalInput(v);
            return at ? noteWhenError(new Date(at), new Date()) : null;
          }}
          busy={busy}
          error={error}
          onChoose={(c) => void commit(c)}
          onBack={() => {
            setStepOpen(false);
            setError(null);
          }}
        />
      )}
    </form>
  );
}
