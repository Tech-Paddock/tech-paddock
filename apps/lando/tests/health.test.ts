import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { getServiceClient } from "@/lib/supabase";
import {
  FORM_KINDS,
  FORM_LABELS,
  HEALTH_KEPT,
  ISSUE_PICKS,
  ISSUE_RETIRED,
  InvalidEvent,
  LOG_KINDS,
  MAX_PHOTOS,
  PHOTO_PATH,
  VET_REASONS,
  VET_RETIRED,
  checkHealthReasons,
  describe as describeEvent,
  eventPhotos,
  feedDays,
  healthPickFor,
  healthReasonsFromPick,
  formOf,
  kindOfForm,
  liveEvents,
  parseDetails,
  treatEntry,
  parseNewEvent,
  type FeedRow,
  type JournalEvent,
} from "@/lib/events";
import { writeEvent } from "@/lib/journal";
import { MAX_PHOTO_BYTES, missingPhotos, photoPath, signedPhotoUrls } from "@/lib/storage";

type SupabaseClient = ReturnType<typeof getServiceClient>;

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const P1 = "health/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
const P2 = "health/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg";
const P3 = "health/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp";

describe("the Health form", () => {
  it("is the sixth form, saving kind health, and has its own filter chip", () => {
    expect(LOG_KINDS).toContain("health");
    expect(FORM_KINDS.at(-1)).toBe("health");
    expect(FORM_LABELS.health).toBe("Health");
    expect(kindOfForm("health")).toBe("health");
    expect(formOf({ kind: "health", details: { type: "vet", reasons: ["dental"] } })).toBe("health");
  });
});

describe("parseDetails — health", () => {
  it("takes one reason from the type's list", () => {
    expect(parseDetails("health", { type: "vet", reasons: ["procedure"] })).toEqual({ type: "vet", reasons: ["procedure"] });
    expect(parseDetails("health", { type: "issue", reasons: ["breathing-cough"] })).toEqual({
      type: "issue",
      reasons: ["breathing-cough"],
    });
  });

  it("still accepts the retired detailed ids, several at a time, once each in the order given (old entries)", () => {
    expect(parseDetails("health", { type: "vet", reasons: ["dental", "vaccines", "dental", "checkup"] })).toEqual({
      type: "vet",
      reasons: ["dental", "vaccines", "checkup"],
    });
    expect(parseDetails("health", { type: "issue", reasons: ["wound", "limping"] })).toEqual({
      type: "issue",
      reasons: ["wound", "limping"],
    });
  });

  it("refuses a reason from the other type's list, an unknown one, and none at all", () => {
    expect(() => parseDetails("health", { type: "vet", reasons: ["vomiting"] })).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { type: "issue", reasons: ["vaccines"] })).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { type: "issue", reasons: ["procedure"] })).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { type: "vet", reasons: ["spa-day"] })).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { type: "vet", reasons: [] })).toThrow(/why you went/);
    expect(() => parseDetails("health", { type: "issue", reasons: [] })).toThrow(/what the issue/);
    expect(() => parseDetails("health", { type: "vet" })).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { type: "vet", reasons: "dental" })).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { type: "groomer", reasons: ["other"] })).toThrow(InvalidEvent);
  });

  it("keeps photos as storage paths, in the order given, once each; none is no key", () => {
    expect(parseDetails("health", { type: "issue", reasons: ["eye"], photos: [P2, P1, P2] })).toEqual({
      type: "issue",
      reasons: ["eye"],
      photos: [P2, P1],
    });
    expect(parseDetails("health", { type: "issue", reasons: ["eye"], photos: [] })).toEqual({ type: "issue", reasons: ["eye"] });
    expect(parseDetails("health", { type: "issue", reasons: ["eye"], photos: null })).toEqual({ type: "issue", reasons: ["eye"] });
  });

  it("refuses anything that is not a path this app wrote: a URL, a traversal, another folder, another type", () => {
    for (const bad of [
      "https://example.com/a.jpg",
      "health/../secret.jpg",
      "coffee/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg",
      P1.replace(".jpg", ".gif"),
      P1.toUpperCase(),
      7,
    ]) {
      expect(() => parseDetails("health", { type: "vet", reasons: ["other"], photos: [bad] })).toThrow(InvalidEvent);
    }
    expect(() => parseDetails("health", { type: "vet", reasons: ["other"], photos: P1 })).toThrow(InvalidEvent);
  });

  it(`allows ${MAX_PHOTOS} photos and not one more`, () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => `health/aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}.jpg`);
    expect(parseDetails("health", { type: "vet", reasons: ["other"], photos: many(MAX_PHOTOS) })).toHaveProperty("photos");
    expect(() => parseDetails("health", { type: "vet", reasons: ["other"], photos: many(MAX_PHOTOS + 1) })).toThrow(/at most/);
  });

  it("drops a key it does not own", () => {
    const d = parseDetails("health", { type: "vet", reasons: ["other"], cost: 120 });
    expect(d).toEqual({ type: "vet", reasons: ["other"] });
  });
});

describe("the fixed lists", () => {
  it("have unique ids that fit the database check, and a label each", () => {
    for (const list of [VET_REASONS, ISSUE_PICKS]) {
      const ids = list.map(([id]) => id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const [id, label] of list) {
        expect(id).toMatch(/^[a-z0-9-]{1,30}$/);
        expect(label.length).toBeGreaterThan(0);
      }
    }
  });

  it("offer the owner's high-level picks, six each, Other last", () => {
    expect(VET_REASONS.map(([, l]) => l)).toEqual([
      "Check-up",
      "Vaccines",
      "Sick or injured",
      "Procedure (spay/neuter, dental)",
      "Follow-up",
      "Other",
    ]);
    expect(ISSUE_PICKS.map(([, l]) => l)).toEqual([
      "Stomach & appetite",
      "Skin, ears & eyes",
      "Limping or injury",
      "Breathing or cough",
      "Energy or behaviour",
      "Other",
    ]);
  });

  it("keep every TEC-137 id: either still offered or retired, never gone", () => {
    const oldVet = ["checkup", "vaccines", "deworming", "flea-tick-heartworm", "spay-neuter", "dental", "microchip", "sick", "injury", "skin-ears", "stomach", "recheck", "other"];
    const oldIssue = ["vomiting", "diarrhea", "limping", "itching-skin", "ear", "eye", "cough-sneeze", "not-eating", "low-energy", "wound", "ate-something", "other"];
    const vet = new Set([...VET_REASONS, ...VET_RETIRED].map(([id]) => id as string));
    const issue = new Set([...ISSUE_PICKS, ...ISSUE_RETIRED].map(([id]) => id as string));
    for (const id of oldVet) expect(vet.has(id)).toBe(true);
    for (const id of oldIssue) expect(issue.has(id)).toBe(true);
    // A retired id is not offered, and is not also in the offered list.
    for (const [id] of VET_RETIRED) expect((VET_REASONS as readonly (readonly [string, string])[]).some(([o]) => o === id)).toBe(false);
    for (const [id] of ISSUE_RETIRED) expect((ISSUE_PICKS as readonly (readonly [string, string])[]).some(([o]) => o === id)).toBe(false);
  });

  const dir = resolve(__dirname, "../../../supabase/migrations");
  const read = (suffix: string) => {
    const file = readdirSync(dir).find((f) => f.endsWith(suffix));
    expect(file).toBeDefined();
    return readFileSync(resolve(dir, file!), "utf8");
  };
  /** The latest migration that defines the function, by version: the one that is true now. */
  const latest = () => {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && readFileSync(resolve(dir, f), "utf8").includes("create or replace function lando.details_ok(kind"))
      .sort();
    expect(files.length).toBeGreaterThan(1);
    return { name: files.at(-1)!, sql: readFileSync(resolve(dir, files.at(-1)!), "utf8") };
  };
  const body = (sql: string) => {
    const start = sql.indexOf("create or replace function lando.details_ok(kind");
    expect(start).toBeGreaterThan(0);
    return sql.slice(start, sql.indexOf("$fn$;", start));
  };
  const arrays = (fn: string) => [...fn.matchAll(/details -> 'reasons' <@ '(\[[^']*\])'::jsonb/g)].map((m) => JSON.parse(m[1]) as string[]);

  it("are the same lists lando.details_ok holds, offered and retired (a value in the app alone fails every save)", () => {
    const sql = latest().sql;
    // The newest file is the one that is true now (this sync follows it, TEC-142 onward): at least the picklist one.
    expect(latest().name >= "20261026021027").toBe(true);
    const fn = body(sql);
    const [vet, issue] = arrays(fn);
    expect(new Set(vet)).toEqual(new Set([...VET_REASONS, ...VET_RETIRED].map(([id]) => id)));
    expect(new Set(issue)).toEqual(new Set([...ISSUE_PICKS, ...ISSUE_RETIRED].map(([id]) => id)));
    expect(fn).toContain(`BETWEEN 1 AND ${MAX_PHOTOS}`);
    expect(fn).toContain("WHEN 'health' THEN");
    // The path pattern in the function is the code's, with the dot as [.] for jsonpath.
    expect(fn).toContain(PHOTO_PATH.source.replace(/\\\//g, "/").replace("\\.", "[.]"));
  });

  it("only widens: the new function holds everything the first one did", () => {
    const first = arrays(body(read("_lando_health_events.sql")));
    const now = arrays(body(latest().sql));
    first.forEach((list, i) => list.forEach((id) => expect(now[i]).toContain(id)));
    expect(now[0].length).toBeGreaterThan(first[0].length);
    expect(now[1].length).toBeGreaterThan(first[1].length);
  });

  it("gives Fun and Training the photos key, the same shape as Health's", () => {
    const fn = body(latest().sql);
    const exercise = fn.slice(fn.indexOf("WHEN 'exercise' THEN"), fn.indexOf("WHEN 'weight' THEN"));
    expect(exercise).toContain("'commands', 'dogs', 'photos'] = '{}'::jsonb");
    expect(exercise).toContain("jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6");
    expect(exercise).toContain("^health/[0-9a-f]{8}");
  });

  it("the first migration applies through the connector: fails fast, and drops no table, column or function", () => {
    const code = read("_lando_health_events.sql").replace(/--.*$/gm, "");
    expect(code.trimStart().startsWith("set local lock_timeout = '5s';")).toBe(true);
    expect(code).not.toMatch(/drop\s+(table|column|function|schema)/i);
    expect(code).toMatch(/CHECK \(lando\.details_ok\(kind, details\)\)/);
  });

  it("the widening is one file: lock_timeout, then the function, and nothing else (no DROP, no ALTER)", () => {
    const code = latest().sql.replace(/--.*$/gm, "").trim();
    expect(code.startsWith("set local lock_timeout = '5s';")).toBe(true);
    const statements = code.replace(/\$fn\$[\s\S]*?\$fn\$/, "$fn$").split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(statements[1]).toMatch(/^create or replace function lando\.details_ok/);
    expect(code).not.toMatch(/\b(drop|alter|truncate|delete|update|insert)\b/i);
  });
});

describe("describe — health", () => {
  it("titles by type and lists the reasons by label, with a photo count", () => {
    expect(describeEvent({ kind: "health", details: { type: "vet", reasons: ["checkup", "vaccines"] } })).toEqual({
      title: "Vet visit",
      detail: "Check-up, Vaccines",
    });
    expect(describeEvent({ kind: "health", details: { type: "issue", reasons: ["wound"], photos: [P1] } })).toEqual({
      title: "Medical issue",
      detail: "Cut / wound · 1 photo", // a retired id still reads in words
    });
    expect(describeEvent({ kind: "health", details: { type: "issue", reasons: ["eye", "ear"], photos: [P1, P2] } }).detail).toBe(
      "Eye, Ear · 2 photos"
    );
  });

  it("labels the new picks and the retired ones", () => {
    expect(describeEvent({ kind: "health", details: { type: "vet", reasons: ["procedure"] } }).detail).toBe("Procedure (spay/neuter, dental)");
    expect(describeEvent({ kind: "health", details: { type: "issue", reasons: ["stomach-appetite"] } }).detail).toBe("Stomach & appetite");
    expect(describeEvent({ kind: "health", details: { type: "vet", reasons: ["spay-neuter", "dental"] } }).detail).toBe("Spay / neuter, Dental");
  });

  it("does not break on a reason it no longer knows", () => {
    expect(describeEvent({ kind: "health", details: { type: "vet", reasons: ["retired-one"] } }).detail).toBe("retired-one");
  });
});

describe("the feed", () => {
  it("puts a health entry in its day by when it happened, like any other", () => {
    const rows: FeedRow<string>[] = [
      { kind: "health", at: "2026-10-23T15:00:00.000Z", created_at: "2026-10-24T01:00:00.000Z", item: "vet" },
      { kind: "potty", at: "2026-10-23T18:00:00.000Z", created_at: "2026-10-23T18:00:00.000Z", item: "potty" },
    ];
    const days = feedDays(rows, new Date("2026-10-24T12:00:00.000Z"));
    expect(days.flatMap((d) => d.rows.map((r) => r.item))).toEqual(["potty", "vet"]);
  });
});

/* ── Writing: a photo must be in storage ─────────────────────────────────── */

type Row = Record<string, any>;

/** The few calls writeEvent makes, over an in-memory events table and a set of stored paths. */
function fakeDb(stored: string[], opts: { signFails?: boolean } = {}) {
  const events: Row[] = [];
  const signCalls: string[][] = [];
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
        const full = { at: "2026-10-24T15:00:00.000Z", created_at: "2026-10-24T15:00:00.000Z", ...row };
        events.push(full);
        return { data: full, error: null };
      },
      then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
        Promise.resolve({ data: events.filter((r) => filters.every((f) => f(r))), error: null }).then(ok, fail),
    };
    return b;
  };
  const storage = {
    from: (bucket: string) => {
      expect(bucket).toBe("lando-photos");
      return {
        createSignedUrls: async (paths: string[]) => {
          signCalls.push(paths);
          if (opts.signFails) return { data: null, error: { message: "storage down" } };
          return {
            data: paths.map((path) =>
              stored.includes(path)
                ? { path, signedUrl: `https://signed.example/${path}`, error: null }
                : { path, signedUrl: null, error: "Object not found" }
            ),
            error: null,
          };
        },
      };
    },
  };
  return { db: { from: builder, storage } as unknown as SupabaseClient, events, signCalls };
}

describe("writeEvent — health photos", () => {
  const body = (photos: string[], id = ID) => ({
    id,
    kind: "health",
    details: { type: "issue", reasons: ["limping-injury"], photos },
    note: "Cut his paw on the fence",
  });

  it("saves an entry whose photos are in storage", async () => {
    const { db, events } = fakeDb([P1, P2]);
    const e = await writeEvent(db, body([P1, P2]));
    expect(e.id).toBe(ID);
    expect(events).toHaveLength(1);
    expect((events[0].details as any).photos).toEqual([P1, P2]);
  });

  it("refuses an entry naming a photo that never uploaded — nothing is saved", async () => {
    const { db, events } = fakeDb([P1]);
    await expect(writeEvent(db, body([P1, P2]))).rejects.toThrow(/didn't finish uploading/);
    expect(events).toHaveLength(0);
  });

  it("refuses when storage cannot be asked: no proof, no entry", async () => {
    const { db, events } = fakeDb([P1], { signFails: true });
    await expect(writeEvent(db, body([P1]))).rejects.toThrow(InvalidEvent);
    expect(events).toHaveLength(0);
  });

  it("does not touch storage for an entry without photos", async () => {
    const { db, events, signCalls } = fakeDb([]);
    await writeEvent(db, { id: ID, kind: "health", details: { type: "vet", reasons: ["checkup"] }, note: "Annual" });
    expect(events).toHaveLength(1);
    expect(signCalls).toHaveLength(0);
  });

  it("a retry of a saved entry returns the first row", async () => {
    const { db, events } = fakeDb([P1]);
    await writeEvent(db, body([P1]));
    await writeEvent(db, body([P1]));
    expect(events).toHaveLength(1);
  });

  it("a correction keeps the photos it does not remove, and the old entry's stay readable", async () => {
    const { db, events } = fakeDb([P1, P2, P3]);
    await writeEvent(db, body([P1, P2]));
    // The phone's form sends what is left plus the new one.
    await writeEvent(db, { ...body([P2, P3], ID2), voids: ID });
    const live = liveEvents(events as JournalEvent[]);
    expect(live.map((e) => e.id)).toEqual([ID2]);
    expect((live[0].details as any).photos).toEqual([P2, P3]);
    // The voided entry still names its photos: nothing was rewritten or deleted.
    expect((events[0].details as any).photos).toEqual([P1, P2]);
  });

  it("a delete is a void and leaves the photos where they are", async () => {
    const { db, events } = fakeDb([P1]);
    await writeEvent(db, body([P1]));
    await writeEvent(db, { id: ID2, kind: "void", voids: ID });
    expect(liveEvents(events as JournalEvent[])).toHaveLength(0);
    expect(events[0].details.photos).toEqual([P1]);
  });
});

describe("parseNewEvent — health", () => {
  it("accepts a health body with a note", () => {
    const e = parseNewEvent(
      { id: ID, kind: "health", details: { type: "vet", reasons: ["checkup"] }, note: "Dr. says all good" },
      new Date("2026-10-24T12:00:00Z")
    );
    expect(e.kind).toBe("health");
    expect(e.note).toBe("Dr. says all good");
  });
});

describe("lib/storage", () => {
  it("names a photo health/<id>.<ext> from its type, lowercased", () => {
    expect(photoPath("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "image/jpeg", 1000)).toBe(P1);
    expect(photoPath(ID, "image/webp", 1000)).toBe(`health/${ID}.webp`);
    expect(PHOTO_PATH.test(photoPath(ID, "image/png", 1))).toBe(true);
  });

  it("refuses a missing id, a type that is not an image we take, an empty file and a huge one", () => {
    expect(() => photoPath(undefined, "image/jpeg", 10)).toThrow(InvalidEvent);
    expect(() => photoPath("../x", "image/jpeg", 10)).toThrow(InvalidEvent);
    expect(() => photoPath(ID, "image/gif", 10)).toThrow(InvalidEvent);
    expect(() => photoPath(ID, "image/heic", 10)).toThrow(InvalidEvent);
    expect(() => photoPath(ID, "toString", 10)).toThrow(InvalidEvent);
    expect(() => photoPath(ID, null, 10)).toThrow(InvalidEvent);
    expect(() => photoPath(ID, "image/jpeg", 0)).toThrow(/empty/);
    expect(() => photoPath(ID, "image/jpeg", MAX_PHOTO_BYTES + 1)).toThrow(/too big/);
    expect(photoPath(ID, "image/jpeg", MAX_PHOTO_BYTES)).toBe(`health/${ID}.jpg`);
  });

  it("signs many paths in one request and leaves out one it could not sign", async () => {
    const { db, signCalls } = fakeDb([P1]);
    const urls = await signedPhotoUrls(db, [P1, P2]);
    expect(signCalls).toHaveLength(1);
    expect([...urls.keys()]).toEqual([P1]);
    expect(await missingPhotos(db, [P1, P2])).toEqual([P2]);
    expect(await missingPhotos(db, [])).toEqual([]);
  });
});

/* ── TEC-139: one pick, a required note, old entries kept ────────────────── */

describe("the Health pick", () => {
  it("opens a new entry on nothing, an entry with one offered reason on it", () => {
    expect(healthPickFor(null)).toEqual({ pick: "", kept: null });
    expect(healthPickFor({ type: "vet", reasons: ["procedure"] })).toEqual({ pick: "procedure", kept: null });
    expect(healthPickFor({ type: "issue", reasons: ["other"] })).toEqual({ pick: "other", kept: null });
  });

  it("opens an old entry on its reasons as a kept option, several or retired, and saves them unchanged", () => {
    const several = healthPickFor({ type: "vet", reasons: ["checkup", "vaccines"] });
    expect(several).toEqual({ pick: HEALTH_KEPT, kept: ["checkup", "vaccines"] });
    expect(healthReasonsFromPick(several.pick, several.kept)).toEqual(["checkup", "vaccines"]);
    const retired = healthPickFor({ type: "issue", reasons: ["vomiting"] });
    expect(retired).toEqual({ pick: HEALTH_KEPT, kept: ["vomiting"] });
    expect(healthReasonsFromPick(retired.pick, retired.kept)).toEqual(["vomiting"]);
  });

  it("saves one id for a pick, and nothing for no pick", () => {
    expect(healthReasonsFromPick("sick-injured", null)).toEqual(["sick-injured"]);
    expect(healthReasonsFromPick("", null)).toEqual([]);
    expect(() => parseDetails("health", { type: "vet", reasons: healthReasonsFromPick("", null) })).toThrow(/why you went/);
  });
});

describe("the Health note is required", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const base = { id: ID, kind: "health", details: { type: "vet", reasons: ["checkup"] } };

  it("refuses a missing, empty or whitespace-only note", () => {
    for (const note of [undefined, null, "", "   ", "\n\t "]) {
      expect(() => parseNewEvent({ ...base, note }, now)).toThrow(/note is required/);
    }
  });

  it("takes a note and trims it", () => {
    expect(parseNewEvent({ ...base, note: "  Shots, he was brave " }, now).note).toBe("Shots, he was brave");
  });

  it("applies to a correction as well, but not to a delete", () => {
    expect(() => parseNewEvent({ ...base, id: ID2, voids: ID }, now)).toThrow(/note is required/);
    expect(parseNewEvent({ id: ID2, kind: "void", voids: ID }, now).note).toBeNull();
  });

  it("no other kind needs one", () => {
    expect(parseNewEvent({ id: ID, kind: "weight", details: { value: 7, unit: "lb" } }, now).note).toBeNull();
  });

  it("is refused by the write path, with nothing saved", async () => {
    const { db, events } = fakeDb([]);
    await expect(writeEvent(db, { ...base, note: " " })).rejects.toThrow(/note is required/);
    expect(events).toHaveLength(0);
  });
});

describe("writeEvent — one reason on a new entry, old ones kept on a correction", () => {
  const entry = (reasons: string[], extra: Record<string, unknown> = {}, type = "vet") => ({
    id: ID,
    kind: "health",
    details: { type, reasons },
    note: "Why",
    ...extra,
  });

  it("refuses a new entry with two reasons or a retired one", async () => {
    const { db, events } = fakeDb([]);
    await expect(writeEvent(db, entry(["checkup", "vaccines"]))).rejects.toThrow(/pick one/);
    await expect(writeEvent(db, entry(["dental"]))).rejects.toThrow(/pick one/);
    await expect(writeEvent(db, entry(["vomiting"], {}, "issue"))).rejects.toThrow(/pick one/);
    expect(events).toHaveLength(0);
    await writeEvent(db, entry(["follow-up"]));
    expect(events).toHaveLength(1);
  });

  it("lets a correction keep an old entry's reasons unchanged, and no other old set", async () => {
    const { db, events } = fakeDb([]);
    // An entry as TEC-137 stored it: several reasons, no note needed then.
    events.push({
      id: ID,
      kind: "health",
      at: "2026-10-24T15:00:00.000Z",
      created_at: "2026-10-24T15:00:00.000Z",
      person_id: null,
      details: { type: "vet", reasons: ["checkup", "vaccines"] },
      note: null,
      voids: null,
    });
    await expect(writeEvent(db, entry(["vaccines", "dental"], { id: ID2, voids: ID }))).rejects.toThrow(/pick one/);
    await expect(writeEvent(db, entry(["checkup", "vaccines"], { id: ID2, voids: ID, note: "" }))).rejects.toThrow(/note is required/);
    const kept = await writeEvent(db, entry(["vaccines", "checkup"], { id: ID2, voids: ID }));
    expect(kept.id).toBe(ID2);
    expect(liveEvents(events as JournalEvent[]).map((e) => e.id)).toEqual([ID2]);
  });

  it("checkHealthReasons: one offered always passes; the same old set passes only against that entry", () => {
    const old = { kind: "health", details: { type: "issue", reasons: ["eye", "ear"] } };
    expect(() => checkHealthReasons({ details: { type: "issue", reasons: ["breathing-cough"] } }, null)).not.toThrow();
    expect(() => checkHealthReasons({ details: { type: "issue", reasons: ["eye", "ear"] } }, null)).toThrow(InvalidEvent);
    expect(() => checkHealthReasons({ details: { type: "issue", reasons: ["ear", "eye"] } }, old)).not.toThrow();
    expect(() => checkHealthReasons({ details: { type: "issue", reasons: ["eye"] } }, old)).toThrow(InvalidEvent);
    expect(() => checkHealthReasons({ details: { type: "vet", reasons: ["eye", "ear"] } }, old)).toThrow(InvalidEvent);
  });
});

describe("photos on Fun and Training (TEC-139)", () => {
  const ex = { type: "walk", where: "outside", with_dogs: false, minutes: 20, treats: 0 };

  it("parseDetails keeps exercise photos, once each in the order given, none is no key", () => {
    expect(parseDetails("exercise", { ...ex, photos: [P2, P1, P2] })).toEqual({ ...ex, photos: [P2, P1] });
    expect(parseDetails("exercise", { ...ex, photos: [] })).toEqual(ex);
    expect(parseDetails("exercise", { ...ex, photos: null })).toEqual(ex);
    expect(parseDetails("exercise", ex)).toEqual(ex); // old entries stay valid
  });

  it("refuses what is not a path this app wrote, and a seventh", () => {
    expect(() => parseDetails("exercise", { ...ex, photos: ["https://example.com/a.jpg"] })).toThrow(InvalidEvent);
    expect(() => parseDetails("exercise", { ...ex, photos: P1 })).toThrow(InvalidEvent);
    const many = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => `health/aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}.jpg`);
    expect(() => parseDetails("exercise", { ...ex, photos: many })).toThrow(/at most/);
  });

  it("a training keeps commands and photos together", () => {
    const d = parseDetails("exercise", { ...ex, type: "training", commands: ["sit"], photos: [P1] }) as any;
    expect(d.commands).toEqual(["sit"]);
    expect(d.photos).toEqual([P1]);
  });

  it("describe counts them", () => {
    expect(describeEvent({ kind: "exercise", details: { ...ex, photos: [P1, P2] } }).detail).toContain("2 photos");
    expect(describeEvent({ kind: "exercise", details: { ...ex, photos: [P1] } }).detail).toContain("1 photo");
  });

  it("eventPhotos reads Health's, Fun's and Training's, and nothing else's", () => {
    expect(eventPhotos({ kind: "health", details: { type: "vet", reasons: ["other"], photos: [P1] } })).toEqual([P1]);
    expect(eventPhotos({ kind: "exercise", details: { ...ex, photos: [P2] } })).toEqual([P2]);
    expect(eventPhotos({ kind: "exercise", details: ex })).toEqual([]);
    expect(eventPhotos({ kind: "weight", details: { photos: [P1] } })).toEqual([]);
  });

  it("writeEvent refuses an exercise naming a photo that never uploaded, and saves one that did", async () => {
    const training = (photos: string[]) => ({ id: ID, kind: "exercise", details: { ...ex, photos } });
    const { db, events } = fakeDb([P1]);
    await expect(writeEvent(db, training([P1, P2]))).rejects.toThrow(/didn't finish uploading/);
    expect(events).toHaveLength(0);
    await writeEvent(db, training([P1]));
    expect(events).toHaveLength(1);
  });

  it("a treat queued from Training carries no photos", () => {
    const t = treatEntry({ id: ID2, item_id: "misc", amount: 1 }, "2026-10-25T12:00:00.000Z", null);
    expect((t.details as any).photos).toBeUndefined();
  });
});
