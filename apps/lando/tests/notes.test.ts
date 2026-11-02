// TEC-204: the Notes tab. A note is a journal entry of kind `note`, corrected and deleted like any entry, and kept
// out of the Log feed, the since-last pills and Analytics. The screens are rendered to markup (there is no DOM
// here); the rules they call are pure and tested directly.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import Notes from "@/app/Notes";
import NoteForm from "@/app/NoteForm";
import {
  InvalidEvent,
  LOG_KINDS,
  NOTE_MAX,
  checkVoid,
  correctionAt,
  describe as describeEvent,
  feedDays,
  formOf,
  liveEvents,
  parseDetails,
  parseNewEvent,
  sinceLast,
  type JournalEvent,
} from "@/lib/events";
import { liveNotes, mayOverflow, noteText, noteWhenError, withoutNotes } from "@/lib/notes";
import { RELEASES } from "@/lib/releases";

const NOW = new Date("2026-11-02T18:00:00Z");
const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const PIC = "health/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
const PDF = "health/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf";

let n = 0;
const ev = (kind: JournalEvent["kind"], at: string, details: Record<string, unknown>, extra: Partial<JournalEvent> = {}): JournalEvent => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  kind,
  at,
  person_id: null,
  details,
  note: null,
  voids: null,
  created_at: at,
  ...extra,
});
const note = (at: string, text: string, extra: Partial<JournalEvent> = {}) => ev("note", at, { text }, extra);
const pee = (at: string) => ev("potty", at, { what: "pee", where: "outside" });

describe("a note's details", () => {
  it("is the text, trimmed at its ends, with line breaks kept", () => {
    expect(parseDetails("note", { text: "  Ask about\nthe booster  " })).toEqual({ text: "Ask about\nthe booster" });
  });

  it("needs words: empty, blank and non-text are refused", () => {
    for (const text of ["", "   \n ", undefined, null, 5, ["a"]]) {
      expect(() => parseDetails("note", { text })).toThrow(InvalidEvent);
    }
    expect(() => parseDetails("note", {})).toThrow(InvalidEvent);
  });

  it("is 1 to 2000 characters", () => {
    expect(NOTE_MAX).toBe(2000);
    expect(parseDetails("note", { text: "a".repeat(2000) })).toEqual({ text: "a".repeat(2000) });
    expect(() => parseDetails("note", { text: "a".repeat(2001) })).toThrow(/2000/);
  });

  it("takes the attachments every kind takes, and no other key", () => {
    const d = parseDetails("note", { text: "x", photos: [PDF, PIC], names: { [PDF]: "Bill.pdf" }, what: "pee", note: "stray" });
    expect(d).toEqual({ text: "x", photos: [PDF, PIC], names: { [PDF]: "Bill.pdf" } });
    expect("photos" in (parseDetails("note", { text: "x" }) as object)).toBe(false);
    expect(() => parseDetails("note", { text: "x", photos: ["https://example.com/a.pdf"] })).toThrow(InvalidEvent);
    const seven = Array.from({ length: 7 }, (_, i) => `health/aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}.pdf`);
    expect(() => parseDetails("note", { text: "x", photos: seven })).toThrow(/at most 6/);
  });

  it("reads in the list as a Note with its words", () => {
    expect(describeEvent({ kind: "note", details: { text: "Ask about the booster", photos: [PDF] } })).toEqual({
      title: "Note",
      detail: "Ask about the booster · 1 file",
    });
  });
});

describe("a new note", () => {
  const body = (extra: Record<string, unknown> = {}) => ({ id: ID, kind: "note", details: { text: "Hello" }, ...extra });

  it("is a logged kind, with no form or filter pill of the Log tab", () => {
    expect(LOG_KINDS).toContain("note");
    expect(formOf({ kind: "note", details: { text: "x" } })).toBeNull();
  });

  it("is accepted, dated now when it has no time, and keeps the event's own note empty", () => {
    const e = parseNewEvent(body({ note: "ignored" }), NOW);
    expect(e).toMatchObject({ kind: "note", at: null, note: null, voids: null, details: { text: "Hello" } });
  });

  it("can't be dated in the future (a few minutes are allowed for the phone's clock)", () => {
    const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
    expect(parseNewEvent(body({ at: at(-86_400_000) }), NOW).at).toBe(at(-86_400_000));
    expect(parseNewEvent(body({ at: at(4 * 60_000) }), NOW).at).toBe(at(4 * 60_000));
    expect(() => parseNewEvent(body({ at: at(10 * 60_000) }), NOW)).toThrow(/future/);
    expect(() => parseNewEvent(body({ at: at(3 * 86_400_000) }), NOW)).toThrow(/future/);
    // Another kind keeps its day of leeway: this is the note's rule only.
    expect(parseNewEvent({ id: ID, kind: "potty", at: at(3_600_000), details: { what: "pee", where: "outside" } }, NOW).at).toBe(at(3_600_000));
  });

  it("the form's own check says the same", () => {
    expect(noteWhenError(new Date(NOW.getTime() + 60_000), NOW)).toMatch(/future/);
    expect(noteWhenError(NOW, NOW)).toBeNull();
    expect(noteWhenError(new Date(NOW.getTime() - 60_000), NOW)).toBeNull();
    expect(noteWhenError(null, NOW)).toBeNull();
  });

  it("is corrected and deleted through the void path, keeping its kind", () => {
    const old = note("2026-11-02T10:00:00Z", "first");
    const fix = parseNewEvent(body({ id: ID2, voids: old.id, details: { text: "second" } }), NOW);
    expect(() => checkVoid(fix, old, false)).not.toThrow();
    expect(correctionAt(fix, old)).toBe(old.at);
    expect(() => checkVoid(fix, old, true)).toThrow(/already changed/);
    const del = parseNewEvent({ id: ID2, kind: "void", voids: old.id }, NOW);
    expect(() => checkVoid(del, old, false)).not.toThrow();
    // A correction can't turn a note into another kind, or another kind into a note.
    const asPotty = parseNewEvent({ id: ID2, kind: "potty", voids: old.id, details: { what: "pee", where: "outside" } }, NOW);
    expect(() => checkVoid(asPotty, old, false)).toThrow(/keeps the entry's kind/);
    const asNote = parseNewEvent(body({ id: ID2, voids: pee("2026-11-02T10:00:00Z").id }), NOW);
    expect(() => checkVoid(asNote, pee("2026-11-02T10:00:00Z"), false)).toThrow(/keeps the entry's kind/);
  });
});

describe("notes stay out of the Log tab", () => {
  const events = [
    pee("2026-11-02T16:00:00Z"),
    note("2026-11-02T17:00:00Z", "newer note"),
    note("2026-10-01T09:00:00Z", "an old note"),
    ev("void", "2026-11-02T17:30:00Z", {}, { voids: "00000000-0000-4000-8000-999999999999" }),
  ];

  it("withoutNotes drops the notes and nothing else", () => {
    expect(withoutNotes(events).map((e) => e.kind)).toEqual(["potty", "void"]);
  });

  it("the feed, built from what the Log tab reads, holds no note", () => {
    const rows = liveEvents(withoutNotes(events)).map((e) => ({ kind: e.kind, at: e.at, created_at: e.created_at, item: e }));
    const days = feedDays(rows, NOW);
    expect(days.flatMap((d) => d.rows).map((r) => r.kind)).toEqual(["potty"]);
  });

  it("the since-last pills ignore a newer note", () => {
    const last = sinceLast(withoutNotes(events), NOW);
    expect(last.pee?.at).toBe("2026-11-02T16:00:00Z");
    expect(last.poop).toBeNull();
    expect(last.food).toBeNull();
  });

  it("the journal read asks for every note ever, as it does every weight", () => {
    const src = readFileSync(resolve(__dirname, "../lib/journal.ts"), "utf8");
    expect(src).toMatch(/\.or\(`at\.gte\.\$\{horizon\},kind\.eq\.weight,kind\.eq\.note,voids\.not\.is\.null`\)/);
  });

  it("the Log screen hands the pills, the feed and Analytics the entries without notes", () => {
    const src = readFileSync(resolve(__dirname, "../app/Journal.tsx"), "utf8");
    expect(src).toContain("sinceLast(entries, now)");
    expect(src).toContain("liveEvents(entries)");
    expect(src).toContain("<Analytics events={entries}");
    expect(src).toContain("mealPillLabel(entries, now)");
    expect(src).toContain("latestWeight(entries)");
    expect(src).not.toMatch(/sinceLast\(loaded\.events|<Analytics events=\{loaded\.events/);
    // A note still saving shows on the Notes tab, not as a pending row of the feed.
    expect(src).toContain('pending.filter((p) => p.body.kind !== "note")');
  });
});

describe("the Notes list", () => {
  it("is every live note, newest first, whatever its age; a corrected or deleted one is gone", () => {
    const a = note("2026-09-01T09:00:00Z", "oldest");
    const b = note("2026-11-01T09:00:00Z", "middle");
    const c = note("2026-11-02T09:00:00Z", "newest");
    const fix = note("2026-11-01T09:00:00Z", "middle, corrected", { voids: b.id, created_at: "2026-11-02T10:00:00Z" });
    const gone = note("2026-11-02T12:00:00Z", "deleted");
    const del = ev("void", "2026-11-02T13:00:00Z", {}, { voids: gone.id });
    expect(liveNotes([a, b, c, fix, gone, del, pee("2026-11-02T14:00:00Z")]).map(noteText)).toEqual(["newest", "middle, corrected", "oldest"]);
  });

  it("two notes at one minute keep the later save first", () => {
    const a = note("2026-11-02T09:00:00Z", "a", { created_at: "2026-11-02T09:00:01Z" });
    const b = note("2026-11-02T09:00:00Z", "b", { created_at: "2026-11-02T09:00:05Z" });
    expect(liveNotes([a, b]).map(noteText)).toEqual(["b", "a"]);
  });

  it("guesses when a text needs the tap to expand", () => {
    expect(mayOverflow("A short one")).toBe(false);
    expect(mayOverflow("a".repeat(80))).toBe(false);
    expect(mayOverflow("a".repeat(81))).toBe(true);
    expect(mayOverflow("one\ntwo\nthree")).toBe(true);
    expect(mayOverflow("x".repeat(2000))).toBe(true);
  });
});

const noop = () => {};
const baseProps = {
  pending: [],
  loaded: true,
  loadError: null,
  now: NOW,
  nameOf: (id: string | null) => (id ? "Joel" : null),
  photoUrls: { [PIC]: "https://example.test/pic.jpg", [PDF]: "https://example.test/bill.pdf" },
  onAdd: noop,
  onEdit: noop,
  onRetry: noop,
  onDiscard: noop,
};

describe("the Notes tab screen", () => {
  const notes = [
    note("2026-11-02T17:00:00Z", "Vet said to watch the left ear.\nRecheck in two weeks.", {
      person_id: ID,
      details: { text: "Vet said to watch the left ear.\nRecheck in two weeks.", photos: [PIC, PDF], names: { [PDF]: "Visit summary.pdf" } },
    }),
    note("2026-11-01T09:00:00Z", "A very long note. ".repeat(40)),
  ];
  const html = renderToStaticMarkup(createElement(Notes, { ...baseProps, notes }));

  it("opens with an Add note button, then the notes in the order given", () => {
    expect(html.indexOf("Add note")).toBeGreaterThan(-1);
    expect(html.indexOf("Add note")).toBeLessThan(html.indexOf("Vet said"));
    expect(html.indexOf("Vet said")).toBeLessThan(html.indexOf("A very long note"));
  });

  it("shows each note's date, who wrote it and its words", () => {
    expect(html).toContain("· Joel");
    expect(html).toMatch(/datetime="2026-11-02T17:00:00Z"/i);
    expect(html).toContain("Recheck in two weeks.");
  });

  it("clamps a long note to two lines behind a tap, and shows a short one as it is", () => {
    expect(html).toContain("line-clamp-2");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Tap to read all");
    // The short note is plain text, not a button.
    const shortNote = html.slice(html.indexOf("Vet said") - 120, html.indexOf("Vet said"));
    expect(shortNote).not.toContain("<button");
  });

  it("shows a picture as a thumbnail link and a file as a link with its name, never inside a button", () => {
    expect(html).toContain('href="https://example.test/pic.jpg"');
    expect(html).toContain('<img src="https://example.test/pic.jpg"');
    expect(html).toContain('href="https://example.test/bill.pdf"');
    expect(html).toContain("Visit summary.pdf");
    expect(html).toContain('target="_blank"');
    // No anchor is inside a button: take each button's markup and look for a link in it.
    for (const b of html.matchAll(/<button[\s\S]*?<\/button>/g)) expect(b[0]).not.toContain("<a ");
  });

  it("gives each note an Edit button and has no search", () => {
    expect(html.match(/>Edit</g)).toHaveLength(2);
    expect(html).not.toMatch(/type="search"|placeholder="Search|role="search"/i);
  });

  it("says so when there are none, and while loading", () => {
    expect(renderToStaticMarkup(createElement(Notes, { ...baseProps, notes: [] }))).toContain("No notes yet");
    const loading = renderToStaticMarkup(createElement(Notes, { ...baseProps, notes: [], loaded: false }));
    expect(loading).toContain("Loading…");
    expect(loading).not.toContain("No notes yet");
  });

  it("lists a note that is saving, or did not save, above the saved ones with its Retry", () => {
    const body = (id: string) => ({ id, kind: "note" as const, at: "2026-11-02T17:30:00Z", person_id: null, details: { text: "Pending words" }, note: null });
    const out = renderToStaticMarkup(
      createElement(Notes, {
        ...baseProps,
        notes,
        pending: [
          { body: body(ID), status: "saving" },
          { body: body(ID2), status: "failed", error: "no connection" },
        ],
      })
    );
    expect(out).toContain("Saving…");
    expect(out).toContain("Not saved");
    expect(out).toContain("Retry");
    expect(out.indexOf("Pending words")).toBeLessThan(out.indexOf("Vet said"));
  });
});

describe("the Note form", () => {
  const people = [{ id: ID, display_name: "Joel" }];
  const props = { people, phonePerson: ID, photoUrls: {}, onPhotoUrl: noop, onLog: noop, onChange: async () => ({ error: null }) };
  const html = renderToStaticMarkup(createElement(NoteForm, props));

  it("has Box 1 When and Logging as, then Box 2 the note and the attachments, then Save", () => {
    const sections = [...html.matchAll(/data-section="([a-z]+)"/g)].map((m) => m[1]);
    expect(sections).toEqual(["when", "entry", "photos", "save"]);
    expect(html).toContain("Logging as");
    expect(html).toContain("Attachments");
    expect(html).toContain("Take photo");
    expect(html).toContain("Save note");
  });

  it("has a required long text of at most 2000 characters, and says how many are left", () => {
    expect(html).toMatch(/<textarea[^>]*maxLength="2000"|<textarea[^>]*maxlength="2000"/i);
    expect(html).toMatch(/<textarea[^>]*required/);
    expect(html).toContain("2000 characters left");
  });

  it("has no Repeat and no future When", () => {
    expect(html).not.toContain("Repeat");
    expect(html).not.toContain("Future");
    expect(html).toMatch(/<input[^>]*type="datetime-local"[^>]*max="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}"/);
  });

  it("opens a correction on the note's own words, with a way to delete it", () => {
    const e = note("2026-11-02T10:00:00Z", "Booster due soon");
    const out = renderToStaticMarkup(createElement(NoteForm, { ...props, event: e }));
    expect(out).toContain("Booster due soon");
    expect(out).toContain("Save changes");
    expect(out).toContain("Delete this note");
    expect(html).not.toContain("Delete this note");
  });
});

describe("the migration and the release note", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_lando_notes.sql"))!;
  const sql = readFileSync(resolve(dir, file), "utf8");

  it("only widens: a note branch in lando.details_ok, search_path pinned, nothing dropped", () => {
    expect(sql).toContain("WHEN 'note' THEN");
    expect(sql).toContain("char_length(details ->> 'text') BETWEEN 1 AND 2000");
    expect(sql).toContain("set search_path = ''");
    expect(sql).not.toMatch(/\bdrop\b(?!\s*--)\s+(table|constraint|column|schema|function)/i);
    expect(sql.replace(/--.*$/gm, "")).not.toMatch(/\b(drop|delete|truncate|alter table)\b/i);
  });

  it("is the newest definition of the function", () => {
    const definers = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && readFileSync(resolve(dir, f), "utf8").includes("create or replace function lando.details_ok(kind"))
      .sort();
    expect(definers.at(-1)).toBe(file);
  });

  it("has a plain line in the release notes", () => {
    expect(RELEASES.some((r) => /Notes tab/.test(r.text))).toBe(true);
  });
});
