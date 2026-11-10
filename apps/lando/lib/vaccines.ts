/**
 * Vaccines (TEC-259): the list a Vaccine entry picks from, and the pure rules that suggest when the next dose is
 * due. Pure, and it imports nothing (events.ts imports it); the next-dose rule is `vaccine-plan.ts`. The list is also in `lando.details_ok` (migration
 * `lando_vaccines`); `tests/vaccines.test.ts` reads that file and holds the two equal.
 */
/**
 * The vaccines offered, in display order (the owner, 2026-11-08: "leave them for now, will update you if i need
 * more"). `doses` is whether the vaccine has a dose number the form asks for. An id is history's key: an entry holds
 * it, so a vaccine is retired (moved to `VACCINE_RETIRED`), never deleted or re-id'd.
 */
export const VACCINES = [
  { id: "dhpp", label: "DHPP", doses: true },
  { id: "bordetella", label: "Bordetella", doses: false },
  { id: "leptospirosis", label: "Leptospirosis", doses: true },
  { id: "rabies", label: "Rabies", doses: false },
] as const;

/** Vaccines the form no longer offers but entries still hold. None yet. */
export const VACCINE_RETIRED: readonly { id: string; label: string; doses: boolean }[] = [];

export type VaccineId = (typeof VACCINES)[number]["id"];

/** Every id an entry may hold: the offered ones, then the retired. */
export const VACCINE_IDS: readonly string[] = [...VACCINES.map((v) => v.id), ...VACCINE_RETIRED.map((v) => v.id)];

/** The highest dose number the form offers; the database allows the same. */
export const DOSE_MAX = 6;

const find = (id: string) => [...VACCINES, ...VACCINE_RETIRED].find((v) => v.id === id);

/** A vaccine's label, offered or retired, else the stored id as it is. */
export const vaccineLabel = (id: string): string => find(id)?.label ?? id;

/** Whether the form asks for a dose number for this vaccine. */
export const hasDoses = (id: string): boolean => find(id)?.doses ?? false;

/**
 * The dose number a new entry opens on: one more than the live entries of that vaccine already logged (`earlier`).
 * Null for a vaccine with no dose number. Never above `DOSE_MAX`.
 */
export function suggestedDose(vaccine: string, earlier: number): number | null {
  return hasDoses(vaccine) ? Math.min(DOSE_MAX, Math.max(0, earlier) + 1) : null;
}

/** "DHPP", or "DHPP · dose 2": how an entry names the vaccine given. */
export function vaccineText(vaccine: string, dose?: number | null): string {
  return dose ? `${vaccineLabel(vaccine)} · dose ${dose}` : vaccineLabel(vaccine);
}

/* ── The plan it makes ───────────────────────────────────────────────────── */

const SEP = " · ";
/** The title of an upcoming plan made from a vaccine: "Vaccine · DHPP · dose 3". Done opens the Vaccine form from it. */
export const VACCINE_PLAN = "Vaccine";

export function vaccinePlanTitle(vaccine: string, dose?: number | null): string {
  return [VACCINE_PLAN, vaccineLabel(vaccine), dose ? `dose ${dose}` : ""].filter(Boolean).join(SEP);
}

/** The vaccine and dose a plan's title names, or null when the title is not one of ours ("Rabies booster"). */
export function parseVaccinePlanTitle(title: string): { vaccine: string; dose: number | null } | null {
  const [head, name, tail] = title.split(SEP);
  if (head !== VACCINE_PLAN || !name) return null;
  const v = [...VACCINES, ...VACCINE_RETIRED].find((x) => x.label === name);
  if (!v) return null;
  const m = /^dose (\d+)$/.exec(tail ?? "");
  return { vaccine: v.id, dose: m ? Number(m[1]) : null };
}
