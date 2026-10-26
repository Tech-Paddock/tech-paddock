// TEC-151: a vet visit's Weight field, saved as a linked weight entry.
// Days are the phone's, so pin the zone.
process.env.TZ = "America/New_York";

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { getServiceClient } from "@/lib/supabase";
import {
  InvalidEvent,
  checkVisitTarget,
  describe as describeEvent,
  followText,
  growthPoints,
  latestWeight,
  linkedWeight,
  parseDetails,
  parseNewEvent,
  resolveVisit,
  visitWeightPlan,
  type JournalEvent,
} from "@/lib/events";
import { writeEvent } from "@/lib/journal";
import { saveThen } from "@/lib/saveOrder";

type SupabaseClient = ReturnType<typeof getServiceClient>;

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function ev(over: Partial<JournalEvent> & Pick<JournalEvent, "kind" | "at">): JournalEvent {
  return { id: uuid(), person_id: null, details: {}, note: null, voids: null, created_at: over.at, ...over };
}

const local = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
const visit = (at: string, over: Partial<JournalEvent> = {}) =>
  ev({ kind: "health", at, details: { type: "vet", reasons: ["checkup"] }, note: "x", ...over });
const issue = (at: string) =>
  ev({ kind: "health", at, details: { type: "issue", reasons: ["stomach-appetite"] }, note: "x" });
const weightFor = (visitId: string | undefined, value = 7.6, unit: "lb" | "kg" = "lb", over: Partial<JournalEvent> = {}) =>
  ev({
    kind: "weight",
    at: local(25, 12),
    details: { value, unit, ...(visitId ? { visit: visitId } : {}) },
    ...over,
  });
const del = (target: JournalEvent) => ev({ kind: "void", at: local(26, 12), voids: target.id });

/* ── Resolving the link ──────────────────────────────────────────────────── */

describe("resolveVisit — a weight's link follows the voids chain to the live visit", () => {
  it("a visit nothing changed is itself; corrected, its newest copy from any old id", () => {
    const a = visit(local(25, 9));
    expect(resolveVisit([a], a.id)).toEqual({ state: "live", event: a });
    const b = visit(local(25, 9), { voids: a.id });
    const c = visit(local(25, 9), { voids: b.id, details: { type: "vet", reasons: ["follow-up"] } });
    expect(resolveVisit([a, b, c], a.id)).toEqual({ state: "live", event: c });
    expect(resolveVisit([c, b, a], b.id)).toEqual({ state: "live", event: c });
  });

  it("deleted: removed, also when it was corrected first", () => {
    const a = visit(local(25, 9));
    expect(resolveVisit([a, del(a)], a.id)).toEqual({ state: "removed" });
    const b = visit(local(25, 9), { voids: a.id });
    expect(resolveVisit([a, b, del(b)], a.id)).toEqual({ state: "removed" });
  });

  it("unknown: an id nothing read holds, or one that is not a vet visit", () => {
    expect(resolveVisit([], uuid())).toEqual({ state: "unknown" });
    const i = issue(local(24, 9));
    expect(resolveVisit([i], i.id)).toEqual({ state: "unknown" });
    const w = weightFor(undefined);
    expect(resolveVisit([w], w.id)).toEqual({ state: "unknown" });
  });

  it("follows a correction whose original is older than the read", () => {
    const old = uuid();
    const fix = visit(local(25, 9), { voids: old });
    expect(resolveVisit([fix], old)).toEqual({ state: "live", event: fix });
  });
});

describe("linkedWeight — the weight a visit shows", () => {
  it("finds the live weight naming the visit, or any older copy of it", () => {
    const a = visit(local(25, 9));
    const w = weightFor(a.id);
    expect(linkedWeight([a, w], a.id)?.id).toBe(w.id);
    const b = visit(local(25, 9), { voids: a.id });
    expect(linkedWeight([a, b, w], b.id)?.id).toBe(w.id); // the weight still names the old id
    expect(linkedWeight([a, b, w], a.id)).toBeNull(); // a is superseded: only the live visit has a weight
  });

  it("is null for a visit with none, and ignores a weight with no link or another visit's", () => {
    const a = visit(local(25, 9));
    const other = visit(local(20, 9));
    expect(linkedWeight([a, other, weightFor(undefined), weightFor(other.id)], a.id)).toBeNull();
  });

  it("a weight corrected or deleted from the Weight form: the live copy, or none", () => {
    const a = visit(local(25, 9));
    const w = weightFor(a.id);
    const w2 = weightFor(a.id, 7.8, "lb", { voids: w.id }); // the Weight form keeps `visit`
    expect(linkedWeight([a, w, w2], a.id)?.id).toBe(w2.id);
    expect(linkedWeight([a, w, w2, del(w2)], a.id)).toBeNull();
  });

  it("deleting the visit leaves the weight, in the growth chart and on the Weight button", () => {
    const a = visit(local(25, 9));
    const w = weightFor(a.id);
    const events = [a, w, del(a)];
    expect(linkedWeight(events, a.id)).toBeNull();
    expect(growthPoints(events)).toHaveLength(1);
    expect(latestWeight(events)?.id).toBe(w.id);
    expect(resolveVisit(events, a.id)).toEqual({ state: "removed" });
  });
});

describe("the feed's vet line", () => {
  it("shows the linked weight after the reason: Check-up · 7.6 lb", () => {
    const a = visit(local(25, 9));
    const w = weightFor(a.id);
    expect(describeEvent(a, [], [a, w])).toEqual({ title: "Vet visit", detail: "Check-up · 7.6 lb" });
  });

  it("follows a correction of the visit, and a replaced weight", () => {
    const a = visit(local(25, 9));
    const w = weightFor(a.id, 7.6);
    const b = visit(local(25, 9), { voids: a.id });
    const w2 = weightFor(b.id, 8, "kg", { voids: w.id });
    expect(describeEvent(b, [], [a, w, b, w2]).detail).toBe("Check-up · 8 kg");
  });

  it("reads as before with no weight, no events, or on a medical issue", () => {
    const a = visit(local(25, 9));
    expect(describeEvent(a, [], [a]).detail).toBe("Check-up");
    expect(describeEvent(a).detail).toBe("Check-up");
    const i = issue(local(25, 9));
    expect(describeEvent(i, [], [i, weightFor(i.id)]).detail).toBe("Stomach & appetite");
  });
});

/* ── Parsing, and the server's check ─────────────────────────────────────── */

describe("parseDetails — a weight's visit", () => {
  const V = "aaaaaaaa-0000-4000-8000-000000000001";
  it("takes an optional visit, lowercased, and none is no key", () => {
    expect(parseDetails("weight", { value: 7, unit: "lb", visit: V.toUpperCase() })).toEqual({ value: 7, unit: "lb", visit: V });
    expect(parseDetails("weight", { value: 7, unit: "lb" })).toEqual({ value: 7, unit: "lb" });
    expect(parseDetails("weight", { value: 7, unit: "lb", visit: null })).toEqual({ value: 7, unit: "lb" });
  });
  it("refuses a visit that is not an id", () => {
    expect(() => parseDetails("weight", { value: 7, unit: "lb", visit: "tuesday" })).toThrow(InvalidEvent);
  });
  it("parseNewEvent carries it through", () => {
    const e = parseNewEvent({ id: uuid(), kind: "weight", at: local(25, 12), details: { value: 7, unit: "kg", visit: V } }, new Date());
    expect(e.details).toEqual({ value: 7, unit: "kg", visit: V });
  });
});

describe("checkVisitTarget", () => {
  it("accepts a vet visit, voided or not (the row is all it sees)", () => {
    expect(() => checkVisitTarget(visit(local(25, 9)))).not.toThrow();
  });
  it("refuses a missing row, a medical issue, any other kind", () => {
    expect(() => checkVisitTarget(null)).toThrow(InvalidEvent);
    expect(() => checkVisitTarget(issue(local(25, 9)))).toThrow(InvalidEvent);
    expect(() => checkVisitTarget(weightFor(undefined))).toThrow(InvalidEvent);
  });
});

type Row = Record<string, any>;

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
  return { db: { from: builder } as unknown as SupabaseClient, events };
}

describe("writeEvent — a weight's visit must be a vet visit", () => {
  const VET = "aaaaaaaa-0000-4000-8000-000000000001";
  const ISSUE = "aaaaaaaa-0000-4000-8000-000000000002";
  const OLD = "aaaaaaaa-0000-4000-8000-000000000003";
  const seeded = () => [
    { id: VET, kind: "health", at: "2026-10-25T15:00:00Z", details: { type: "vet", reasons: ["checkup"] }, voids: null },
    { id: ISSUE, kind: "health", at: "2026-10-24T15:00:00Z", details: { type: "issue", reasons: ["limping-injury"] }, voids: null },
    // a superseded copy of a vet visit
    { id: OLD, kind: "health", at: "2026-10-23T15:00:00Z", details: { type: "vet", reasons: ["checkup"] }, voids: null },
    { id: "aaaaaaaa-0000-4000-8000-000000000004", kind: "health", at: "2026-10-23T15:00:00Z", details: { type: "vet", reasons: ["follow-up"] }, voids: OLD },
  ];
  const weight = (id: string, visitId: string) => ({
    id,
    kind: "weight",
    at: "2026-10-25T16:00:00.000Z",
    details: { value: 7.6, unit: "lb", visit: visitId },
  });

  it("saves a weight naming a vet visit, and one naming a superseded copy", async () => {
    const { db, events } = fakeDb(seeded());
    await writeEvent(db, weight("bbbbbbbb-0000-4000-8000-000000000001", VET));
    await writeEvent(db, weight("bbbbbbbb-0000-4000-8000-000000000002", OLD));
    expect(events.filter((e) => e.kind === "weight")).toHaveLength(2);
  });

  it("refuses an id that is not there, a medical issue's id, and a non-health id", async () => {
    const { db, events } = fakeDb(seeded());
    const before = events.length;
    await expect(writeEvent(db, weight("bbbbbbbb-0000-4000-8000-000000000003", "cccccccc-0000-4000-8000-000000000009"))).rejects.toThrow(/vet visit/);
    await expect(writeEvent(db, weight("bbbbbbbb-0000-4000-8000-000000000004", ISSUE))).rejects.toThrow(/vet visit/);
    const w = "bbbbbbbb-0000-4000-8000-000000000005";
    await writeEvent(db, { id: w, kind: "weight", at: "2026-10-25T16:00:00.000Z", details: { value: 7, unit: "lb" } });
    await expect(writeEvent(db, weight("bbbbbbbb-0000-4000-8000-000000000006", w))).rejects.toThrow(/vet visit/);
    expect(events).toHaveLength(before + 1);
  });

  it("an ordinary weight needs no visit", async () => {
    const { db, events } = fakeDb(seeded());
    await writeEvent(db, { id: "bbbbbbbb-0000-4000-8000-000000000007", kind: "weight", at: "2026-10-25T16:00:00.000Z", details: { value: 7, unit: "kg" } });
    expect(events.at(-1)?.details).toEqual({ value: 7, unit: "kg" });
  });
});

/* ── What Save adds, and the order ───────────────────────────────────────── */

describe("visitWeightPlan — a new visit", () => {
  const visitId = uuid();
  const weightId = uuid();
  const person = uuid();
  const plan = (typed: string, over: Partial<Parameters<typeof visitWeightPlan>[0]> = {}) =>
    visitWeightPlan({ typed, unit: "lb", linked: null, weightId, visitId, visitAt: local(25, 9, 30), personId: person, ...over });

  it("a blank field adds nothing", () => {
    expect(plan("")).toEqual([]);
    expect(plan("   ")).toEqual([]);
  });

  it("a filled one is a weight at local noon of the visit's day, naming the visit, by the visit's person", () => {
    const [w] = plan("7.6");
    expect(w).toEqual({
      id: weightId,
      kind: "weight",
      at: local(25, 12),
      person_id: person,
      details: { value: 7.6, unit: "lb", visit: visitId },
      note: null,
    });
    expect(w.voids).toBeUndefined();
  });

  it("the day is the visit's local day, also late in the evening", () => {
    const [w] = plan("7", { visitAt: local(25, 23, 45) });
    expect(w.at).toBe(local(25, 12));
  });

  it("takes a comma and either unit; refuses what the Weight form refuses", () => {
    expect(plan("7,6", { unit: "kg" })[0].details).toEqual({ value: 7.6, unit: "kg", visit: visitId });
    expect(() => plan("abc")).toThrow(InvalidEvent);
    expect(() => plan("0")).toThrow(InvalidEvent);
    expect(() => plan("-3")).toThrow(InvalidEvent);
    expect(() => plan("200")).toThrow(InvalidEvent);
  });

  it("the entry passes the same parse the server makes", () => {
    const [w] = plan("7.6");
    expect(() => parseNewEvent(w, new Date())).not.toThrow();
  });
});

describe("visitWeightPlan — a correction of a visit with a weight", () => {
  const oldVisit = visit(local(25, 9));
  const oldWeight = weightFor(oldVisit.id, 7.6, "lb", { person_id: uuid(), note: "on the clinic scale" });
  const newVisitId = uuid();
  const weightId = uuid();
  const plan = (typed: string, unit: "lb" | "kg" = "lb") =>
    visitWeightPlan({ typed, unit, linked: oldWeight, weightId, visitId: newVisitId, visitAt: local(25, 9), personId: null });

  it("unchanged: nothing is saved, and the link follows the correction by itself", () => {
    expect(plan("7.6")).toEqual([]);
    const corrected = visit(local(25, 9), { id: newVisitId, voids: oldVisit.id });
    expect(linkedWeight([oldVisit, oldWeight, corrected], newVisitId)?.id).toBe(oldWeight.id);
  });

  it("changed: voids and replaces that weight, pointing at the corrected visit's new id, no second weight", () => {
    const [w] = plan("7.9");
    expect(w.voids).toBe(oldWeight.id);
    expect(w.details).toEqual({ value: 7.9, unit: "lb", visit: newVisitId });
    expect(w.note).toBe("on the clinic scale");
    // Applied to what the screen holds, the visit still shows exactly one weight.
    const corrected = visit(local(25, 9), { id: newVisitId, voids: oldVisit.id });
    const saved = ev({ ...(w as any), created_at: local(26, 9) });
    const events = [oldVisit, oldWeight, corrected, saved];
    expect(linkedWeight(events, newVisitId)?.id).toBe(saved.id);
    expect(growthPoints(events)).toHaveLength(1);
    expect(describeEvent(corrected, [], events).detail).toBe("Check-up · 7.9 lb");
  });

  it("a changed unit alone is a change", () => {
    const [w] = plan("7.6", "kg");
    expect(w.voids).toBe(oldWeight.id);
    expect(w.details).toEqual({ value: 7.6, unit: "kg", visit: newVisitId });
  });

  it("a blank field is refused: a weight that was measured is deleted from the feed", () => {
    expect(() => plan("")).toThrow(/delete that weight from the feed/);
  });

  it("the replacement is accepted by the server's own checks, as a correction of the weight", () => {
    const [w] = plan("7.9");
    const parsed = parseNewEvent(w, new Date());
    expect(parsed.voids).toBe(oldWeight.id);
    expect(parsed.kind).toBe("weight");
  });
});

describe("followText — what a failed row carries", () => {
  const w = { kind: "weight" as const, details: { value: 7.64, unit: "lb" } };
  const t = { kind: "food" as const, details: {} };
  it("says the weight, so the row shows it", () => {
    expect(followText([w])).toBe("+ 7.6 lb");
  });
  it("still says treats the way it did", () => {
    expect(followText([t])).toBe("+ 1 treat");
    expect(followText([t, t])).toBe("+ 2 treats");
    expect(followText([])).toBe("");
  });
});

describe("saveThen — the visit first, its weight after it", () => {
  const run = () => {
    const calls: string[] = [];
    let fail = new Set<string>();
    const saveOne = async (b: string) => {
      calls.push(`save ${b}`);
      return !fail.has(b);
    };
    const saveNext = (b: string) => void calls.push(`next ${b}`);
    return { calls, saveOne, saveNext, failing: (...ids: string[]) => (fail = new Set(ids)) };
  };

  it("saves the weight only after the visit has", async () => {
    const r = run();
    expect(await saveThen(r.saveOne, r.saveNext, "visit", ["weight"])).toBe(true);
    expect(r.calls).toEqual(["save visit", "next weight"]);
  });

  it("a visit that fails saves no weight; Retry (the same call) saves both; the weight is never first", async () => {
    const r = run();
    r.failing("visit");
    expect(await saveThen(r.saveOne, r.saveNext, "visit", ["weight"])).toBe(false);
    expect(r.calls).toEqual(["save visit"]); // no weight is logged for a visit that never saved
    r.failing();
    expect(await saveThen(r.saveOne, r.saveNext, "visit", ["weight"])).toBe(true);
    expect(r.calls).toEqual(["save visit", "save visit", "next weight"]);
  });

  it("an entry with nothing after it saves alone", async () => {
    const r = run();
    expect(await saveThen(r.saveOne, r.saveNext, "visit")).toBe(true);
    expect(r.calls).toEqual(["save visit"]);
  });
});

describe("the screen keeps a visit's weight with its row (source checks; there is no DOM test)", () => {
  const journal = readFileSync(resolve(__dirname, "../app/Journal.tsx"), "utf8");
  const form = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");

  it("the pending row is mirrored to lando.unsaved with its followers, and Retry and ✕ carry them", () => {
    expect(journal).toContain("p.then?.length ? { ...p.body, then: p.then } : p.body");
    expect(journal).toContain("void save(p.body, true, p.then)");
    expect(journal).toContain("followText(p.then)");
    expect(journal).toContain("saveThen(");
  });

  it("the form saves the weight through the plan, only for a vet visit, after the visit", () => {
    expect(form).toContain('kind === "health" && healthType === "vet"');
    expect(form).toContain("visitWeightPlan({");
    expect(form).toContain("onLog(body, then)");
    expect(form).toContain("onChange({ ...body, voids: event.id }, then)");
  });

  it("the field opens empty in the phone's last unit on a new visit", () => {
    expect(form).toContain('useState(linked ? String(asWeight(linked).value) : "")');
    expect(form).toContain("remembered.unit ?? weightUnit");
  });
});

/* ── The migration ───────────────────────────────────────────────────────── */

describe("migration lando_vet_weight", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const file = files.find((f) => f.endsWith("_lando_vet_weight.sql"));
  const read = (f: string) => readFileSync(resolve(dir, f), "utf8");
  const fnOf = (sql: string) => sql.slice(sql.indexOf("create or replace function lando.details_ok(kind"), sql.indexOf("$fn$;"));
  const block = (fn: string, from: string, to: string) => fn.slice(fn.indexOf(from), fn.indexOf(to));

  it("exists, and is the newest file defining the function (or a later widening follows it)", () => {
    expect(file).toBeDefined();
    const defining = files.filter((f) => read(f).includes("create or replace function lando.details_ok(kind")).sort();
    expect(defining).toContain(file);
    expect(defining.at(-1)! >= file!).toBe(true);
    // It sorts after the migration it widens.
    expect(file! > files.find((f) => f.endsWith("_lando_issue_links.sql"))!).toBe(true);
  });

  it("widens weight with an optional visit uuid, and nothing else in the weight branch", () => {
    const fn = fnOf(read(file!));
    const w = block(fn, "WHEN 'weight' THEN", "WHEN 'health' THEN");
    expect(w).toContain("ARRAY['value', 'unit', 'visit']");
    expect(w).toMatch(/details \? 'visit' THEN\s+jsonb_typeof\(details -> 'visit'\) = 'string'/);
    expect(w).toContain("details ->> 'visit' ~*");
    expect(w).toContain("(details ->> 'value')::numeric > 0 AND (details ->> 'value')::numeric < 200");
    expect(w).toContain("details ->> 'unit' IN ('lb', 'kg')");
  });

  it("is only lock_timeout and the function: no DROP, no ALTER", () => {
    const code = read(file!).replace(/--.*$/gm, "");
    expect(code.trim().startsWith("set local lock_timeout = '5s';")).toBe(true);
    const statements = code.replace(/\$fn\$[\s\S]*?\$fn\$/, "$fn$").split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(statements[1]).toMatch(/^create or replace function lando\.details_ok/);
    expect(code).not.toMatch(/\b(drop|alter|truncate|delete|update|insert)\b/i);
  });

  it("keeps every other branch exactly as lando_issue_links had it", () => {
    const prev = fnOf(read(files.find((f) => f.endsWith("_lando_issue_links.sql"))!));
    const now = fnOf(read(file!));
    for (const [from, to] of [
      ["WHEN 'potty' THEN", "WHEN 'food' THEN"],
      ["WHEN 'food' THEN", "WHEN 'exercise' THEN"],
      ["WHEN 'exercise' THEN", "WHEN 'weight' THEN"],
      ["WHEN 'health' THEN", "WHEN 'void' THEN"],
    ]) {
      expect(block(now, from, to)).toBe(block(prev, from, to));
    }
    expect(now.slice(0, now.indexOf("WHEN 'potty' THEN"))).toBe(prev.slice(0, prev.indexOf("WHEN 'potty' THEN")));
    expect(now.slice(now.indexOf("WHEN 'void' THEN"))).toBe(prev.slice(prev.indexOf("WHEN 'void' THEN")));
  });

  it("a weight's visit is in the code and the function alike (a value in the app alone fails every save)", () => {
    const events = readFileSync(resolve(__dirname, "../lib/events.ts"), "utf8");
    expect(events).toContain("visit?: string");
    expect(events).toContain("out.visit = visit");
    expect(fnOf(read(file!))).toContain("'visit'");
  });
});
