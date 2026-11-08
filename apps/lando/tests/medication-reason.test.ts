// TEC-233: a medication carries a reason, set once; a dose shows it in the Log; Analytics groups doses by it.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { dosesByReason } from "@/lib/analytics";
import { InvalidEvent, describe as describeEvent, parseMedicationReason, parseNewMedication, type JournalEvent } from "@/lib/events";
import { setMedicationReason, listMedications, addMedication } from "@/lib/journal";
import { MED_REASONS, MED_REASON_IDS, medReasonLabel, type Medication } from "@/lib/medications";
import { RELEASES } from "@/lib/releases";

// Invented ids and names (RULES.md, Never 2).
const HEART: Medication = { id: "11111111-1111-4111-8111-111111111111", name: "Test Chew", unit: "chew", reason: "heartworm" };
const OLD: Medication = { id: "22222222-2222-4222-8222-222222222222", name: "Old Syrup", unit: "ml" };
const MEDS = [HEART, OLD];

describe("the reason list", () => {
  it("is the owner's eight, in order, with plain labels", () => {
    expect(MED_REASONS.map(([, l]) => l)).toEqual(["Heartworm", "Flea & tick", "Dewormer", "Allergy", "Pain", "Antibiotic", "Joint", "Other"]);
  });
  it("matches the migration's check, id for id", () => {
    const dir = resolve(__dirname, "../../../supabase/migrations");
    const file = readdirSync(dir).find((f) => f.endsWith("_lando_medication_reason.sql"))!;
    const sql = readFileSync(resolve(dir, file), "utf8").replace(/--.*$/gm, "");
    const ids = [...sql.match(/CHECK \(reason IN \(([^)]*)\)\)/)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(ids).toEqual([...MED_REASON_IDS]);
    // Additive only: a nullable column, nothing dropped or rewritten.
    expect(sql).toMatch(/ADD COLUMN reason text/);
    expect(sql).not.toMatch(/NOT NULL|\bDROP\b|\bDELETE\b|\bUPDATE\b/i);
    // Later than every other migration.
    const newest = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().pop();
    expect(newest).toBe(file);
  });
  it("reads No reason for a medication without one", () => {
    expect(medReasonLabel(undefined)).toBe("No reason");
    expect(medReasonLabel(null)).toBe("No reason");
    expect(medReasonLabel("flea-tick")).toBe("Flea & tick");
  });
});

describe("adding a medication takes a reason", () => {
  it("accepts one from the list and refuses a missing or unknown one", () => {
    expect(parseNewMedication({ name: "Drops", unit: "ml", reason: "flea-tick" })).toEqual({ name: "Drops", unit: "ml", reason: "flea-tick" });
    expect(() => parseNewMedication({ name: "Drops", unit: "ml" })).toThrow(/pick a reason/);
    expect(() => parseNewMedication({ name: "Drops", unit: "ml", reason: "cough" })).toThrow(InvalidEvent);
  });
  it("parses a later set the same way", () => {
    expect(parseMedicationReason({ id: OLD.id, reason: "pain" })).toEqual({ id: OLD.id, reason: "pain" });
    expect(() => parseMedicationReason({ id: OLD.id })).toThrow(/pick a reason/);
    expect(() => parseMedicationReason({ reason: "pain" })).toThrow(InvalidEvent);
  });
});

/** An in-memory medications table with the select / update().eq().is().select() calls the server makes. */
function fakeDb(rows: Record<string, unknown>[]) {
  const updates: Record<string, unknown>[] = [];
  const inserted: Record<string, unknown>[] = [];
  const make = () => {
    let patch: Record<string, unknown> | null = null;
    let id = "";
    let onlyNull = false;
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      order: chain,
      eq: (_c: string, v: string) => ((id = v), b),
      is: () => ((onlyNull = true), b),
      update: (p: Record<string, unknown>) => ((patch = p), b),
      insert: (r: Record<string, unknown>) => (inserted.push(r), b),
      single: async () => ({ data: { id: "88888888-8888-4888-8888-888888888888" }, error: null }),
      then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => {
        if (!patch) return Promise.resolve({ data: rows, error: null }).then(ok, fail);
        const hit = rows.filter((r) => r.id === id && (!onlyNull || r.reason == null));
        for (const r of hit) Object.assign(r, patch);
        if (hit.length) updates.push(patch);
        return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(ok, fail);
      },
    });
    return b;
  };
  return { db: { from: vi.fn(() => make()) } as never, updates, inserted };
}

describe("setting a reason, once", () => {
  const rows = () => [
    { id: HEART.id, name: HEART.name, unit: HEART.unit, reason: "heartworm", retired: false },
    { id: OLD.id, name: OLD.name, unit: OLD.unit, reason: null, retired: false },
  ];
  it("lists a null reason as none and a set one as itself", async () => {
    const { db } = fakeDb(rows());
    expect(await listMedications(db)).toEqual([HEART, OLD]);
  });
  it("gives a medication with no reason its reason", async () => {
    const { db, updates } = fakeDb(rows());
    expect(await setMedicationReason(db, { id: OLD.id, reason: "joint" })).toEqual({ ...OLD, reason: "joint" });
    expect(updates).toEqual([{ reason: "joint" }]);
    // A second try, even with the same reason, is refused and writes nothing more.
    await expect(setMedicationReason(db, { id: OLD.id, reason: "pain" })).rejects.toThrow(/already has a reason/);
    expect(updates).toHaveLength(1);
  });
  it("never changes a reason that is set, and refuses an unknown medication", async () => {
    const { db, updates } = fakeDb(rows());
    await expect(setMedicationReason(db, { id: HEART.id, reason: "pain" })).rejects.toThrow(/already has a reason/);
    await expect(setMedicationReason(db, { id: "99999999-9999-4999-8999-999999999999", reason: "pain" })).rejects.toThrow(/not in the list/);
    expect(updates).toEqual([]);
  });
  it("an add writes the reason with the name and unit", async () => {
    const { db, inserted } = fakeDb(rows());
    expect(await addMedication(db, { name: "Another", unit: "mg", reason: "other" })).toMatchObject({ reason: "other" });
    expect(inserted).toEqual([{ name: "Another", unit: "mg", reason: "other" }]);
  });
});

const dose = (id: string, med: Medication, at: string, extra: Partial<JournalEvent> = {}): JournalEvent => ({
  id,
  kind: "health",
  at,
  person_id: null,
  details: { type: "medication", med_id: med.id, med_name: med.name, dose: 1, unit: med.unit, route: "mouth" },
  note: null,
  voids: null,
  created_at: at,
  ...extra,
});

describe("a dose in the Log", () => {
  const e = dose("e1", HEART, "2026-11-07T15:00:00.000Z");
  it("shows its medication's reason after the dose", () => {
    expect(describeEvent(e, [], [], MEDS).detail).toBe("Test Chew · 1 chew · by mouth · Heartworm");
  });
  it('shows "No reason" for a medication without one', () => {
    expect(describeEvent(dose("e2", OLD, "2026-11-07T15:00:00.000Z"), [], [], MEDS).detail).toBe("Old Syrup · 1 ml · by mouth · No reason");
  });
  it("shows nothing extra when the medications are not at hand", () => {
    expect(describeEvent(e).detail).toBe("Test Chew · 1 chew · by mouth");
  });
});

describe("Analytics groups doses by reason", () => {
  const now = new Date(2026, 10, 8, 12, 0, 0);
  const day = (n: number) => new Date(2026, 10, 8 - n, 9, 0, 0).toISOString();
  const events = [
    dose("a", HEART, day(1)),
    dose("b", HEART, day(2)),
    dose("c", OLD, day(3)),
    dose("d", HEART, day(30)), // older than fourteen days
    dose("v", HEART, day(1), { id: "v", voids: "a" }), // a correction of a: a no longer counts, v does
  ];
  it("counts live doses in the window, reasons in the form's order, No reason last", () => {
    const rows = dosesByReason(events, MEDS, now);
    expect(rows.map((r) => [r.label, r.doses])).toEqual([
      ["Heartworm", 2], // b and the correction v
      ["No reason", 1],
    ]);
    expect(rows[0].meds).toEqual([{ name: "Test Chew", doses: 2 }]);
  });
  it("is empty without a dose", () => {
    expect(dosesByReason([], MEDS, now)).toEqual([]);
  });
  it("puts a dose of an unknown medication under No reason, by its snapshot name", () => {
    const rows = dosesByReason([dose("z", HEART, day(1))], [], now);
    expect(rows).toEqual([{ reason: "", label: "No reason", doses: 1, meds: [{ name: "Test Chew", doses: 1 }] }]);
  });
});

describe("the release note", () => {
  it("says it plainly, on the same day as the add fix, with one summary line for the day", () => {
    const today = RELEASES.filter((r) => r.date === "2026-11-08");
    expect(today.some((r) => /reason/i.test(r.text))).toBe(true);
    expect(today.map((r) => r.text).join(" ")).not.toMatch(/TEC-|\.tsx?\b/);
  });
});
