/**
 * Medications (TEC-199): the pick list on the Health form's Medication tab. Unlike foods there is no list in
 * code: every medication is added in the app ("Add a medication…") and kept in `lando.medications`, stored
 * like added foods. A dose is a Health entry (`type: 'medication'`) that names the medication's id and
 * snapshots its name, so the id is history's key: a medication is retired, never deleted or re-id'd, and
 * renaming one never rewrites an old dose.
 *
 * Pure; the database half is `journal.ts`.
 */

/** What a dose is counted in, in the order the form offers them. Held equal to `lando.details_ok` and `lando.medications` by a test. */
export const MED_UNITS = ["mg", "ml", "g", "tablet", "chew", "capsule", "spray", "dose"] as const;
export type MedUnit = (typeof MED_UNITS)[number];

/** How a dose was given (the form's "Given"), id then label. Held equal to `lando.details_ok` by a test. */
export const MED_ROUTES = [
  ["mouth", "By mouth"],
  ["skin", "On skin"],
  ["ear-eye", "Ear/eye"],
  ["shot", "Shot"],
] as const;
export type MedRoute = (typeof MED_ROUTES)[number][0];
export const MED_ROUTE_LABELS = Object.fromEntries(MED_ROUTES) as Record<MedRoute, string>;

export const MED_NAME_MAX = 60;
export const DOSE_MAX = 10_000;

/** A medication as `lando.medications` holds it. Its `id` is history's key: never deleted, never changed. */
export type Medication = { id: string; name: string; unit: MedUnit; retired?: boolean };

/** The pick list: every medication not retired, in the order added. */
export function medPicklist(meds: readonly Medication[]): Medication[] {
  return meds.filter((m) => !m.retired);
}

/** Any medication, retired or not, so an old dose can still be corrected. */
export function findMedication(meds: readonly Medication[], id: string): Medication | null {
  return meds.find((m) => m.id === id) ?? null;
}

/** A name as typed: outer spaces off, inner runs of spaces made one. */
export function cleanMedName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Whether a name is already in the list (retired too), ignoring case and outer spaces. */
export function medNameTaken(name: string, meds: readonly Medication[]): boolean {
  const n = cleanMedName(name).toLowerCase();
  return meds.some((m) => m.name.trim().toLowerCase() === n);
}

/** "5 mg", "1 tablet", "2 tablets": plural above one for the countable units; mg and ml never change. */
export function doseText(dose: number, unit: string): string {
  const fixed = unit === "mg" || unit === "ml" || unit === "g";
  const word = fixed || dose <= 1 ? unit : unit === "dose" ? "doses" : `${unit}s`;
  return `${Math.round(dose * 1000) / 1000} ${word}`;
}
