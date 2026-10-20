import { describe, expect, it } from "vitest";
import {
  InvalidEvent,
  checkVoid,
  correctionAt,
  describe as describeEvent,
  displayUnit,
  formatAgo,
  growthPoints,
  liveEvents,
  parseNewEvent,
  sinceLast,
  type JournalEvent,
} from "@/lib/events";

// Invented ids. Nothing here is a real person or a real dog's record.
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function ev(over: Partial<JournalEvent> & Pick<JournalEvent, "kind" | "at">): JournalEvent {
  return {
    id: uuid(),
    person_id: null,
    details: {},
    note: null,
    voids: null,
    created_at: over.at,
    ...over,
  };
}

const NOW = new Date("2026-10-20T15:00:00Z");

describe("liveEvents — corrections and deletes void, never rewrite", () => {
  it("keeps an event nothing voids", () => {
    const a = ev({ kind: "pee", at: "2026-10-20T14:00:00Z" });
    expect(liveEvents([a])).toEqual([a]);
  });

  it("drops a deleted event and the void itself", () => {
    const a = ev({ kind: "pee", at: "2026-10-20T14:00:00Z" });
    const del = ev({ kind: "void", at: "2026-10-20T14:05:00Z", voids: a.id });
    expect(liveEvents([a, del])).toEqual([]);
  });

  it("shows the correction in place of the original", () => {
    const a = ev({ kind: "meal", at: "2026-10-20T08:00:00Z" });
    const fix = ev({ kind: "meal", at: "2026-10-20T08:00:00Z", voids: a.id, details: { amount: "1 cup" } });
    expect(liveEvents([a, fix])).toEqual([fix]);
  });

  it("follows a chain: a correction of a correction leaves only the last", () => {
    const a = ev({ kind: "weight", at: "2026-10-01T08:00:00Z" });
    const b = ev({ kind: "weight", at: "2026-10-01T08:00:00Z", voids: a.id, details: { value: 5, unit: "kg" } });
    const c = ev({ kind: "weight", at: "2026-10-01T08:00:00Z", voids: b.id, details: { value: 5.2, unit: "kg" } });
    expect(liveEvents([c, a, b])).toEqual([c]);
  });

  it("deleting a correction removes the entry entirely", () => {
    const a = ev({ kind: "treat", at: "2026-10-20T10:00:00Z" });
    const b = ev({ kind: "treat", at: "2026-10-20T10:30:00Z", voids: a.id });
    const del = ev({ kind: "void", at: "2026-10-20T11:00:00Z", voids: b.id });
    expect(liveEvents([a, b, del])).toEqual([]);
  });
});

describe("sinceLast — the clocks", () => {
  it("takes the newest live pee, poop and meal", () => {
    const p1 = ev({ kind: "pee", at: "2026-10-20T12:00:00Z" });
    const p2 = ev({ kind: "pee", at: "2026-10-20T14:13:00Z" });
    const po = ev({ kind: "poop", at: "2026-10-20T09:00:00Z" });
    const m = ev({ kind: "meal", at: "2026-10-20T07:00:00Z" });
    const out = sinceLast([p2, po, p1, m], NOW);
    expect(out.pee).toBe(p2);
    expect(out.poop).toBe(po);
    expect(out.meal).toBe(m);
  });

  it("is null for a clock with nothing, never zero minutes", () => {
    expect(sinceLast([ev({ kind: "treat", at: "2026-10-20T14:00:00Z" })], NOW)).toEqual({ pee: null, poop: null, meal: null });
  });

  it("falls back to the previous pee when the newest is deleted", () => {
    const old = ev({ kind: "pee", at: "2026-10-20T12:00:00Z" });
    const wrong = ev({ kind: "pee", at: "2026-10-20T14:50:00Z" });
    const del = ev({ kind: "void", at: "2026-10-20T14:51:00Z", voids: wrong.id });
    expect(sinceLast([old, wrong, del], NOW).pee).toBe(old);
  });

  it("uses a correction's time, not the original's", () => {
    const a = ev({ kind: "poop", at: "2026-10-20T14:55:00Z" });
    const fix = ev({ kind: "poop", at: "2026-10-20T13:00:00Z", voids: a.id, created_at: "2026-10-20T14:58:00Z" });
    const earlier = ev({ kind: "poop", at: "2026-10-20T13:30:00Z" });
    expect(sinceLast([a, fix, earlier], NOW).poop).toBe(earlier);
  });

  it("counts an accident toward its pee or poop clock, and an unknown one toward neither", () => {
    const pee = ev({ kind: "pee", at: "2026-10-20T10:00:00Z" });
    const acc = ev({ kind: "accident", at: "2026-10-20T13:00:00Z", details: { what: "pee" } });
    const unknown = ev({ kind: "accident", at: "2026-10-20T14:00:00Z" });
    const out = sinceLast([pee, acc, unknown], NOW);
    expect(out.pee).toBe(acc);
    expect(out.poop).toBeNull();
  });

  it("ignores an entry timed in the future", () => {
    const real = ev({ kind: "meal", at: "2026-10-20T12:00:00Z" });
    const typo = ev({ kind: "meal", at: "2026-10-20T19:00:00Z" });
    expect(sinceLast([real, typo], NOW).meal).toBe(real);
  });

  it("breaks a tie on time by the later save", () => {
    const a = ev({ kind: "pee", at: "2026-10-20T14:00:00Z", created_at: "2026-10-20T14:00:01Z" });
    const b = ev({ kind: "pee", at: "2026-10-20T14:00:00Z", created_at: "2026-10-20T14:00:02Z" });
    expect(sinceLast([a, b], NOW).pee).toBe(b);
    expect(sinceLast([b, a], NOW).pee).toBe(b);
  });
});

describe("formatAgo", () => {
  const at = (minsAgo: number) => new Date(NOW.getTime() - minsAgo * 60_000).toISOString();
  it.each([
    [0, "just now"],
    [0.5, "just now"],
    [1, "1 min ago"],
    [47, "47 min ago"],
    [60, "1 h ago"],
    [125, "2 h 5 min ago"],
    [24 * 60, "1 d ago"],
    [3 * 24 * 60 + 4 * 60 + 10, "3 d 4 h ago"],
  ])("%s minutes reads %s", (m, want) => {
    expect(formatAgo(at(m), NOW)).toBe(want);
  });
});

describe("growth", () => {
  it("plots live weights with a value, oldest first, in kg", () => {
    const a = ev({ kind: "weight", at: "2026-10-10T08:00:00Z", details: { value: 4, unit: "kg" } });
    const b = ev({ kind: "weight", at: "2026-10-03T08:00:00Z", details: { value: 7, unit: "lb" } });
    const blank = ev({ kind: "weight", at: "2026-10-12T08:00:00Z" });
    const wrong = ev({ kind: "weight", at: "2026-10-15T08:00:00Z", details: { value: 40, unit: "kg" } });
    const del = ev({ kind: "void", at: "2026-10-15T08:01:00Z", voids: wrong.id });
    const pts = growthPoints([a, b, blank, wrong, del]);
    expect(pts.map((p) => p.id)).toEqual([b.id, a.id]);
    expect(pts[0].kg).toBeCloseTo(3.175, 3);
    expect(pts[1].kg).toBe(4);
  });

  it("speaks the newest weight's unit, kg when there is none", () => {
    expect(displayUnit([])).toBe("kg");
    const a = ev({ kind: "weight", at: "2026-10-01T08:00:00Z", details: { value: 4, unit: "kg" } });
    const b = ev({ kind: "weight", at: "2026-10-09T08:00:00Z", details: { value: 9, unit: "lb" } });
    expect(displayUnit([b, a])).toBe("lb");
  });

  it("describes a weight without a value as waiting for one", () => {
    expect(describeEvent({ kind: "weight", details: {} })).toBe("no value yet");
    expect(describeEvent({ kind: "weight", details: { value: 4.26, unit: "kg" } })).toBe("4.3 kg");
  });
});

describe("parseNewEvent — what the server accepts", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  it("accepts a bare tap with no time, leaving now to the database", () => {
    expect(parseNewEvent({ id, kind: "pee" }, NOW)).toEqual({
      id, kind: "pee", at: null, person_id: null, details: {}, note: null, voids: null,
    });
  });

  it("refuses an unknown kind, a missing id and a non-UUID id", () => {
    expect(() => parseNewEvent({ id, kind: "nap" }, NOW)).toThrow(InvalidEvent);
    expect(() => parseNewEvent({ kind: "pee" }, NOW)).toThrow(/id/);
    expect(() => parseNewEvent({ id: "1", kind: "pee" }, NOW)).toThrow(/id/);
  });

  it("keeps only the details a kind owns", () => {
    const meal = parseNewEvent({ id, kind: "meal", details: { amount: " 1 cup ", value: 3 } }, NOW);
    expect(meal.details).toEqual({ amount: "1 cup" });
    const pee = parseNewEvent({ id, kind: "pee", details: { amount: "lots" } }, NOW);
    expect(pee.details).toEqual({});
    const t = parseNewEvent({ id, kind: "training", details: { practised: "sit" } }, NOW);
    expect(t.details).toEqual({ practised: "sit" });
  });

  it("needs a positive number and a known unit for a weight value, and allows none", () => {
    expect(parseNewEvent({ id, kind: "weight", details: { value: 4.2, unit: "kg" } }, NOW).details).toEqual({ value: 4.2, unit: "kg" });
    expect(parseNewEvent({ id, kind: "weight", details: {} }, NOW).details).toEqual({});
    expect(() => parseNewEvent({ id, kind: "weight", details: { value: -1, unit: "kg" } }, NOW)).toThrow(/above 0/);
    expect(() => parseNewEvent({ id, kind: "weight", details: { value: "4", unit: "kg" } }, NOW)).toThrow(/above 0/);
    expect(() => parseNewEvent({ id, kind: "weight", details: { value: 4, unit: "stone" } }, NOW)).toThrow(/unit/);
  });

  it("refuses an accident that is neither pee nor poop", () => {
    expect(() => parseNewEvent({ id, kind: "accident", details: { what: "vomit" } }, NOW)).toThrow(/pee or poop/);
  });

  it("refuses a time more than a day ahead, and an unreadable one", () => {
    expect(() => parseNewEvent({ id, kind: "pee", at: "2026-10-22T15:00:00Z" }, NOW)).toThrow(/future/);
    expect(() => parseNewEvent({ id, kind: "pee", at: "yesterday" }, NOW)).toThrow(/time/);
    expect(parseNewEvent({ id, kind: "pee", at: "2026-10-20T10:00:00+02:00" }, NOW).at).toBe("2026-10-20T08:00:00.000Z");
  });

  it("makes a delete name its target and carry nothing else", () => {
    expect(() => parseNewEvent({ id, kind: "void" }, NOW)).toThrow(/name the entry/);
    expect(parseNewEvent({ id, kind: "void", voids: other, note: "x", details: { amount: "y" }, at: "2026-10-01T00:00:00Z" }, NOW)).toEqual({
      id, kind: "void", at: null, person_id: null, details: {}, note: null, voids: other,
    });
    expect(() => parseNewEvent({ id, kind: "void", voids: id }, NOW)).toThrow(/itself/);
  });
});

describe("checkVoid — what may replace what", () => {
  const target = ev({ kind: "meal", at: "2026-10-20T08:00:00Z" });
  const next = (kind: string) => parseNewEvent({ id: uuid(), kind, voids: target.id }, NOW);

  it("allows a delete or a same-kind correction of a live entry", () => {
    expect(() => checkVoid(next("void"), target, false)).not.toThrow();
    expect(() => checkVoid(next("meal"), target, false)).not.toThrow();
  });

  it("refuses a correction that changes the kind", () => {
    expect(() => checkVoid(next("treat"), target, false)).toThrow(/kind/);
  });

  it("refuses a missing target, a void target and an entry already replaced", () => {
    expect(() => checkVoid(next("void"), null, false)).toThrow(/does not exist/);
    const del = ev({ kind: "void", at: "2026-10-20T09:00:00Z", voids: target.id });
    expect(() => checkVoid(next("void"), del, false)).toThrow(/cannot be corrected/);
    expect(() => checkVoid(next("meal"), target, true)).toThrow(/already changed/);
  });

  it("keeps the original time when a correction does not send one", () => {
    expect(correctionAt(next("meal"), target)).toBe(target.at);
  });
});
