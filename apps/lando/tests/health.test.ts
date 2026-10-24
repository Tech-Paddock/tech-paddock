import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { getServiceClient } from "@/lib/supabase";
import {
  FORM_KINDS,
  FORM_LABELS,
  ISSUE_PICKS,
  InvalidEvent,
  LOG_KINDS,
  MAX_PHOTOS,
  PHOTO_PATH,
  VET_REASONS,
  describe as describeEvent,
  feedDays,
  formOf,
  kindOfForm,
  liveEvents,
  parseDetails,
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
  it("takes a vet visit with several reasons, kept in the list's order, once each", () => {
    const d = parseDetails("health", { type: "vet", reasons: ["dental", "vaccines", "dental", "checkup"] });
    expect(d).toEqual({ type: "vet", reasons: ["checkup", "vaccines", "dental"] });
  });

  it("takes a medical issue from its own list", () => {
    expect(parseDetails("health", { type: "issue", reasons: ["wound", "limping"] })).toEqual({
      type: "issue",
      reasons: ["limping", "wound"],
    });
  });

  it("refuses a reason from the other type's list, an unknown one, and none at all", () => {
    expect(() => parseDetails("health", { type: "vet", reasons: ["vomiting"] })).toThrow(InvalidEvent);
    expect(() => parseDetails("health", { type: "issue", reasons: ["vaccines"] })).toThrow(InvalidEvent);
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

  it("match the issue's agreed picks", () => {
    expect(VET_REASONS.map(([, l]) => l)).toEqual([
      "Wellness check-up",
      "Vaccines",
      "Deworming / fecal test",
      "Flea, tick & heartworm",
      "Spay / neuter",
      "Dental",
      "Microchip",
      "Sick visit",
      "Injury",
      "Skin or ears",
      "Stomach upset",
      "Recheck / follow-up",
      "Other",
    ]);
    expect(ISSUE_PICKS.map(([, l]) => l)).toEqual([
      "Vomiting",
      "Diarrhea",
      "Limping",
      "Itching / skin",
      "Ear",
      "Eye",
      "Cough / sneeze",
      "Not eating",
      "Low energy",
      "Cut / wound",
      "Ate something",
      "Other",
    ]);
  });

  const dir = resolve(__dirname, "../../../supabase/migrations");
  const migration = () => {
    const file = readdirSync(dir).find((f) => f.endsWith("_lando_health_events.sql"));
    expect(file).toBeDefined();
    return readFileSync(resolve(dir, file!), "utf8");
  };

  it("are the same lists lando.details_ok holds (a value in the app alone fails every save)", () => {
    const sql = migration();
    // Read from the function body, not the header comments.
    const start = sql.indexOf("create or replace function lando.details_ok(kind");
    expect(start).toBeGreaterThan(0);
    const fn = sql.slice(start, sql.indexOf("$fn$;", start));
    const quoted = (ids: readonly string[]) => `[${ids.map((id) => `"${id}"`).join(", ")}]`;
    expect(fn).toContain(quoted(VET_REASONS.map(([id]) => id)));
    expect(fn).toContain(quoted(ISSUE_PICKS.map(([id]) => id)));
    expect(fn).toContain(`BETWEEN 1 AND ${MAX_PHOTOS}`);
    expect(fn).toContain("WHEN 'health' THEN");
    // The path pattern in the function is the code's, with the dot as [.] for jsonpath.
    expect(fn).toContain(PHOTO_PATH.source.replace(/\\\//g, "/").replace("\\.", "[.]"));
  });

  it("the migration can apply through the connector: fails fast, and drops no table, column or function", () => {
    const code = migration().replace(/--.*$/gm, "");
    expect(code.trimStart().startsWith("set local lock_timeout = '5s';")).toBe(true);
    expect(code).not.toMatch(/drop\s+(table|column|function|schema)/i);
    expect(code).toMatch(/CHECK \(lando\.details_ok\(kind, details\)\)/);
  });
});

describe("describe — health", () => {
  it("titles by type and lists the reasons by label, with a photo count", () => {
    expect(describeEvent({ kind: "health", details: { type: "vet", reasons: ["checkup", "vaccines"] } })).toEqual({
      title: "Vet visit",
      detail: "Wellness check-up, Vaccines",
    });
    expect(describeEvent({ kind: "health", details: { type: "issue", reasons: ["wound"], photos: [P1] } })).toEqual({
      title: "Medical issue",
      detail: "Cut / wound · 1 photo",
    });
    expect(describeEvent({ kind: "health", details: { type: "issue", reasons: ["eye", "ear"], photos: [P1, P2] } }).detail).toBe(
      "Eye, Ear · 2 photos"
    );
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
  const body = (photos: string[], id = ID) => ({ id, kind: "health", details: { type: "issue", reasons: ["wound"], photos } });

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
    await writeEvent(db, { id: ID, kind: "health", details: { type: "vet", reasons: ["checkup"] } });
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
