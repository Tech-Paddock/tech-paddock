// TEC-142: links to a medical issue, photos on Potty, the pills' status colours
// and the meal counter. "Today" is the phone's day, so pin the zone.
process.env.TZ = "America/New_York";

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { getServiceClient } from "@/lib/supabase";
import {
  CLOCKS,
  InvalidEvent,
  MEAL_RED_MS,
  MEAL_YELLOW_MS,
  POTTY_RED_MS,
  POTTY_YELLOW_MS,
  checkIssueTarget,
  describe as describeEvent,
  eventPhotos,
  issueChoices,
  issueLinkText,
  mealsToday,
  parseDetails,
  pillStatus,
  resolveIssue,
  sinceLast,
  type JournalEvent,
} from "@/lib/events";
import { writeEvent } from "@/lib/journal";

type SupabaseClient = ReturnType<typeof getServiceClient>;

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function ev(over: Partial<JournalEvent> & Pick<JournalEvent, "kind" | "at">): JournalEvent {
  return { id: uuid(), person_id: null, details: {}, note: null, voids: null, created_at: over.at, ...over };
}

const issue = (at: string, over: Partial<JournalEvent> = {}) =>
  ev({ kind: "health", at, details: { type: "issue", reasons: ["stomach-appetite"] }, note: "off his food", ...over });
const vet = (at: string, linked?: string) =>
  ev({ kind: "health", at, details: { type: "vet", reasons: ["checkup"], ...(linked ? { issue: linked } : {}) }, note: "x" });
const del = (target: JournalEvent) => ev({ kind: "void", at: "2026-10-26T12:00:00Z", voids: target.id });
const P1 = "health/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";

/** A local time in October 2026, as ISO. */
const local = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
const meal = (at: string, over: Partial<JournalEvent> = {}) =>
  ev({
    kind: "food",
    at,
    details: { type: "meal", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: null },
    ...over,
  });
const treat = (at: string) =>
  ev({
    kind: "food",
    at,
    details: { type: "treat", item_id: "misc", item_name: "Misc", kcal_per: null, unit: null, amount: null },
  });

/* ── Resolving a link ────────────────────────────────────────────────────── */

describe("resolveIssue — a link follows the voids chain to the live issue", () => {
  it("an issue nothing changed is itself", () => {
    const a = issue("2026-10-24T15:00:00Z");
    expect(resolveIssue([a], a.id)).toEqual({ state: "live", event: a });
  });

  it("corrected once: the correction", () => {
    const a = issue("2026-10-24T15:00:00Z");
    const b = issue("2026-10-24T15:00:00Z", { voids: a.id });
    expect(resolveIssue([a, b], a.id)).toEqual({ state: "live", event: b });
    expect(resolveIssue([a, b], b.id)).toEqual({ state: "live", event: b });
  });

  it("corrected twice: the newest copy, from either old id", () => {
    const a = issue("2026-10-24T15:00:00Z");
    const b = issue("2026-10-24T15:00:00Z", { voids: a.id });
    const c = issue("2026-10-24T15:00:00Z", { voids: b.id, details: { type: "issue", reasons: ["skin-ears-eyes"] } });
    expect(resolveIssue([a, b, c], a.id)).toEqual({ state: "live", event: c });
    expect(resolveIssue([c, b, a], b.id)).toEqual({ state: "live", event: c });
  });

  it("deleted: removed, also when it was corrected first", () => {
    const a = issue("2026-10-24T15:00:00Z");
    expect(resolveIssue([a, del(a)], a.id)).toEqual({ state: "removed" });
    const b = issue("2026-10-24T15:00:00Z", { voids: a.id });
    expect(resolveIssue([a, b, del(b)], a.id)).toEqual({ state: "removed" });
  });

  it("unknown: an id nothing read holds, or one that is not a Health issue", () => {
    const a = issue("2026-10-24T15:00:00Z");
    expect(resolveIssue([a], uuid())).toEqual({ state: "unknown" });
    expect(resolveIssue([], uuid())).toEqual({ state: "unknown" });
    const v = vet("2026-10-24T15:00:00Z");
    expect(resolveIssue([v], v.id)).toEqual({ state: "unknown" });
  });

  it("follows a correction whose original is older than the read", () => {
    const old = uuid(); // not in `events`: before the horizon
    const fix = issue("2026-09-01T15:00:00Z", { voids: old });
    expect(resolveIssue([fix], old)).toEqual({ state: "live", event: fix });
  });
});

describe("the feed's words for a link", () => {
  it("reads re: <pick>, <short date>", () => {
    const a = issue(local(24, 9));
    expect(issueLinkText([a], a.id)).toBe("re: Stomach & appetite, Oct 24");
    expect(describeEvent(vet(local(25, 9), a.id), [], [a]).detail).toBe("Check-up · re: Stomach & appetite, Oct 24");
  });

  it("follows a correction to its new pick and says removed issue after a delete", () => {
    const a = issue(local(24, 9));
    const b = issue(local(24, 9), { voids: a.id, details: { type: "issue", reasons: ["skin-ears-eyes"] } });
    expect(issueLinkText([a, b], a.id)).toBe("re: Skin, ears & eyes, Oct 24");
    expect(issueLinkText([a, b, del(b)], a.id)).toBe("removed issue");
  });

  it("says earlier issue for an id outside the read", () => {
    expect(issueLinkText([], uuid())).toBe("re: earlier issue");
  });

  it("is on a potty row too, ahead of its photo count", () => {
    const a = issue(local(24, 9));
    const p = ev({ kind: "potty", at: local(25, 8), details: { what: "poop", where: "inside", issue: a.id, photos: [P1] } });
    expect(describeEvent(p, [], [a]).detail).toBe("accident, inside · re: Stomach & appetite, Oct 24 · 1 photo");
  });

  it("adds nothing without a link", () => {
    expect(describeEvent(vet(local(25, 9))).detail).toBe("Check-up");
    expect(describeEvent(ev({ kind: "potty", at: local(25, 8), details: { what: "pee", where: "outside" } })).detail).toBe("outside");
  });
});

describe("issueChoices — the Related issue select", () => {
  it("lists live issues newest first, labelled by date and pick", () => {
    const a = issue(local(22, 9));
    const b = issue(local(24, 9), { details: { type: "issue", reasons: ["limping-injury"] } });
    expect(issueChoices([a, b, vet(local(25, 9))], null)).toEqual([
      { id: b.id, label: "Oct 24 · Limping or injury" },
      { id: a.id, label: "Oct 22 · Stomach & appetite" },
    ]);
  });

  it("lists the corrected copy, not the superseded one, and not a deleted issue", () => {
    const a = issue(local(22, 9));
    const b = issue(local(22, 9), { voids: a.id });
    const gone = issue(local(23, 9));
    expect(issueChoices([a, b, gone, del(gone)], null).map((c) => c.id)).toEqual([b.id]);
  });

  it("keeps a link to a superseded copy as the first option, labelled by the live version", () => {
    const a = issue(local(22, 9));
    const b = issue(local(22, 9), { voids: a.id, details: { type: "issue", reasons: ["skin-ears-eyes"] } });
    const out = issueChoices([a, b], a.id);
    expect(out[0]).toEqual({ id: a.id, label: "Oct 22 · Skin, ears & eyes" });
    expect(out.map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it("keeps a deleted or unknown link, in words", () => {
    const a = issue(local(22, 9));
    expect(issueChoices([a, del(a)], a.id)).toEqual([{ id: a.id, label: "Removed issue" }]);
    const lost = uuid();
    expect(issueChoices([], lost)).toEqual([{ id: lost, label: "Earlier issue" }]);
  });

  it("does not repeat a live link", () => {
    const a = issue(local(22, 9));
    expect(issueChoices([a], a.id)).toHaveLength(1);
  });
});

/* ── Writing a link ──────────────────────────────────────────────────────── */

describe("parseDetails — the link and Potty's photos", () => {
  const I = "11111111-1111-4111-8111-111111111111";
  it("potty takes an optional issue and photos, and drops neither silently", () => {
    expect(parseDetails("potty", { what: "poop", where: "inside", issue: I.toUpperCase(), photos: [P1, P1] })).toEqual({
      what: "poop",
      where: "inside",
      issue: I,
      photos: [P1],
    });
    expect(parseDetails("potty", { what: "pee", where: "outside" })).toEqual({ what: "pee", where: "outside" });
    expect(parseDetails("potty", { what: "pee", where: "outside", issue: null, photos: [] })).toEqual({ what: "pee", where: "outside" });
  });

  it("refuses a link that is not an id and a photo that is not one of ours", () => {
    expect(() => parseDetails("potty", { what: "pee", where: "outside", issue: "stomach" })).toThrow(InvalidEvent);
    expect(() => parseDetails("potty", { what: "pee", where: "outside", photos: ["../x.jpg"] })).toThrow(InvalidEvent);
  });

  it("a vet visit takes the link; a medical issue does not", () => {
    expect(parseDetails("health", { type: "vet", reasons: ["checkup"], issue: I })).toEqual({ type: "vet", reasons: ["checkup"], issue: I });
    expect(() => parseDetails("health", { type: "issue", reasons: ["skin-ears-eyes"], issue: I })).toThrow(/only a vet visit/);
  });

  it("eventPhotos reads a potty's", () => {
    expect(eventPhotos({ kind: "potty", details: { what: "pee", where: "outside", photos: [P1] } })).toEqual([P1]);
    expect(eventPhotos({ kind: "potty", details: { what: "pee", where: "outside" } })).toEqual([]);
  });
});

describe("checkIssueTarget", () => {
  it("accepts a Health issue, voided or not (the row is all it sees)", () => {
    expect(() => checkIssueTarget(issue("2026-10-24T15:00:00Z"))).not.toThrow();
  });
  it("refuses a missing row, a vet visit, any other kind", () => {
    expect(() => checkIssueTarget(null)).toThrow(InvalidEvent);
    expect(() => checkIssueTarget(vet("2026-10-24T15:00:00Z"))).toThrow(InvalidEvent);
    expect(() => checkIssueTarget(ev({ kind: "potty", at: "2026-10-24T15:00:00Z", details: { what: "pee", where: "outside" } }))).toThrow(InvalidEvent);
  });
});

type Row = Record<string, any>;

/** The few calls writeEvent makes, over an in-memory events table. Every photo is "stored". */
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
  const storage = {
    from: () => ({
      createSignedUrls: async (paths: string[]) => ({
        data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null })),
        error: null,
      }),
    }),
  };
  return { db: { from: builder, storage } as unknown as SupabaseClient, events };
}

describe("writeEvent — the link must be a Health issue", () => {
  const ISSUE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
  const VET_ID = "aaaaaaaa-0000-4000-8000-000000000002";
  const seeded = () => [
    { id: ISSUE_ID, kind: "health", at: "2026-10-24T15:00:00Z", details: { type: "issue", reasons: ["limping-injury"] }, voids: null },
    { id: VET_ID, kind: "health", at: "2026-10-25T15:00:00Z", details: { type: "vet", reasons: ["checkup"] }, voids: null },
  ];
  const potty = (id: string, issueId: string) => ({ id, kind: "potty", details: { what: "poop", where: "inside", issue: issueId } });
  const visit = (id: string, issueId: string) => ({
    id,
    kind: "health",
    details: { type: "vet", reasons: ["follow-up"], issue: issueId },
    note: "recheck",
  });

  it("saves a vet visit and a potty linked to an issue", async () => {
    const { db, events } = fakeDb(seeded());
    await writeEvent(db, visit("bbbbbbbb-0000-4000-8000-000000000001", ISSUE_ID));
    await writeEvent(db, potty("bbbbbbbb-0000-4000-8000-000000000002", ISSUE_ID));
    expect(events.filter((e) => (e.details as any).issue === ISSUE_ID)).toHaveLength(2);
  });

  it("saves a link to a superseded copy: voided ids count", async () => {
    const seed = [
      ...seeded(),
      { id: "aaaaaaaa-0000-4000-8000-000000000003", kind: "health", at: "2026-10-24T15:00:00Z", details: { type: "issue", reasons: ["skin-ears-eyes"] }, voids: ISSUE_ID },
    ];
    const { db, events } = fakeDb(seed);
    await writeEvent(db, potty("bbbbbbbb-0000-4000-8000-000000000004", ISSUE_ID));
    expect(events.at(-1)?.details.issue).toBe(ISSUE_ID);
  });

  it("refuses an id that is not there, a vet visit's id, and a non-health id", async () => {
    const { db, events } = fakeDb(seeded());
    const before = events.length;
    await expect(writeEvent(db, potty("bbbbbbbb-0000-4000-8000-000000000005", "cccccccc-0000-4000-8000-000000000009"))).rejects.toThrow(/medical issue/);
    await expect(writeEvent(db, visit("bbbbbbbb-0000-4000-8000-000000000006", VET_ID))).rejects.toThrow(/medical issue/);
    expect(events).toHaveLength(before);
  });

  it("saves a potty with a photo that is in storage", async () => {
    const { db, events } = fakeDb(seeded());
    await writeEvent(db, { id: "bbbbbbbb-0000-4000-8000-000000000007", kind: "potty", details: { what: "pee", where: "outside", photos: [P1] } });
    expect((events.at(-1)?.details as any).photos).toEqual([P1]);
  });
});

/* ── Status colours ──────────────────────────────────────────────────────── */

const MIN = 60_000;

describe("pillStatus — pee and poop", () => {
  it("green under 1 h; yellow from exactly 1 h to exactly 3 h; red over 3 h", () => {
    for (const c of ["pee", "poop"] as const) {
      expect(pillStatus(c, 0)).toBe("green");
      expect(pillStatus(c, POTTY_YELLOW_MS - 1)).toBe("green");
      expect(pillStatus(c, POTTY_YELLOW_MS)).toBe("yellow");
      expect(pillStatus(c, POTTY_RED_MS)).toBe("yellow");
      expect(pillStatus(c, POTTY_RED_MS + 1)).toBe("red");
      expect(pillStatus(c, 20 * 60 * MIN)).toBe("red");
    }
  });
  it("the thresholds are 1 h and 3 h", () => {
    expect(POTTY_YELLOW_MS).toBe(60 * MIN);
    expect(POTTY_RED_MS).toBe(180 * MIN);
  });
});

describe("pillStatus — food", () => {
  it("green under 3 h; yellow from 3 h; red at 5 h or more", () => {
    expect(pillStatus("food", MEAL_YELLOW_MS - 1)).toBe("green");
    expect(pillStatus("food", MEAL_YELLOW_MS)).toBe("yellow");
    expect(pillStatus("food", MEAL_RED_MS - 1)).toBe("yellow");
    expect(pillStatus("food", MEAL_RED_MS)).toBe("red");
  });
  it("the thresholds are 3 h and 5 h", () => {
    expect(MEAL_YELLOW_MS).toBe(180 * MIN);
    expect(MEAL_RED_MS).toBe(300 * MIN);
  });
});

describe("pillStatus — what stays plain", () => {
  it("exercise is never coloured, and none is neutral", () => {
    expect(pillStatus("exercise", 0)).toBeNull();
    expect(pillStatus("exercise", 99 * 60 * MIN)).toBeNull();
    for (const c of CLOCKS) expect(pillStatus(c, null)).toBeNull();
  });
  it("a time in the future reads as green, never as an error", () => {
    expect(pillStatus("pee", -5 * MIN)).toBe("green");
  });
});

describe("the food clock is the last meal", () => {
  const NOW = new Date(2026, 9, 26, 15, 0);
  it("ignores treats: a later treat does not reset it", () => {
    const m = meal(local(26, 9));
    const t = treat(local(26, 14));
    expect(sinceLast([m, t], NOW).food).toBe(m);
  });
  it("is none when only treats were logged", () => {
    expect(sinceLast([treat(local(26, 14))], NOW).food).toBeNull();
  });
});

/* ── Meals today ─────────────────────────────────────────────────────────── */

describe("mealsToday", () => {
  const NOW = new Date(2026, 9, 26, 15, 0);
  it("counts the phone's local day, edge to edge", () => {
    const events = [
      meal(local(25, 23, 59)), // yesterday
      meal(local(26, 0, 0)), // midnight starts today
      meal(local(26, 8)),
      meal(local(26, 18)),
      meal(local(26, 23, 59)),
      meal(local(27, 0, 0)), // tomorrow
    ];
    expect(mealsToday(events, NOW)).toBe(4);
  });
  it("does not count treats, voided or deleted meals, or other kinds", () => {
    const wrong = meal(local(26, 9));
    const fixed = meal(local(26, 9), { voids: wrong.id });
    const gone = meal(local(26, 10));
    const events = [wrong, fixed, gone, del(gone), treat(local(26, 11)), issue(local(26, 12))];
    expect(mealsToday(events, NOW)).toBe(1);
  });
  it("is 0 for an empty day", () => {
    expect(mealsToday([], NOW)).toBe(0);
  });
  it("uses the phone's day: a late-evening meal is still today where UTC says tomorrow", () => {
    const lateEvening = meal(new Date(2026, 9, 26, 22, 30).toISOString()); // 02:30Z the next day
    expect(mealsToday([lateEvening], new Date(2026, 9, 26, 23, 0))).toBe(1);
  });
});

/* ── The migration ───────────────────────────────────────────────────────── */

describe("migration lando_issue_links", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_lando_issue_links.sql"));
  const sql = readFileSync(resolve(dir, file!), "utf8");
  const code = sql.replace(/--.*$/gm, "");
  const fn = sql.slice(sql.indexOf("create or replace function lando.details_ok(kind"), sql.indexOf("$fn$;"));
  const block = (from: string, to: string) => fn.slice(fn.indexOf(from), fn.indexOf(to));

  it("exists, and defines the function (a newer widening, like lando_vet_weight, may follow it)", () => {
    // Was "the newest file defining the function" until TEC-151 added a newer
    // widening. The newest file's own shape is held by its test (vetweight.test.ts).
    expect(file).toBeDefined();
    const defining = readdirSync(dir)
      .filter((f) => readFileSync(resolve(dir, f), "utf8").includes("create or replace function lando.details_ok(kind"))
      .sort();
    expect(defining).toContain(file);
    expect(defining.at(-1)! >= file!).toBe(true);
  });
  it("widens potty with issue and photos, and health with a vet-only issue", () => {
    const potty = block("WHEN 'potty' THEN", "WHEN 'food' THEN");
    expect(potty).toContain("ARRAY['what', 'where', 'leash', 'issue', 'photos']");
    expect(potty).toContain("jsonb_array_length(details -> 'photos') BETWEEN 1 AND 6");
    expect(potty).toContain("details ->> 'issue' ~*");
    const health = block("WHEN 'health' THEN", "WHEN 'void' THEN");
    expect(health).toContain("ARRAY['type', 'reasons', 'photos', 'issue']");
    expect(health).toMatch(/details \? 'issue' THEN\s+details ->> 'type' = 'vet'/);
  });
  it("is only lock_timeout and the function: no DROP, no ALTER", () => {
    expect(code.trim().startsWith("set local lock_timeout = '5s';")).toBe(true);
    const statements = code.replace(/\$fn\$[\s\S]*?\$fn\$/, "$fn$").split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(code).not.toMatch(/\b(drop|alter|truncate|delete|update|insert)\b/i);
  });
  it("keeps every other branch as it was", () => {
    const prev = readFileSync(resolve(dir, readdirSync(dir).find((f) => f.endsWith("_lando_health_picklist.sql"))!), "utf8");
    const prevFn = prev.slice(prev.indexOf("create or replace function lando.details_ok(kind"), prev.indexOf("$fn$;"));
    for (const [from, to] of [["WHEN 'food' THEN", "WHEN 'exercise' THEN"], ["WHEN 'exercise' THEN", "WHEN 'weight' THEN"], ["WHEN 'weight' THEN", "WHEN 'health' THEN"]]) {
      expect(block(from, to)).toBe(prevFn.slice(prevFn.indexOf(from), prevFn.indexOf(to)));
    }
  });
});
