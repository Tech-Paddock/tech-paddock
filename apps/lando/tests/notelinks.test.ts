// TEC-208: Health shows its Related issue all the time (no checkbox; Potty keeps its own), and every Health type and
// Training carry a Related note: the id of a note from the Notes tab. The forms are rendered to markup (there is no
// DOM here), so what is asserted is what is on the screen when a form opens; the save shape is held by the pure
// functions the form calls (`noteLink`, `parseDetails`) and by a check that the form's save uses them.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import LogForm from "@/app/LogForm";
import {
  InvalidEvent,
  checkNoteTarget,
  checkVoid,
  describe as describeEvent,
  liveEvents,
  parseDetails,
  parseNewEvent,
  resolveNote,
  sinceLast,
  type FormKind,
  type JournalEvent,
} from "@/lib/events";
import { writeEvent } from "@/lib/journal";
import { NOTE_CHOICES_MAX, noteChoices, noteLabel, noteLink, withoutNotes } from "@/lib/notes";
import { RELEASES } from "@/lib/releases";

type Row = Record<string, any>;

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const ev = (kind: JournalEvent["kind"], at: string, details: Record<string, unknown>, extra: Partial<JournalEvent> = {}): JournalEvent => ({
  id: uuid(),
  kind,
  at,
  person_id: null,
  details,
  note: null,
  voids: null,
  created_at: at,
  ...extra,
});
/** A local time in October or November 2026, as ISO. */
const local = (month: number, day: number, h = 9) => new Date(2026, month - 1, day, h).toISOString();
const note = (at: string, text: string, extra: Partial<JournalEvent> = {}) => ev("note", at, { text }, extra);
const del = (target: JournalEvent) => ev("void", "2026-11-02T12:00:00Z", {}, { voids: target.id });
const issue = (at: string) => ev("health", at, { type: "issue", reasons: ["stomach-appetite"] }, { note: "off his food" });

const MED = { id: "11111111-1111-4111-8111-111111111111", name: "Test Tablet", unit: "tablet" as const };
const formProps = {
  people: [],
  dogs: [],
  onAddDog: async () => ({ dog: null, error: null }),
  foods: [],
  onAddFood: async () => ({ food: null, error: null }),
  medications: [MED],
  onAddMedication: async () => ({ medication: null, error: null }),
  phonePerson: null,
  events: [] as JournalEvent[],
  photoUrls: {},
  onPhotoUrl: () => {},
  remembered: {},
  weightUnit: "lb" as const,
  onLog: () => {},
  onChange: async () => ({ error: null }),
  onUpcoming: async () => ({ error: null }),
  onPotty: () => {},
  unsaved: {},
  onRetry: () => {},
};
const render = (form: FormKind, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(LogForm, { ...formProps, form, ...extra } as never));

/** The body of the form's `rawDetails`, which builds what Save posts. */
const rawDetailsOf = (src: string) => {
  const from = src.indexOf("function rawDetails()");
  return src.slice(from, src.indexOf("/** A future When", from));
};

const NOTE_A = note(local(10, 22), "Ask the vet about the booster schedule and the heartworm pill");
const NOTE_B = note(local(10, 28), "Breeder sent the pedigree papers");
const ALL = [NOTE_A, NOTE_B];

describe("Health's Related issue has no checkbox", () => {
  const A_ISSUE = issue(local(10, 24));
  for (const [name, extra] of [
    ["Vet visit", { healthType: "vet" }],
    ["Medication", { healthType: "medication" }],
  ] as const) {
    it(`${name}: the select shows on opening, on None, with no checkbox`, () => {
      const html = render("health", { ...extra, events: [A_ISSUE] });
      expect(html).toContain('id="f-issue"');
      expect(html).toContain("Related issue");
      expect(html).not.toContain('type="checkbox"');
      expect(html).not.toContain("For a medical issue");
      // None first, and nothing selected but None (the static markup marks the chosen option).
      const select = html.slice(html.indexOf('id="f-issue"'), html.indexOf("</select>", html.indexOf('id="f-issue"')));
      expect(select).toMatch(/<option value="" selected="">None<\/option>/);
      expect(select).toContain("Oct 24 · Stomach &amp; appetite");
    });

    it(`${name}: a correction opens on its stored issue`, () => {
      const stored = A_ISSUE;
      const details = name === "Medication"
        ? { type: "medication", med_id: MED.id, med_name: MED.name, dose: 1, unit: "tablet", route: "mouth", issue: stored.id }
        : { type: "vet", reasons: ["checkup"], issue: stored.id };
      const html = render("health", { ...extra, events: [stored], event: ev("health", local(10, 25), details, { note: "x" }) });
      expect(html).toMatch(new RegExp(`<option value="${stored.id}" selected="">`));
    });
  }

  it("a Medical issue does not link to another: no Related issue", () => {
    expect(render("health", { healthType: "issue", events: [A_ISSUE] })).not.toContain("f-issue");
  });

  it("Potty keeps its Medical issue checkbox, and the select hides behind it", () => {
    const html = render("potty", { events: [A_ISSUE] });
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Medical issue");
    expect(html).not.toContain('id="f-issue"');
  });

  it("the form saves a Health issue pick without a checkbox, and Potty's only when ticked", () => {
    const src = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");
    const raw = rawDetailsOf(src);
    expect(raw).toContain('...(issue ? { issue } : {}),');
    expect(raw).toContain('...(healthType === "vet" && issue ? { issue } : {}),');
    expect(raw).toContain('...(hasIssue && issue ? { issue } : {}),'); // Potty
    expect(raw.match(/hasIssue/g)).toHaveLength(1);
  });
});

describe("the Related note select", () => {
  const has = (html: string) => html.includes('id="f-note-id"') && html.includes("Related note");

  it("is on a vet visit, a medical issue, a medication and Training", () => {
    expect(has(render("health", { healthType: "vet", allEvents: ALL }))).toBe(true);
    expect(has(render("health", { healthType: "issue", allEvents: ALL }))).toBe(true);
    expect(has(render("health", { healthType: "medication", allEvents: ALL }))).toBe(true);
    expect(has(render("training", { allEvents: ALL }))).toBe(true);
  });

  it("is not on Potty, Fun, Food or Weight", () => {
    for (const form of ["potty", "fun", "food", "weight"] as const) expect(has(render(form, { allEvents: ALL })), form).toBe(false);
  });

  it("is not on a future entry, which keeps no links", () => {
    const html = render("health", { healthType: "vet", allEvents: ALL, done: undefined, plan: { id: "p", kind: "vet", title: "Vet visit", due_day: "2026-12-01", due_time: null, note: null, repeat_every: null, repeat_unit: null, status: "open", photos: [] } });
    expect(has(html)).toBe(false);
  });

  it("is a plain select: None first, then the newest live notes by date and first words", () => {
    const html = render("health", { healthType: "vet", allEvents: ALL });
    const select = html.slice(html.indexOf('id="f-note-id"'), html.indexOf("</select>", html.indexOf('id="f-note-id"')));
    expect(select).toMatch(/<option value="" selected="">None<\/option>/);
    expect(select.indexOf("Oct 28 · Breeder sent the pedigree papers")).toBeGreaterThan(0);
    expect(select.indexOf("Oct 28")).toBeLessThan(select.indexOf("Oct 22 · Ask the vet about the booster schedule"));
  });

  it("sits in the secondary box, after Related issue, and the sections stay in order", () => {
    const html = render("health", { healthType: "vet", allEvents: ALL });
    const box = html.slice(html.indexOf('data-section="secondary"'), html.indexOf('data-section="note"'));
    expect(box.indexOf("Related issue")).toBeGreaterThan(-1);
    expect(box.indexOf("Related issue")).toBeLessThan(box.indexOf("Related note"));
    expect([...html.matchAll(/data-section="([a-z]+)"/g)].map((m) => m[1])).toEqual(["entry", "secondary", "note", "photos", "save"]);
  });

  it("opens a correction on the stored pick, and a voided note stays picked in words", () => {
    const stored = ev("health", local(10, 30), { type: "issue", reasons: ["ear"], note_id: NOTE_A.id }, { note: "x" });
    const picked = render("health", { healthType: "issue", event: stored, allEvents: ALL });
    expect(picked).toMatch(new RegExp(`<option value="${NOTE_A.id}" selected="">`));
    // The note was deleted after the link: the pick stays, as "Removed note".
    const gone = render("health", { healthType: "issue", event: stored, allEvents: [NOTE_A, del(NOTE_A), NOTE_B] });
    expect(gone).toMatch(new RegExp(`<option value="${NOTE_A.id}" selected="">Removed note</option>`));
    // A training session opens on its pick too.
    const session = ev("exercise", local(10, 30), { type: "training", where: "inside", with_dogs: false, minutes: 5, treats: 0, commands: [], note_id: NOTE_B.id });
    expect(render("training", { event: session, allEvents: ALL })).toMatch(new RegExp(`<option value="${NOTE_B.id}" selected="">`));
  });

  it("the form saves the pick through noteLink on every Health type and on Training only", () => {
    const src = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");
    const raw = rawDetailsOf(src);
    expect(raw.match(/\.\.\.noteLink\(noteId\)/g)).toHaveLength(3); // training, medication, vet and issue
    expect(raw).toMatch(/exType === "training" \? \{ commands, \.\.\.noteLink\(noteId\) \}/);
  });
});

describe("noteChoices", () => {
  it("lists live notes newest first, labelled by date and first words", () => {
    expect(noteChoices(ALL, null)).toEqual([
      { id: NOTE_B.id, label: "Oct 28 · Breeder sent the pedigree papers" },
      { id: NOTE_A.id, label: "Oct 22 · Ask the vet about the booster schedule…" },
    ]);
  });

  it("leaves out a deleted note and the superseded copy of a corrected one", () => {
    const fixed = note(local(10, 22), "Ask the vet about the booster", { voids: NOTE_A.id });
    const gone = note(local(10, 29), "Scratch that");
    expect(noteChoices([NOTE_A, fixed, gone, del(gone), NOTE_B], null).map((c) => c.id)).toEqual([NOTE_B.id, fixed.id]);
  });

  it("leaves out every other kind", () => {
    expect(noteChoices([ev("potty", local(10, 30), { what: "pee", where: "outside" }), issue(local(10, 29)), NOTE_B], null).map((c) => c.id)).toEqual([NOTE_B.id]);
  });

  it("keeps a link to a superseded copy as the first option, labelled by the live version", () => {
    const fixed = note(local(10, 22), "Ask about the booster", { voids: NOTE_A.id });
    const out = noteChoices([NOTE_A, fixed], NOTE_A.id);
    expect(out[0]).toEqual({ id: NOTE_A.id, label: "Oct 22 · Ask about the booster" });
    expect(out.map((c) => c.id)).toEqual([NOTE_A.id, fixed.id]);
  });

  it("keeps a deleted or unknown link, in words, and does not repeat a live one", () => {
    expect(noteChoices([NOTE_A, del(NOTE_A)], NOTE_A.id)).toEqual([{ id: NOTE_A.id, label: "Removed note" }]);
    const lost = uuid();
    expect(noteChoices([], lost)).toEqual([{ id: lost, label: "Earlier note" }]);
    expect(noteChoices([NOTE_A], NOTE_A.id)).toHaveLength(1);
  });

  it("lists at most the newest NOTE_CHOICES_MAX", () => {
    const many = Array.from({ length: NOTE_CHOICES_MAX + 5 }, (_, i) => note(new Date(2026, 9, 1, 8, i).toISOString(), `n${i}`));
    const out = noteChoices(many, null);
    expect(out).toHaveLength(NOTE_CHOICES_MAX);
    expect(out[0].label).toContain(`n${NOTE_CHOICES_MAX + 4}`);
  });

  it("labels by the first words: line breaks as spaces, cut at a word, 'Note' for no words", () => {
    expect(noteLabel(note(local(10, 22), "Line one\n\nline  two"))).toBe("Oct 22 · Line one line two");
    expect(noteLabel(note(local(10, 22), "word ".repeat(30))).endsWith("word…")).toBe(true);
    expect(noteLabel(note(local(10, 22), ""))).toBe("Oct 22 · Note");
  });
});

describe("a note link in the details", () => {
  const vet = { type: "vet", reasons: ["checkup"] };
  const dose = { type: "medication", med_id: MED.id, dose: 1, unit: "tablet", route: "mouth" };
  const session = { type: "training", where: "inside", with_dogs: false, minutes: 5, treats: 0, commands: ["sit"] };

  it("noteLink is the key for a pick and nothing for None", () => {
    expect(noteLink(NOTE_A.id)).toEqual({ note_id: NOTE_A.id });
    expect(noteLink("")).toEqual({});
  });

  it("is saved on a vet visit, a medical issue, a medication and a training session, lowercased", () => {
    const up = NOTE_A.id.toUpperCase();
    expect(parseDetails("health", { ...vet, note_id: up })).toMatchObject({ note_id: NOTE_A.id });
    expect(parseDetails("health", { type: "issue", reasons: ["ear"], note_id: NOTE_A.id })).toMatchObject({ note_id: NOTE_A.id });
    expect(parseDetails("health", { ...dose, note_id: NOTE_A.id }, [], [MED])).toMatchObject({ note_id: NOTE_A.id });
    expect(parseDetails("exercise", { ...session, note_id: NOTE_A.id })).toMatchObject({ note_id: NOTE_A.id });
  });

  it("None saves no key at all", () => {
    for (const none of [undefined, null, ""]) {
      expect(parseDetails("health", { ...vet, note_id: none })).not.toHaveProperty("note_id");
      expect(parseDetails("health", { ...dose, note_id: none }, [], [MED])).not.toHaveProperty("note_id");
      expect(parseDetails("exercise", { ...session, note_id: none })).not.toHaveProperty("note_id");
    }
  });

  it("is refused when it is not an id, and on Fun, Potty, Food and Weight", () => {
    expect(() => parseDetails("health", { ...vet, note_id: "not-an-id" })).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { ...vet, note_id: 5 })).toThrow(InvalidEvent);
    expect(() => parseDetails("exercise", { ...session, type: "walk", commands: undefined, note_id: NOTE_A.id })).toThrow(/only a training session/);
    // Kinds that take no link drop nothing silently into storage: the key is not read for them.
    expect(parseDetails("potty", { what: "pee", where: "outside", note_id: NOTE_A.id })).not.toHaveProperty("note_id");
    expect(parseDetails("weight", { value: 10, unit: "lb", note_id: NOTE_A.id })).not.toHaveProperty("note_id");
  });

  it("a correction can change or clear the link: a new event that voids the old one", () => {
    const first = ev("health", local(10, 30), { ...vet, note_id: NOTE_A.id }, { note: "x" });
    const changed = parseNewEvent({ id: uuid(), kind: "health", voids: first.id, details: { ...vet, note_id: NOTE_B.id }, note: "x" }, new Date(2026, 10, 2));
    const cleared = parseNewEvent({ id: uuid(), kind: "health", voids: first.id, details: vet, note: "x" }, new Date(2026, 10, 2));
    expect(changed.details).toMatchObject({ note_id: NOTE_B.id });
    expect(cleared.details).not.toHaveProperty("note_id");
    expect(() => checkVoid(cleared, first, false)).not.toThrow();
    expect(liveEvents([first, { ...cleared, created_at: "2026-11-02T10:00:00Z", at: first.at } as JournalEvent]).length).toBe(1);
  });
});

describe("resolving and checking the link", () => {
  it("follows a corrected note to its live copy, a deleted one to removed, an unknown id to unknown", () => {
    const fixed = note(local(10, 22), "v2", { voids: NOTE_A.id });
    expect(resolveNote([NOTE_A, fixed], NOTE_A.id)).toEqual({ state: "live", event: fixed });
    expect(resolveNote([NOTE_A, del(NOTE_A)], NOTE_A.id)).toEqual({ state: "removed" });
    expect(resolveNote([], uuid())).toEqual({ state: "unknown" });
  });

  it("the server accepts a note (voided too) and refuses anything else", () => {
    expect(() => checkNoteTarget(NOTE_A)).not.toThrow();
    expect(() => checkNoteTarget(null)).toThrow(InvalidEvent);
    expect(() => checkNoteTarget(issue(local(10, 24)))).toThrow(InvalidEvent);
    expect(() => checkNoteTarget(ev("potty", local(10, 24), { what: "pee", where: "outside" }))).toThrow(InvalidEvent);
  });
});

describe("writeEvent — the link must be a note", () => {
  const NOTE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
  const ISSUE_ID = "aaaaaaaa-0000-4000-8000-000000000002";
  const seeded = (): Row[] => [
    { id: NOTE_ID, kind: "note", at: "2026-10-24T15:00:00Z", details: { text: "x" }, voids: null },
    { id: ISSUE_ID, kind: "health", at: "2026-10-24T15:00:00Z", details: { type: "issue", reasons: ["ear"] }, voids: null },
  ];
  /** The few calls writeEvent makes, over an in-memory events table. */
  function fakeDb(seed: Row[]) {
    const events: Row[] = [...seed];
    const builder = () => {
      const filters: ((r: Row) => boolean)[] = [];
      let row: Row | null = null;
      const b: any = {
        select: () => b,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), b),
        limit: () => b,
        insert: (r: Row) => ((row = r), b),
        maybeSingle: async () => ({ data: events.filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
        single: async () => {
          const full = { at: "2026-10-26T15:00:00.000Z", created_at: "2026-10-26T15:00:00.000Z", ...row };
          events.push(full);
          return { data: full, error: null };
        },
        then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
          Promise.resolve({ data: events.filter((r) => filters.every((f) => f(r))), error: null }).then(ok, fail),
      };
      return b;
    };
    return { db: { from: builder } as never, events };
  }
  const vet = (id: string, noteId: string) => ({ id, kind: "health", details: { type: "vet", reasons: ["checkup"], note_id: noteId }, note: "x" });

  it("saves a vet visit linked to a note", async () => {
    const { db, events } = fakeDb(seeded());
    await writeEvent(db, vet("bbbbbbbb-0000-4000-8000-000000000001", NOTE_ID));
    expect(events.at(-1)!.details.note_id).toBe(NOTE_ID);
  });

  it("refuses a link to something that is not a note, or to nothing", async () => {
    const { db, events } = fakeDb(seeded());
    const before = events.length;
    await expect(writeEvent(db, vet("bbbbbbbb-0000-4000-8000-000000000002", ISSUE_ID))).rejects.toThrow(/note doesn't exist/);
    await expect(writeEvent(db, vet("bbbbbbbb-0000-4000-8000-000000000003", "cccccccc-0000-4000-8000-000000000009"))).rejects.toThrow(/note doesn't exist/);
    expect(events).toHaveLength(before);
  });
});

describe("a link changes nothing on the Log", () => {
  it("a linked entry reads the same in the feed, the pills and with notes taken out", () => {
    const plain = ev("health", local(10, 30), { type: "vet", reasons: ["checkup"] }, { note: "x" });
    const linked = { ...plain, details: { ...plain.details, note_id: NOTE_A.id } };
    expect(describeEvent(linked)).toEqual(describeEvent(plain));
    const entries = withoutNotes([linked, ...ALL]);
    expect(entries).toEqual([linked]);
    expect(liveEvents(entries)).toEqual([linked]);
    expect(sinceLast(entries, new Date(2026, 9, 31))).toEqual(sinceLast([plain], new Date(2026, 9, 31)));
  });
});

describe("the migration and the release note", () => {
  it("the key is note_id in the migration, the types and the form", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/20261102201016_lando_note_links.sql"), "utf8");
    expect(sql).toContain("'note_id'");
    expect(sql).toContain("set search_path = ''");
    expect(sql.replace(/--.*$/gm, "")).not.toMatch(/\b(drop|delete|truncate|alter table)\b/i);
  });

  it("has a plain line in the release notes", () => {
    expect(RELEASES.some((r) => /Related note/.test(r.text))).toBe(true);
  });
});
