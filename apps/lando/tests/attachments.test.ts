// TEC-203: photos and files on every form and upcoming item, upcoming items editable, the description on the title's
// line. Invented items only; nothing here is a real record.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InvalidEvent,
  NAME_MAX,
  PHOTO_PATH,
  attachmentLabel,
  attachmentsText,
  cleanFileName,
  describe as describeEvent,
  eventNames,
  isImagePath,
  parseAttachments,
  parseDetails,
  pathExt,
} from "@/lib/events";
import { donePrefill, formForItem, futureItem } from "@/lib/future";
import { detailLine, parseUpcoming, repeatOf, titleLine, type Upcoming } from "@/lib/upcoming";
import { applyAction } from "@/lib/upcoming-db";
import { writeEvent } from "@/lib/journal";
import { isShrinkable, tooBigText, MAX_FILE_BYTES } from "@/app/Photos";
import type { getServiceClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof getServiceClient>;

const PIC = "health/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
const PDF = "health/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf";
const BARE = "health/cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ID = "11111111-1111-4111-8111-111111111111";

/* ── What a path and a name are ──────────────────────────────────────────── */

describe("attachment paths and names", () => {
  it("a path may end in any short lowercase extension, or none", () => {
    for (const p of [PIC, PDF, BARE, PIC.replace(".jpg", ".docx"), PIC.replace(".jpg", ".heic")]) expect(PHOTO_PATH.test(p)).toBe(true);
    for (const p of [PIC.replace(".jpg", ".PDF"), PIC.replace(".jpg", ".a-b"), PIC.replace(".jpg", ".abcdefghijk"), PIC + ".pdf.exe", "health/x.pdf"]) {
      expect(PHOTO_PATH.test(p), p).toBe(false);
    }
  });

  it("only a jpeg, png or webp path is a picture; the rest are files with a type and a name", () => {
    expect(isImagePath(PIC)).toBe(true);
    expect(isImagePath(PIC.replace(".jpg", ".png"))).toBe(true);
    expect(isImagePath(PDF)).toBe(false);
    expect(isImagePath(BARE)).toBe(false);
    expect(pathExt(PDF)).toBe("pdf");
    expect(pathExt(BARE)).toBe("");
    expect(attachmentLabel(PDF, { [PDF]: "Vaccine record.pdf" })).toBe("Vaccine record.pdf");
    expect(attachmentLabel(PDF)).toBe("PDF file");
    expect(attachmentLabel(BARE)).toBe("File");
  });

  it("counts read by what they are", () => {
    expect(attachmentsText([])).toBe("");
    expect(attachmentsText([PIC])).toBe("1 photo");
    expect(attachmentsText([PIC, PIC.replace("aaaa", "dddd")])).toBe("2 photos");
    expect(attachmentsText([PDF])).toBe("1 file");
    expect(attachmentsText([PDF, BARE])).toBe("2 files");
    expect(attachmentsText([PIC, PDF])).toBe("2 attachments");
  });

  it("a name is cleaned: control characters and runs of space gone, trimmed, cut at the limit", () => {
    expect(cleanFileName("  Vet\tbill \n final.pdf ")).toBe("Vet bill final.pdf");
    expect(cleanFileName("a".repeat(NAME_MAX + 50))).toHaveLength(NAME_MAX);
    expect(cleanFileName("\u0000\u0007")).toBe("");
  });

  it("parseAttachments keeps paths once each and names only for them; none is no key", () => {
    expect(parseAttachments({})).toEqual({});
    expect(parseAttachments({ photos: [] })).toEqual({});
    expect(parseAttachments({ photos: [PDF, PIC, PDF], names: { [PDF]: "  Bill.pdf ", [BARE]: "stray" } })).toEqual({
      photos: [PDF, PIC],
      names: { [PDF]: "Bill.pdf" },
    });
    // Names with no photos are dropped, not stored alone.
    expect(parseAttachments({ names: { [PDF]: "Bill.pdf" } })).toEqual({});
    expect(parseAttachments({ photos: [PDF], names: { [PDF]: "\u0001" } })).toEqual({ photos: [PDF] });
    expect(() => parseAttachments({ photos: [PDF], names: [PDF] })).toThrow(InvalidEvent);
    expect(() => parseAttachments({ photos: [PDF], names: { [PDF]: 5 } })).toThrow(InvalidEvent);
    expect(() => parseAttachments({ photos: ["https://example.com/a.pdf"] })).toThrow(InvalidEvent);
    const seven = Array.from({ length: 7 }, (_, i) => `health/aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}.pdf`);
    expect(() => parseAttachments({ photos: seven })).toThrow(/at most 6/);
  });
});

/* ── Every kind takes them ───────────────────────────────────────────────── */

describe("every form's details take attachments", () => {
  const att = { photos: [PDF, PIC], names: { [PDF]: "Bill.pdf" } };
  const cases: [string, Record<string, unknown>][] = [
    ["potty", { what: "pee", where: "outside" }],
    ["food", { type: "meal", item_id: "misc", amount: 1 }],
    ["exercise", { type: "walk", where: "outside", with_dogs: false, minutes: 10, treats: 0 }],
    ["weight", { value: 7.3, unit: "lb" }],
    ["health", { type: "vet", reasons: ["checkup"] }],
  ];
  for (const [kind, base] of cases) {
    it(`${kind} keeps photos and names, and none is no key`, () => {
      const d = parseDetails(kind as never, { ...base, ...att }) as Record<string, unknown>;
      expect(d.photos).toEqual([PDF, PIC]);
      expect(d.names).toEqual({ [PDF]: "Bill.pdf" });
      const bare = parseDetails(kind as never, base) as Record<string, unknown>;
      expect("photos" in bare).toBe(false);
      expect("names" in bare).toBe(false);
    });
  }

  it("a medication dose and a weight with a visit link keep them too", () => {
    const meds = [{ id: ID, name: "Test Tablet", unit: "mg" as const, retired: false }];
    const dose = parseDetails("health", { type: "medication", med_id: ID, dose: 5, unit: "mg", route: "mouth", ...att }, [], meds as never) as Record<string, unknown>;
    expect(dose.photos).toEqual([PDF, PIC]);
    const w = parseDetails("weight", { value: 7, unit: "kg", visit: ID, ...att }) as Record<string, unknown>;
    expect(w).toMatchObject({ visit: ID, photos: [PDF, PIC] });
  });

  it("the feed row says what is attached", () => {
    expect(describeEvent({ kind: "food", details: { type: "meal", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: 1, photos: [PDF] } }).detail).toBe("Misc · 1 · 1 file");
    expect(describeEvent({ kind: "weight", details: { value: 7.3, unit: "lb", photos: [PIC, PIC.replace("aaaa", "dddd")] } }).detail).toBe("7.3 lb · 2 photos");
    expect(describeEvent({ kind: "weight", details: { value: 7.3, unit: "lb" } }).detail).toBe("7.3 lb");
    expect(eventNames({ kind: "food", details: { names: { [PDF]: "Bill.pdf" } } })).toEqual({ [PDF]: "Bill.pdf" });
    expect(eventNames({ kind: "void", details: { names: { [PDF]: "x" } } })).toEqual({});
    expect(eventNames({ kind: "weight", details: { value: 1, unit: "lb" } })).toEqual({});
  });
});

/* ── A path is never trusted on its own ──────────────────────────────────── */

type Row = Record<string, any>;

/** A small fake of the calls writeEvent and applyAction make: tables in memory, a bucket of stored paths. */
function fakeDb(stored: string[], tables: { events?: Row[]; upcoming?: Row[] } = {}) {
  const data: Record<string, Row[]> = { events: tables.events ?? [], upcoming: tables.upcoming ?? [] };
  const written: Row[] = [];
  const from = (table: string) => {
    data[table] ??= []; // foods, medications and the rest read empty
    const filters: ((r: Row) => boolean)[] = [];
    let insertRow: Row | null = null;
    let patch: Row | null = null;
    const run = () => {
      if (patch) {
        const hit = data[table].filter((r) => filters.every((f) => f(r)));
        hit.forEach((r) => Object.assign(r, patch));
        return hit;
      }
      return data[table].filter((r) => filters.every((f) => f(r)));
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      limit: () => b,
      order: () => b,
      insert: (r: Row) => ((insertRow = r), b),
      update: (p: Row) => ((patch = p), b),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => {
        const full = { id: ID, status: "open", at: "2026-11-02T12:00:00.000Z", created_at: "2026-11-02T12:00:00.000Z", updated_at: "2026-11-02T12:00:00.000Z", ...insertRow };
        data[table].push(full);
        written.push(full);
        return { data: full, error: null };
      },
      then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(ok, fail),
    };
    return b;
  };
  const storage = {
    from: () => ({
      createSignedUrls: async (paths: string[]) => ({
        data: paths.map((path) => (stored.includes(path) ? { path, signedUrl: `https://signed.example/${path}`, error: null } : { path, signedUrl: null, error: "Object not found" })),
        error: null,
      }),
    }),
  };
  return { db: { from, storage } as unknown as SupabaseClient, data, written };
}

describe("an entry or an item never saves naming a file that is not there", () => {
  const food = (photos: string[]) => ({
    id: ID,
    kind: "food",
    details: { type: "meal", item_id: "misc", amount: 1, photos, names: { [PDF]: "Bill.pdf" } },
  });

  it("a Food entry with a file is refused until the file is in the bucket, and saved when it is", async () => {
    const missing = fakeDb([]);
    await expect(writeEvent(missing.db, food([PDF]))).rejects.toThrow(/didn't finish uploading/);
    expect(missing.data.events).toHaveLength(0);
    const there = fakeDb([PDF]);
    await writeEvent(there.db, food([PDF]));
    expect(there.data.events[0].details).toMatchObject({ photos: [PDF], names: { [PDF]: "Bill.pdf" } });
  });

  it("an upcoming item is checked the same way, on add and on edit", async () => {
    const item = parseUpcoming({ kind: "vet", title: "Vet visit", due_on: "2026-11-20", attachments: { photos: [PDF], names: { [PDF]: "Bill.pdf" } } });
    await expect(applyAction(fakeDb([]).db, { action: "add", item })).rejects.toThrow(/didn't finish uploading/);
    const ok = fakeDb([PDF]);
    const { item: saved } = await applyAction(ok.db, { action: "add", item });
    expect(saved.attachments).toEqual({ photos: [PDF], names: { [PDF]: "Bill.pdf" } });
    const row = { id: ID, kind: "vet", title: "Vet visit", due_on: "2026-11-20", status: "open" };
    const edit = fakeDb([], { upcoming: [row] });
    await expect(applyAction(edit.db, { action: "edit", id: ID, item })).rejects.toThrow(/didn't finish uploading/);
    expect(row).not.toHaveProperty("attachments");
  });
});

/* ── Upcoming items ──────────────────────────────────────────────────────── */

function planItem(over: Partial<Upcoming> = {}): Upcoming {
  return {
    id: ID,
    kind: "vet",
    title: "Vet visit · Check-up",
    due_on: "2026-11-20",
    due_time: "09:30",
    note: "bring the records",
    repeat_every: 6,
    repeat_unit: "month",
    status: "open",
    done_on: null,
    done_event: null,
    attachments: { photos: [PDF, PIC], names: { [PDF]: "Records.pdf" } },
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
    ...over,
  };
}

describe("an upcoming item's attachments", () => {
  const base = { kind: "vet", title: "Vet visit", due_on: "2026-11-20", due_time: "09:30" };

  it("parseUpcoming keeps them as paths and names; none is no key", () => {
    expect(parseUpcoming({ ...base })).not.toHaveProperty("attachments");
    expect(parseUpcoming({ ...base, attachments: null })).not.toHaveProperty("attachments");
    expect(parseUpcoming({ ...base, attachments: { photos: [] } })).not.toHaveProperty("attachments");
    expect(parseUpcoming({ ...base, attachments: { photos: [PDF], names: { [PDF]: "Records.pdf" } } }).attachments).toEqual({ photos: [PDF], names: { [PDF]: "Records.pdf" } });
    expect(() => parseUpcoming({ ...base, attachments: ["x"] })).toThrow(InvalidEvent);
    expect(() => parseUpcoming({ ...base, attachments: { photos: ["../x"] } })).toThrow(InvalidEvent);
  });

  it("a future When on any form carries the form's files onto the item", () => {
    const item = futureItem({ form: "food", healthType: "vet", day: "2026-11-20", time: "08:00", note: "", repeatEvery: null, repeatUnit: null, photos: [PDF], names: { [PDF]: "Plan.pdf" } });
    expect(item.attachments).toEqual({ photos: [PDF], names: { [PDF]: "Plan.pdf" } });
    expect(futureItem({ form: "weight", healthType: "vet", day: "2026-11-20", time: null, note: "", repeatEvery: null, repeatUnit: null })).not.toHaveProperty("attachments");
  });

  it("a Done opens the form with the item's files, so the entry it creates carries them", () => {
    const p = donePrefill(planItem());
    expect(p.photos).toEqual([PDF, PIC]);
    expect(p.names).toEqual({ [PDF]: "Records.pdf" });
    expect(donePrefill(planItem({ attachments: null }))).toMatchObject({ photos: [], names: {} });
    expect(donePrefill(planItem({ attachments: undefined }))).toMatchObject({ photos: [], names: {} });
  });

  it("the next occurrence of a repeat does not carry the finished visit's files", () => {
    expect(repeatOf(planItem())).not.toHaveProperty("attachments");
  });
});

describe("editing an open upcoming item in place", () => {
  const row = (over: Row = {}) => ({ id: ID, kind: "vet", title: "Vet visit", due_on: "2026-11-20", due_time: "09:30:00", note: null, repeat_every: null, repeat_unit: null, status: "open", done_on: null, done_event: null, attachments: null, created_at: "x", updated_at: "x", ...over });

  it("updates the same row: new date, files added; nothing is inserted and the journal is untouched", async () => {
    const { db, data, written } = fakeDb([PDF], { upcoming: [row()], events: [] });
    const item = parseUpcoming({ kind: "vet", title: "Vet visit", due_on: "2026-11-27", due_time: "10:00", note: "moved", attachments: { photos: [PDF] } });
    const out = await applyAction(db, { action: "edit", id: ID, item });
    expect(data.upcoming).toHaveLength(1);
    expect(written).toHaveLength(0);
    expect(data.events).toHaveLength(0);
    expect(out.item).toMatchObject({ id: ID, due_on: "2026-11-27", due_time: "10:00", note: "moved", attachments: { photos: [PDF] } });
  });

  it("an edit without files clears them (the plan is replaced, not merged)", async () => {
    const { db, data } = fakeDb([PDF], { upcoming: [row({ attachments: { photos: [PDF] } })] });
    await applyAction(db, { action: "edit", id: ID, item: parseUpcoming({ kind: "vet", title: "Vet visit", due_on: "2026-11-20" }) });
    expect(data.upcoming[0].attachments).toBeNull();
  });

  it("a done or cancelled item stays read-only: the server refuses the edit", async () => {
    for (const status of ["done", "cancelled"]) {
      const { db, data } = fakeDb([], { upcoming: [row({ status })] });
      await expect(applyAction(db, { action: "edit", id: ID, item: parseUpcoming({ kind: "vet", title: "Changed", due_on: "2026-11-20" }) })).rejects.toThrow(/already done or cancelled/);
      expect(data.upcoming[0].title).toBe("Vet visit");
    }
  });

  it("the list opens an item whose title names a form, and the screen sends an edit with its id (source check)", () => {
    expect(formForItem(planItem())).toEqual({ form: "health", healthType: "vet" });
    expect(formForItem({ kind: "other", title: "Weight" })).toEqual({ form: "weight", healthType: "vet" });
    expect(formForItem({ kind: "other", title: "Groom the puppy" })).toBeNull();

    const list = readFileSync(resolve(__dirname, "../app/UpcomingList.tsx"), "utf8");
    expect(list).toContain("onEdit && formForItem(i)");
    expect(list).toContain("onClick={() => onEdit(i)}");
    const journal = readFileSync(resolve(__dirname, "../app/Journal.tsx"), "utf8");
    expect(journal).toContain('id ? { action: "edit", id, item } : { action: "add", item }');
    expect(journal).toContain("onEdit={editUpcoming}");
    expect(journal).toContain("plan={open.plan}");
    // Both lists open the editor; only open items are ever listed, so a done or cancelled one has no row to tap.
    expect(journal.match(/onEdit=\{editUpcoming\}/g)).toHaveLength(2);
    const form = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");
    expect(form).toContain("await onUpcoming(item, plan?.id)");
  });
});

describe("an upcoming row's two lines", () => {
  it("the first reads Title · note (the row cuts it off); the second keeps due date, overdue and repeat", () => {
    expect(titleLine({ title: "Vet visit · Check-up", note: "bring the records" })).toBe("Vet visit · Check-up · bring the records");
    expect(titleLine({ title: "Training", note: null })).toBe("Training");
    expect(detailLine(planItem(), "red")).toBe("Fri Nov 20, 9:30 AM · overdue · every 6 months");
    expect(detailLine(planItem({ repeat_every: null, repeat_unit: null }), null)).toBe("Fri Nov 20, 9:30 AM");
    // The note is not on the second line any more.
    expect(detailLine(planItem(), "yellow")).not.toContain("records");
  });

  it("the row truncates the first line and shows the note beside the bold title (source check)", () => {
    const list = readFileSync(resolve(__dirname, "../app/UpcomingList.tsx"), "utf8");
    // The tone words sit right after the title: an absolutely placed span after a long note would widen the page.
    expect(list).toMatch(/<b>\{i\.title\}<\/b>[\s\S]*?\{tone && <span className="sr-only">[\s\S]*?\{i\.note && <span className="text-ink-soft"> · \{i\.note\}<\/span>\}/);
    expect(list).toContain("detailLine(i, tone)");
  });
});

/* ── The phone's side ────────────────────────────────────────────────────── */

describe("the picker's limits", () => {
  it("shrinks a raster picture, and sends anything else as it is", () => {
    for (const f of [{ type: "image/jpeg", name: "a.jpg" }, { type: "image/png", name: "a" }, { type: "image/heic", name: "a.heic" }, { type: "", name: "IMG_1.HEIC" }]) {
      expect(isShrinkable(f), f.name).toBe(true);
    }
    for (const f of [{ type: "application/pdf", name: "a.pdf" }, { type: "image/gif", name: "a.gif" }, { type: "image/svg+xml", name: "a.svg" }, { type: "", name: "notes" }, { type: "text/plain", name: "a.txt" }]) {
      expect(isShrinkable(f), f.name).toBe(false);
    }
  });

  it("a file over 4 MB gets a plain line on the form, naming it", () => {
    expect(MAX_FILE_BYTES).toBe(4 * 1024 * 1024);
    expect(tooBigText(["scan.pdf"])).toBe("scan.pdf is over 4 MB, so it can't be attached.");
    expect(tooBigText(["a.pdf", "b.zip"])).toBe("2 files are over 4 MB, so they can't be attached: a.pdf, b.zip.");
    const picker = readFileSync(resolve(__dirname, "../app/Photos.tsx"), "utf8");
    // Raised on pick, as an alert; never dropped silently.
    expect(picker).toContain("tooBigText(tooBig.map((f) => f.name))");
    expect(picker).toContain('role="alert"');
    // Take photo stays; Attach takes any file.
    expect(picker).toContain("Take photo");
    expect(picker).toContain("Attach");
    expect(picker).not.toContain("Choose photos");
    expect(picker).toMatch(/<input ref=\{library\} type="file" multiple onChange/);
  });

  it("every form has the picker, a future one included (source check)", () => {
    const form = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");
    expect(form).not.toContain("hasPhotos");
    expect(form).toContain('<div data-section="photos">');
    expect(form).toContain("...(w?.visit ? { visit: w.visit } : {}), ...attachments");
    expect(form).toContain("return { type: foodType, item_id: itemId, amount, ...attachments }");
  });
});

/* ── The migrations ──────────────────────────────────────────────────────── */

describe("the TEC-203 migrations", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const read = (suffix: string) => {
    const f = readdirSync(dir).find((n) => n.endsWith(suffix));
    expect(f, suffix).toBeTruthy();
    return { name: f!, sql: readFileSync(resolve(dir, f!), "utf8") };
  };
  const code = (sql: string) => sql.replace(/--.*$/gm, "").trim();

  it("apply in this order: the bucket, the column, then the function", () => {
    const names = ["_lando_photos_any_file_type.sql", "_lando_upcoming_attachments.sql", "_lando_attachments_details_ok.sql"].map((s) => read(s).name);
    expect([...names].sort()).toEqual(names);
    // After everything older (the superset test reads the newest two definitions of the function).
    const all = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort();
    expect(all.indexOf(names[0])).toBeGreaterThan(all.indexOf("20261102012734_cookbook_recipe_tidy_drafts.sql"));
  });

  it("the bucket: any type, still private, size limit untouched, one UPDATE and nothing destructive", () => {
    const { sql } = read("_lando_photos_any_file_type.sql");
    expect(code(sql)).toBe("update storage.buckets\nset allowed_mime_types = null\nwhere id = 'lando-photos';");
    expect(sql).toMatch(/^-- .*\n/);
    expect(sql).toContain("Shape: additive");
    expect(code(sql)).not.toMatch(/public|file_size_limit|delete|drop|truncate/i);
  });

  it("the column: one nullable jsonb column on lando.upcoming, additive", () => {
    const { sql } = read("_lando_upcoming_attachments.sql");
    expect(sql).toContain("Shape: additive");
    expect(code(sql)).toMatch(/^set local lock_timeout = '5s';\s+alter table lando\.upcoming\s+add column attachments jsonb\s+check \(attachments is null or jsonb_typeof\(attachments\) = 'object'\);\s+notify pgrst, 'reload schema';$/);
    expect(code(sql)).not.toMatch(/drop|delete|not null|default/i);
  });

  it("details_ok: the function only, search_path pinned, the path pattern and the keys the code saves", () => {
    const { sql } = read("_lando_attachments_details_ok.sql");
    const c = code(sql);
    expect(c.startsWith("set local lock_timeout = '5s';")).toBe(true);
    expect(c).toMatch(/create or replace function lando\.details_ok\(kind text, details jsonb\)/);
    expect(c).toContain("set search_path = ''");
    expect(c).not.toMatch(/drop |alter /i);
    // The statements are the lock_timeout and the one function.
    expect(c.split(/;\s*(?=create|$)/).filter(Boolean)).toHaveLength(2);
    // The pattern is the code's, with the dot as [.] for jsonpath.
    const pattern = PHOTO_PATH.source.replace(/\\\//g, "/").replace("\\.", "[.]");
    expect(c.split(pattern).length - 1).toBe(12); // photos and names keys, in each of the 6 checks: potty, food, exercise, weight, vet/issue, medication
    const branch = (from: string, to: string) => c.slice(c.indexOf(from), c.indexOf(to));
    for (const [from, to] of [
      ["WHEN 'potty' THEN", "WHEN 'food' THEN"],
      ["WHEN 'food' THEN", "WHEN 'exercise' THEN"],
      ["WHEN 'exercise' THEN", "WHEN 'weight' THEN"],
      ["WHEN 'weight' THEN", "WHEN 'health' THEN"],
      ["WHEN 'health' THEN", "WHEN 'void' THEN"],
    ]) {
      const b = branch(from, to);
      expect(b, from).toContain("'photos'");
      expect(b, from).toContain("'names'");
      expect(b, from).toContain("jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6");
    }
    // Food and Weight list both keys among what they allow.
    expect(branch("WHEN 'food' THEN", "WHEN 'exercise' THEN")).toContain("'amount', 'photos', 'names'] = '{}'::jsonb");
    expect(branch("WHEN 'weight' THEN", "WHEN 'health' THEN")).toContain("ARRAY['value', 'unit', 'visit', 'photos', 'names'] = '{}'::jsonb");
    // A name is 1 to 200 characters, only for a path in `photos`.
    expect(c).toContain('like_regex "^.{1,200}$"');
    expect(c).toContain("(details -> 'photos') ? k");
    // Void is unchanged.
    expect(c).toContain("WHEN 'void' THEN details = '{}'::jsonb");
  });
});
