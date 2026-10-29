// TEC-192: the Upcoming tab. Invented items only; nothing here is a real record.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  REPEAT_UNITS,
  UPCOMING_KINDS,
  dayText,
  dueText,
  needsVisit,
  nextDue,
  nextLine,
  openItems,
  parseAction,
  parseUpcoming,
  repeatOf,
  repeatText,
  saveThenClose,
  upcomingTone,
  visitPrefill,
  type Upcoming,
} from "@/lib/upcoming";
import { InvalidEvent, VET_REASONS } from "@/lib/events";

let n = 0;
const uuid = () => `00000000-0000-4000-c000-${String(++n).padStart(12, "0")}`;
function item(over: Partial<Upcoming> = {}): Upcoming {
  return {
    id: uuid(),
    kind: "vet",
    title: "Check-up",
    due_on: "2026-11-06",
    due_time: null,
    note: null,
    repeat_every: null,
    repeat_unit: null,
    status: "open",
    done_on: null,
    done_event: null,
    created_at: "2026-10-29T12:00:00Z",
    updated_at: "2026-10-29T12:00:00Z",
    ...over,
  };
}
const TODAY = "2026-10-30"; // a Friday

describe("the list", () => {
  it("is soonest first: by day, then time, an untimed item after a timed one, then when it was added", () => {
    const later = item({ title: "later", due_on: "2026-12-01" });
    const sameDayNoTime = item({ title: "no time", due_on: "2026-11-06", created_at: "2026-10-01T00:00:00Z" });
    const sameDayLate = item({ title: "late", due_on: "2026-11-06", due_time: "15:00" });
    const sameDayEarly = item({ title: "early", due_on: "2026-11-06", due_time: "09:30" });
    const sooner = item({ title: "sooner", due_on: "2026-11-02" });
    expect(openItems([later, sameDayNoTime, sameDayLate, sooner, sameDayEarly]).map((i) => i.title)).toEqual([
      "sooner",
      "early",
      "late",
      "no time",
      "later",
    ]);
  });

  it("shows open items only: cancelled and done are hidden", () => {
    const open = item({ title: "open" });
    const cancelled = item({ title: "cancelled", status: "cancelled" });
    const done = item({ title: "done", status: "done", done_on: "2026-10-29" });
    expect(openItems([cancelled, open, done]).map((i) => i.title)).toEqual(["open"]);
  });
});

describe("the colours", () => {
  it.each([
    ["2026-10-29", "red"], // yesterday
    ["2026-10-01", "red"],
    ["2026-10-30", "yellow"], // today
    ["2026-11-06", "yellow"], // exactly 7 days
    ["2026-11-07", null], // 8 days
    ["2027-01-01", null],
  ])("a day of %s is %s", (due, tone) => {
    expect(upcomingTone({ due_on: due }, TODAY)).toBe(tone);
  });

  it("counts days on the calendar across a month and a year end", () => {
    expect(upcomingTone({ due_on: "2027-01-03" }, "2026-12-27")).toBe("yellow");
    expect(upcomingTone({ due_on: "2027-01-04" }, "2026-12-27")).toBe(null);
  });
});

describe("the Log line", () => {
  it("names the first open item and its day", () => {
    const rabies = item({ kind: "vaccine", title: "Rabies booster", due_on: "2026-11-06" });
    const far = item({ title: "Annual", due_on: "2027-03-01" });
    expect(nextLine([far, rabies], TODAY)).toEqual({ text: "Next: Rabies booster · Fri Nov 6", tone: "yellow", id: rabies.id });
  });

  it("is neutral when it is more than a week away", () => {
    expect(nextLine([item({ title: "Annual", due_on: "2027-03-01" })], TODAY)?.tone).toBe(null);
  });

  it("is absent when nothing is open", () => {
    expect(nextLine([], TODAY)).toBeNull();
    expect(nextLine([item({ status: "cancelled" }), item({ status: "done" })], TODAY)).toBeNull();
  });

  it("says so, in red, when it is overdue", () => {
    const line = nextLine([item({ title: "Heartworm pill", kind: "medication", due_on: "2026-10-22" })], TODAY);
    expect(line).toMatchObject({ text: "Next: Heartworm pill · Thu Oct 22 · overdue", tone: "red" });
  });
});

describe("days as text", () => {
  it("reads a day from its parts", () => {
    expect(dayText("2026-11-06")).toBe("Fri Nov 6");
    expect(dayText("2028-02-29")).toBe("Tue Feb 29");
    expect(dueText({ due_on: "2026-11-06", due_time: "09:30" })).toBe("Fri Nov 6, 9:30 AM");
    expect(dueText({ due_on: "2026-11-06", due_time: "00:05" })).toBe("Fri Nov 6, 12:05 AM");
    expect(dueText({ due_on: "2026-11-06", due_time: "15:00" })).toBe("Fri Nov 6, 3:00 PM");
    expect(dueText({ due_on: "2026-11-06", due_time: null })).toBe("Fri Nov 6");
  });
  it("says how it repeats", () => {
    expect(repeatText(1, "month")).toBe("every month");
    expect(repeatText(2, "week")).toBe("every 2 weeks");
    expect(repeatText(3, "year")).toBe("every 3 years");
    expect(repeatText(null, null)).toBe("");
  });
});

describe("the next date of a repeat", () => {
  it.each([
    ["2026-11-06", 1, "week", "2026-11-13"],
    ["2026-12-28", 2, "week", "2027-01-11"],
    ["2026-11-06", 1, "month", "2026-12-06"],
    ["2026-12-15", 1, "month", "2027-01-15"],
    ["2026-11-06", 3, "month", "2027-02-06"],
    ["2026-11-06", 1, "year", "2027-11-06"],
    ["2026-11-06", 2, "year", "2028-11-06"],
  ] as const)("%s + %i %s is %s", (from, every, unit, want) => {
    expect(nextDue(from, every, unit)).toBe(want);
  });

  it("takes the last day of a shorter month: Jan 31 + 1 month is the last day of February", () => {
    expect(nextDue("2026-01-31", 1, "month")).toBe("2026-02-28");
    expect(nextDue("2028-01-31", 1, "month")).toBe("2028-02-29"); // a leap year
    expect(nextDue("2026-03-31", 1, "month")).toBe("2026-04-30");
    expect(nextDue("2026-05-31", 1, "month")).toBe("2026-06-30");
    expect(nextDue("2026-08-31", 6, "month")).toBe("2027-02-28");
    expect(nextDue("2026-10-31", 4, "month")).toBe("2027-02-28");
    expect(nextDue("2026-12-31", 2, "month")).toBe("2027-02-28");
  });

  it("takes Feb 28 for a Feb 29 birthday-style year repeat, and Feb 29 again in a leap year", () => {
    expect(nextDue("2028-02-29", 1, "year")).toBe("2029-02-28");
    expect(nextDue("2028-02-29", 4, "year")).toBe("2032-02-29");
  });

  it("makes the next item with the same kind, title, note, time and repeat", () => {
    const base = item({ kind: "medication", title: "Heartworm pill", note: "with food", due_on: "2026-01-31", due_time: "08:00", repeat_every: 1, repeat_unit: "month" });
    expect(repeatOf(base)).toEqual({
      kind: "medication",
      title: "Heartworm pill",
      due_on: "2026-02-28",
      due_time: "08:00",
      note: "with food",
      repeat_every: 1,
      repeat_unit: "month",
    });
    expect(repeatOf(item())).toBeNull();
  });
});

describe("Done on a vet visit or vaccine", () => {
  it("waits for the visit: kinds that need one are vet visits and vaccines only", () => {
    expect(UPCOMING_KINDS.filter(needsVisit)).toEqual(["vet", "vaccine"]);
  });

  it("closes the item only after the visit has saved", async () => {
    const order: string[] = [];
    const ok = await saveThenClose(
      async (v: string) => (order.push(`save ${v}`), true),
      async (v: string) => void order.push(`close ${v}`),
      "visit-1"
    );
    expect(ok).toBe(true);
    expect(order).toEqual(["save visit-1", "close visit-1"]);
  });

  it("leaves the item open when the visit does not save", async () => {
    const close = vi.fn(async () => {});
    const ok = await saveThenClose(async () => false, close, "visit-1");
    expect(ok).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it("opens the visit form on the item's day, with a vaccine's reason and the title as the note", () => {
    const pick = visitPrefill(item({ kind: "vaccine", title: "Rabies booster", due_on: "2026-11-06", due_time: "10:15" }));
    expect(pick).toEqual({ day: "2026-11-06", time: "10:15", reason: "vaccines", note: "Rabies booster" });
    // The reason it pre-picks is one the form offers.
    expect(VET_REASONS.some(([id]) => id === pick.reason)).toBe(true);
  });

  it("picks a vet visit's reason only when its title says which, and noon when it has no time", () => {
    expect(visitPrefill(item({ title: "8-week check-up" }))).toMatchObject({ reason: "checkup", time: "12:00" });
    expect(visitPrefill(item({ title: "Recheck the ear" })).reason).toBe("follow-up");
    expect(visitPrefill(item({ title: "Dental cleaning" })).reason).toBe("");
    for (const t of ["8-week check-up", "Follow-up", "Recheck"]) {
      const r = visitPrefill(item({ title: t })).reason;
      expect(VET_REASONS.some(([id]) => id === r)).toBe(true);
    }
  });
});

describe("the route's parse", () => {
  const good = { kind: "vaccine", title: "  Rabies booster ", due_on: "2026-11-06" };

  it("reads an item, trimming and filling the optional parts with null", () => {
    expect(parseUpcoming(good)).toEqual({
      kind: "vaccine",
      title: "Rabies booster",
      due_on: "2026-11-06",
      due_time: null,
      note: null,
      repeat_every: null,
      repeat_unit: null,
    });
  });

  it("reads a time, a note and a repeat", () => {
    expect(parseUpcoming({ ...good, due_time: "09:30", note: " ask about diet ", repeat_every: 3, repeat_unit: "month" })).toMatchObject({
      due_time: "09:30",
      note: "ask about diet",
      repeat_every: 3,
      repeat_unit: "month",
    });
    expect(parseUpcoming({ ...good, due_time: "09:30:00" }).due_time).toBe("09:30");
    expect(parseUpcoming({ ...good, due_time: "", note: "   " })).toMatchObject({ due_time: null, note: null });
  });

  it.each([
    ["not an object", null],
    ["an unknown kind", { ...good, kind: "grooming" }],
    ["no title", { ...good, title: "  " }],
    ["a long title", { ...good, title: "x".repeat(81) }],
    ["no day", { ...good, due_on: undefined }],
    ["a day that is not real", { ...good, due_on: "2026-02-30" }],
    ["a day in the wrong shape", { ...good, due_on: "11/06/2026" }],
    ["a bad time", { ...good, due_time: "25:00" }],
    ["a long note", { ...good, note: "x".repeat(501) }],
    ["a repeat count without a unit", { ...good, repeat_every: 2 }],
    ["a repeat unit without a count", { ...good, repeat_unit: "week" }],
    ["a repeat of zero", { ...good, repeat_every: 0, repeat_unit: "week" }],
    ["a repeat of 100", { ...good, repeat_every: 100, repeat_unit: "week" }],
    ["a fractional repeat", { ...good, repeat_every: 1.5, repeat_unit: "week" }],
    ["a repeat in days", { ...good, repeat_every: 2, repeat_unit: "day" }],
  ])("refuses %s", (_name, body) => {
    expect(() => parseUpcoming(body)).toThrow(InvalidEvent);
  });

  it("reads every action and refuses anything else", () => {
    const id = uuid();
    expect(parseAction({ action: "add", item: good })).toMatchObject({ action: "add" });
    expect(parseAction({ action: "edit", id, item: good })).toMatchObject({ action: "edit", id });
    expect(parseAction({ action: "cancel", id })).toEqual({ action: "cancel", id });
    expect(parseAction({ action: "done", id, done_on: "2026-10-30" })).toEqual({ action: "done", id, done_on: "2026-10-30", done_event: null });
    const ev = uuid();
    expect(parseAction({ action: "done", id, done_on: "2026-10-30", done_event: ev })).toMatchObject({ done_event: ev });
    for (const bad of [
      null,
      { action: "delete", id },
      { action: "cancel", id: "nope" },
      { action: "edit", id, item: { ...good, kind: "x" } },
      { action: "done", id, done_on: "soon" },
      { action: "done", id, done_on: "2026-10-30", done_event: "nope" },
    ]) {
      expect(() => parseAction(bad)).toThrow(InvalidEvent);
    }
  });

  it("offers exactly the repeat units the database allows", () => {
    expect([...REPEAT_UNITS]).toEqual(["week", "month", "year"]);
  });
});

describe("the route", () => {
  it("answers a bad request with 400, a lost race with 409, and a database failure with 503", async () => {
    vi.resetModules();
    const { Conflict } = await import("@/lib/journal");
    const apply = vi.fn();
    vi.doMock("@/lib/upcoming-db", () => ({ applyAction: apply, listOpen: vi.fn() }));
    vi.doMock("@/lib/supabase", () => ({ getServiceClient: () => ({}) }));
    const { POST } = await import("@/app/api/upcoming/route");
    const call = (body: unknown) =>
      POST(new Request("http://x/api/upcoming", { method: "POST", body: JSON.stringify(body) }) as never);

    expect((await call({ action: "nope" })).status).toBe(400);
    expect(apply).not.toHaveBeenCalled();

    apply.mockRejectedValueOnce(new Conflict("already done"));
    expect((await call({ action: "cancel", id: uuid() })).status).toBe(409);
    apply.mockRejectedValueOnce(new Error("db down"));
    expect((await call({ action: "cancel", id: uuid() })).status).toBe(503);
    apply.mockResolvedValueOnce({ item: item(), next: null });
    expect((await call({ action: "cancel", id: uuid() })).status).toBe(200);
    vi.doUnmock("@/lib/upcoming-db");
    vi.doUnmock("@/lib/supabase");
  });
});

describe("the lando_upcoming migration", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_lando_upcoming.sql"));
  const sql = file ? readFileSync(resolve(dir, file), "utf8").replace(/--.*$/gm, "") : "";

  it("creates lando.upcoming in the lando schema, never public", () => {
    expect(file).toBeDefined();
    expect(sql).toMatch(/CREATE TABLE lando\.upcoming \(/);
    expect(sql).not.toMatch(/public\./);
  });

  it("turns RLS on in the same file and writes no policy", () => {
    expect(sql).toMatch(/ALTER TABLE lando\.upcoming ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it("has the columns the issue lists", () => {
    for (const col of [
      /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
      /kind text NOT NULL/,
      /title text NOT NULL/,
      /due_on date NOT NULL/,
      /due_time time,/,
      /note text/,
      /repeat_every integer/,
      /repeat_unit text/,
      /status text NOT NULL DEFAULT 'open'/,
      /done_on date,/,
      /done_event uuid,/,
      /created_at timestamptz NOT NULL DEFAULT now\(\)/,
      /updated_at timestamptz NOT NULL DEFAULT now\(\)/,
    ])
      expect(sql).toMatch(col);
  });

  it("allows exactly the app's kinds, repeat units and statuses, so the database and the form agree", () => {
    const list = (re: RegExp) => re.exec(sql)![1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(list(/kind text NOT NULL CHECK \(kind IN \(([^)]*)\)/)).toEqual([...UPCOMING_KINDS]);
    expect(list(/repeat_unit IN \(([^)]*)\)/)).toEqual([...REPEAT_UNITS]);
    expect(list(/status IN \(([^)]*)\)/)).toEqual(["open", "done", "cancelled"]);
  });

  it("keeps a repeat to both parts or neither, and does not tie done_event to the journal by a foreign key", () => {
    expect(sql).toMatch(/\(repeat_every IS NULL\) = \(repeat_unit IS NULL\)/);
    expect(sql).not.toMatch(/REFERENCES/i);
  });

  it("is additive: it drops, deletes and alters nothing but its own RLS", () => {
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE)\b/i);
    expect(sql.match(/ALTER TABLE/g)).toHaveLength(1);
  });
});
