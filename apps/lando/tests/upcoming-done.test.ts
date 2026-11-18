// Issue #60: Done closes a vet or vaccine plan only by the entry its own form saves. Invented items only.
import { describe, expect, it } from "vitest";
import { applyAction } from "@/lib/upcoming-db";

const ID = "00000000-0000-4000-a000-000000000001";
const EV = "00000000-0000-4000-b000-000000000001";
type R = Record<string, any>;

/** A small in-memory fake of the calls applyAction makes: one plan in `upcoming`, one saved entry in `events`. */
function fake(plan: R, event: R | null) {
  const upcoming: R[] = [
    { id: ID, kind: "vet", title: "x", due_on: "2026-11-20", due_time: null, note: null, repeat_every: null, repeat_unit: null, status: "open", done_on: null, done_event: null, attachments: null, created_at: "x", updated_at: "x", ...plan },
  ];
  const from = (table: string) => {
    const filters: ((r: R) => boolean)[] = [];
    let patch: R | null = null;
    let ins: R | null = null;
    const rows = () => (table === "events" ? (event ? [event] : []) : upcoming).filter((r) => filters.every((f) => f(r)));
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      update: (p: R) => ((patch = p), b),
      insert: (r: R) => ((ins = r), b),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => {
        const full = { ...ins, id: "00000000-0000-4000-a000-000000000002", status: "open", created_at: "x", updated_at: "x" };
        upcoming.push(full);
        return { data: full, error: null };
      },
      then: (ok: any, fail: any) => {
        const hit = rows();
        if (patch) hit.forEach((r) => Object.assign(r, patch));
        return Promise.resolve({ data: hit, error: null }).then(ok, fail);
      },
    };
    return b;
  };
  return { db: { from } as any, upcoming };
}

const done = { action: "done", id: ID, done_on: "2026-11-20", done_event: EV } as const;
const entry = (type: string) => ({ id: EV, kind: "health", details: { type } });

describe("Done closes a plan only by the entry its form saves", () => {
  it("a Vaccine-form plan closes by a vaccine entry and is refused by a vet visit", async () => {
    const plan = { kind: "vaccine", title: "Vaccine · DHPP · dose 2" };
    expect((await applyAction(fake(plan, entry("vaccine")).db, done)).item.status).toBe("done");
    const bad = fake(plan, entry("vet"));
    await expect(applyAction(bad.db, done)).rejects.toThrow(/vaccine isn't saved/);
    expect(bad.upcoming[0].status).toBe("open");
  });

  it("an older vaccine plan and a vet plan close by a vet visit, and refuse a vaccine entry", async () => {
    for (const plan of [{ kind: "vaccine", title: "Rabies booster" }, { kind: "vet", title: "Vet visit" }]) {
      expect((await applyAction(fake(plan, entry("vet")).db, done)).item.status).toBe("done");
      const bad = fake(plan, entry("vaccine"));
      await expect(applyAction(bad.db, done)).rejects.toThrow(/vet visit isn't saved/);
      expect(bad.upcoming[0].status).toBe("open");
    }
  });

  it("nothing else closes one: no entry, or a non-health entry, is refused", async () => {
    const plan = { kind: "vaccine", title: "Vaccine · DHPP · dose 2" };
    await expect(applyAction(fake(plan, null).db, done)).rejects.toThrow(/isn't saved/);
    await expect(applyAction(fake(plan, { id: EV, kind: "food", details: {} }).db, done)).rejects.toThrow(/isn't saved/);
  });

  it("a repeating Vaccine-form plan makes the next plan", async () => {
    const { db, upcoming } = fake({ kind: "vaccine", title: "Vaccine · DHPP · dose 2", repeat_every: 3, repeat_unit: "week" }, entry("vaccine"));
    const out = await applyAction(db, done);
    expect(out.next).toMatchObject({ kind: "vaccine", title: "Vaccine · DHPP · dose 2", due_on: "2026-12-11" });
    expect(upcoming).toHaveLength(2);
  });
});
