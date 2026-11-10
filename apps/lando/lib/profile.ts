/**
 * Lando's Profile (TEC-260): the stored details (`lando.profile`, one row) and the pure rules that turn the journal and
 * the plans into the rest of the page: age, vaccine status, the vet visits and the regular medications. Pure: no
 * database, no clock (`today` is the phone's day). The database half is `profile-db.ts`.
 *
 * The microchip and policy numbers are personal data. They live in the database only; nothing here logs them.
 */
import { InvalidEvent, earlierDoses, health, liveEvents, newestFirst, type JournalEvent } from "./events";
import type { Medication } from "./medications";
import { SOON_DAYS, daysBetween, isDay, openItems, type Upcoming, type UpcomingInput } from "./upcoming";
import { toDateInput } from "./localtime";
import { VACCINES, VACCINE_RETIRED, parseVaccinePlanTitle, vaccineLabel } from "./vaccines";
import { nextDose, nextDosePlan, type NextDose } from "./vaccine-plan";

/** The window event the app bar's icon sends and `Journal` listens for: open Profile (TEC-260). */
export const OPEN_PROFILE = "lando:open-profile";

/* ── The stored details ──────────────────────────────────────────────────── */

/** Each field's longest value; `lando.profile`'s checks hold the same (a test reads the migration). */
export const PROFILE_MAX = {
  breed: 60,
  microchip: 30,
  insurance_provider: 60,
  insurance_policy: 40,
  clinic_name: 80,
  clinic_phone: 30,
} as const;

/** The row as the app holds it: every detail optional, `null` when empty. */
export type ProfileDetails = {
  breed: string | null;
  birth_on: string | null;
  microchip: string | null;
  insurance_provider: string | null;
  insurance_policy: string | null;
  clinic_name: string | null;
  clinic_phone: string | null;
};

export const EMPTY_PROFILE: ProfileDetails = {
  breed: null,
  birth_on: null,
  microchip: null,
  insurance_provider: null,
  insurance_policy: null,
  clinic_name: null,
  clinic_phone: null,
};

const PHONE = /^[0-9+().\-\s]{3,30}$/;

function text(raw: unknown, name: keyof typeof PROFILE_MAX, label: string): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") throw new InvalidEvent(`${label} must be text`);
  const v = raw.trim().replace(/\s+/g, " ");
  if (!v) return null;
  if (v.length > PROFILE_MAX[name]) throw new InvalidEvent(`${label} can be at most ${PROFILE_MAX[name]} characters`);
  return v;
}

/**
 * Checks what the Edit form sends. Empty text becomes `null`; a birth date must be a real day, no later than tomorrow
 * (the phone's clock may run a little ahead of the server's). Throws `InvalidEvent`, and its message never carries a
 * value that was typed.
 */
export function parseProfile(raw: unknown, now = new Date()): ProfileDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InvalidEvent("the profile must be an object");
  const r = raw as Record<string, unknown>;
  let birth: string | null = null;
  if (r.birth_on !== null && r.birth_on !== undefined && r.birth_on !== "") {
    if (!isDay(r.birth_on)) throw new InvalidEvent("birthday must be a day");
    if (daysBetween(toDateInput(now.toISOString()), r.birth_on) > 1) throw new InvalidEvent("birthday can't be in the future");
    birth = r.birth_on;
  }
  const phone = text(r.clinic_phone, "clinic_phone", "phone");
  if (phone !== null && !PHONE.test(phone)) throw new InvalidEvent("phone can have digits, spaces and + ( ) - . only");
  return {
    breed: text(r.breed, "breed", "breed"),
    birth_on: birth,
    microchip: text(r.microchip, "microchip", "microchip"),
    insurance_provider: text(r.insurance_provider, "insurance_provider", "insurance provider"),
    insurance_policy: text(r.insurance_policy, "insurance_policy", "policy number"),
    clinic_name: text(r.clinic_name, "clinic_name", "clinic"),
    clinic_phone: phone,
  };
}

/** A row from the database (extra columns and all) as `ProfileDetails`, or the empty profile when there is no row. */
export function fromRow(row: Record<string, unknown> | null): ProfileDetails {
  if (!row) return EMPTY_PROFILE;
  const s = (k: string) => (typeof row[k] === "string" && row[k] ? (row[k] as string) : null);
  return {
    breed: s("breed"),
    birth_on: s("birth_on"),
    microchip: s("microchip"),
    insurance_provider: s("insurance_provider"),
    insurance_policy: s("insurance_policy"),
    clinic_name: s("clinic_name"),
    clinic_phone: s("clinic_phone"),
  };
}

/** The `tel:` target for a phone as typed: its digits, and a leading plus. Null when there are no digits. */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:${phone.trim().startsWith("+") ? "+" : ""}${digits}` : null;
}

/* ── Age ─────────────────────────────────────────────────────────────────── */

/** Whole months from one day to another (both `YYYY-MM-DD`). */
function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * "9 days old", "21 weeks old" (under six months), "8 months old" (under two years), "2 years, 3 months old".
 * Null when the birthday is missing, unreadable or after today.
 */
export function ageText(birthOn: string | null, today: string): string | null {
  if (!birthOn || !isDay(birthOn) || !isDay(today)) return null;
  const days = daysBetween(birthOn, today);
  if (days < 0) return null;
  if (days < 14) return `${plural(days, "day")} old`;
  if (days < 182) return `${plural(Math.floor(days / 7), "week")} old`;
  const months = monthsBetween(birthOn, today);
  if (months < 24) return `${plural(months, "month")} old`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${plural(years, "year")}${rest ? `, ${plural(rest, "month")}` : ""} old`;
}

/* ── Vaccines ────────────────────────────────────────────────────────────── */

/** The pills' status colours (`data-status`): green is good, yellow due soon, red overdue. Null is not logged. */
export type VaccineStatus = "green" | "yellow" | "red";
export const VACCINE_STATUS_WORDS: Record<VaccineStatus, string> = { green: "good", yellow: "due soon", red: "overdue" };

export type VaccineRow = {
  id: string;
  label: string;
  /** The newest live entry's day (`YYYY-MM-DD`, the phone's), or null when none is logged. */
  lastOn: string | null;
  /** The day the next dose is due: an open plan's, else the rules' suggestion. Null when none is logged. */
  nextOn: string | null;
  status: VaccineStatus | null;
  /** The open plan for the next dose, when there is one; then Plan next has nothing to add. */
  planned: Upcoming | null;
  /** What Plan next would add: set when a vaccine is logged and nothing is planned. */
  offer: UpcomingInput | null;
};

/** Overdue before today is red, due today or within a week amber, later green (the same cut-offs as an upcoming row). */
export function vaccineStatus(nextOn: string, today: string): VaccineStatus {
  const d = daysBetween(today, nextOn);
  return d < 0 ? "red" : d <= SOON_DAYS ? "yellow" : "green";
}

/**
 * Each vaccine's last date and status. Reads `health` entries whose `details.type` is `vaccine` (`dose` is also a
 * medication's amount, so the type is always checked first), live ones only. The next dose is an open Vaccine plan that
 * names the vaccine, else the rule's suggestion from the newest entry and Lando's age (`birthOn`). A retired vaccine
 * is listed only when an entry holds it.
 */
export function vaccineRows(events: JournalEvent[], upcoming: readonly Upcoming[], birthOn: string | null, today: string): VaccineRow[] {
  const live = liveEvents(events).filter((e) => e.kind === "health" && health(e).type === "vaccine");
  const open = openItems(upcoming).filter((i) => i.kind === "vaccine");
  const ids = [...VACCINES.map((v) => v.id), ...VACCINE_RETIRED.map((v) => v.id)];
  const rows: VaccineRow[] = [];
  for (const id of ids) {
    const mine = live.filter((e) => health(e).vaccine === id).sort(newestFirst);
    const retired = !VACCINES.some((v) => v.id === id);
    if (retired && !mine.length) continue;
    const planned = open.find((i) => parseVaccinePlanTitle(i.title)?.vaccine === id) ?? null;
    const last = mine[0] ?? null;
    if (!last) {
      rows.push({ id, label: vaccineLabel(id), lastOn: null, nextOn: planned?.due_on ?? null, status: planned ? vaccineStatus(planned.due_on, today) : null, planned, offer: null });
      continue;
    }
    const givenOn = toDateInput(last.at);
    const dose = health(last).dose ?? null;
    const suggestion: NextDose = nextDose({ vaccine: id, givenOn, dose, earlier: earlierDoses(events, id, last.at, last.id), birthOn });
    const nextOn = planned?.due_on ?? suggestion.on;
    rows.push({
      id,
      label: vaccineLabel(id),
      lastOn: givenOn,
      nextOn,
      status: vaccineStatus(nextOn, today),
      planned,
      offer: planned ? null : nextDosePlan({ vaccine: id, dose, series: suggestion.series, on: suggestion.on }),
    });
  }
  return rows;
}

/* ── Vet and medications ─────────────────────────────────────────────────── */

/** The newest live vet visit, or null. */
export function lastVisit(events: JournalEvent[]): JournalEvent | null {
  return liveEvents(events).filter((e) => e.kind === "health" && health(e).type === "vet").sort(newestFirst)[0] ?? null;
}

/** The soonest open vet visit plan, or null. */
export function nextVisit(upcoming: readonly Upcoming[]): Upcoming | null {
  return openItems(upcoming).find((i) => i.kind === "vet") ?? null;
}

export type MedRow = { med: Medication; next: Upcoming | null };

/** Every medication not retired, with its soonest open plan (a plan's title starts with the medication's name). */
export function medRows(meds: readonly Medication[], upcoming: readonly Upcoming[]): MedRow[] {
  const open = openItems(upcoming).filter((i) => i.kind === "medication");
  return meds
    .filter((m) => !m.retired)
    .map((med) => ({ med, next: open.find((i) => i.title.split(" · ")[0].trim().toLowerCase() === med.name.trim().toLowerCase()) ?? null }));
}

/** Both journal reads, merged: the screen's window and the Profile's all-time vaccines and vet visits, each entry once. */
export function mergeEvents(a: readonly JournalEvent[], b: readonly JournalEvent[]): JournalEvent[] {
  const seen = new Map<string, JournalEvent>();
  for (const e of [...a, ...b]) seen.set(e.id, e);
  return [...seen.values()];
}
