/**
 * The Notes tab's rules (TEC-204), with no I/O so every one is tested.
 *
 * A note is a journal entry of kind `note`: the same append-only rules as every entry, so a correction or a
 * delete is a new event that voids the old one and history is kept. What sets a note apart is where it shows.
 * It is in the Notes tab, newest first, and nowhere else: not in the Log feed or its filters, not in the
 * since-last pills, not in the meal and weight reads, and not in Analytics. Everything that reads the journal
 * for those is handed `withoutNotes(events)`.
 */
import { liveEvents, newestFirst, type JournalEvent, type NoteDetails } from "./events";
import { isFutureWhen } from "./future";

/** The events with every note taken out: what the Log tab and Analytics read. A void is kept (it may void an entry). */
export function withoutNotes(events: readonly JournalEvent[]): JournalEvent[] {
  return events.filter((e) => e.kind !== "note");
}

/**
 * Every live note, of any age, newest first by the day it is dated (then by when it was saved). A note whose
 * correction or delete is in `events` is not live, so the old copy never shows beside its replacement.
 */
export function liveNotes(events: readonly JournalEvent[]): JournalEvent[] {
  return liveEvents([...events])
    .filter((e) => e.kind === "note")
    .sort(newestFirst);
}

/** The line a note's form shows when its When is after now; none otherwise. A note is dated now or earlier. */
export function noteWhenError(at: Date | null, now: Date): string | null {
  return isFutureWhen(at, now) ? "A note can't be dated in the future." : null;
}

/** How many lines of a note's text show before a tap expands it. */
export const NOTE_CLAMP_LINES = 2;

/**
 * Whether the text may need more than two lines on a phone, so a tap-to-expand is offered. A guess from the
 * length (about `charsPerLine` characters fit a line at 390px), kept on the generous side: a short note that
 * is offered the tap loses nothing, and a long one never goes without it.
 */
export function mayOverflow(text: string, charsPerLine = 40): boolean {
  const lines = text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0);
  return lines > NOTE_CLAMP_LINES;
}

/** A note's words, or an empty text for an event that is not one. */
export function noteText(e: Pick<JournalEvent, "details">): string {
  const t = (e.details as Partial<NoteDetails>).text;
  return typeof t === "string" ? t : "";
}
