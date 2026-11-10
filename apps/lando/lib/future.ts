/**
 * Future entries (TEC-199), replacing the Upcoming tab: any form's When may be in the future, and the form then
 * saves an upcoming item (`lando.upcoming`, `lib/upcoming.ts`) instead of a journal entry. The Log screen shows
 * the items due in the coming week (Next 7 days) and the feed's Upcoming filter lists every open one; Done opens
 * the form the item came from. Everything here is pure.
 */
import { FORM_LABELS, HEALTH_LABELS, VET_REASONS, type FormKind, type HealthType } from "./events";
import { fromLocalInput, toDateInput } from "./localtime";
import { MED_UNITS, type Medication } from "./medications";
import { parseVaccinePlanTitle, vaccinePlanTitle } from "./vaccines";
import {
  SOON_DAYS,
  TITLE_MAX,
  daysBetween,
  isDay,
  openItems,
  parseUpcoming,
  visitPrefill,
  type Attachments,
  type RepeatUnit,
  type Upcoming,
  type UpcomingInput,
  type UpcomingKind,
} from "./upcoming";

/**
 * Whether a picked When is in the future. `at` is the picked time (null when it cannot be read) and `now` the
 * phone's clock; the same minute is not the future, so an entry typed for "now" stays a journal entry.
 */
export function isFutureWhen(at: Date | null, now: Date): boolean {
  return at !== null && at.getTime() > now.getTime();
}

/** A weight's When is a day: the future only when the day is after today (`YYYY-MM-DD`, the phone's). */
export function isFutureDay(day: string, today: string): boolean {
  return isDay(day) && isDay(today) && daysBetween(today, day) > 0;
}

/**
 * Whether a When the form holds is after now: a day for a date-only form (Weight), else a local date and time
 * (`datetime-local` text). Empty or unreadable is never the future.
 */
export function isFuturePick(value: string, dateOnly: boolean, now: Date): boolean {
  if (!value) return false;
  if (dateOnly) return isFutureDay(value, toDateInput(now.toISOString()));
  const at = fromLocalInput(value);
  return isFutureWhen(at ? new Date(at) : null, now);
}

/** What the form says under When while the When is in the future. */
export const FUTURE_NOTICE = "Future: saves as upcoming";

/** What the form hands over for a future When. */
export type FutureForm = {
  form: FormKind;
  healthType: HealthType;
  /** The picked day, `YYYY-MM-DD`, and the time of day `HH:MM` (null for a weight, which is a day). */
  day: string;
  time: string | null;
  note: string;
  repeatEvery: number | null;
  repeatUnit: RepeatUnit | null;
  /** A vet visit's reason id, when one is picked. */
  reason?: string;
  /** A medication's name, dose and unit, when picked. */
  med?: { name: string; dose: number | null; unit: string } | null;
  /** A vaccine's id and dose number (TEC-259), when picked: the plan's title names them. */
  vaccine?: { id: string; dose: number | null } | null;
  /** The photos and files on the form (TEC-203): paths, and the original name of each file that is not a picture. */
  photos?: readonly string[];
  names?: Record<string, string>;
};

/** The item's kind for a form: a vet visit and a medication have their own, everything else is Other. */
export function futureKind(form: FormKind, healthType: HealthType): UpcomingKind {
  if (form === "health") return healthType === "vet" ? "vet" : healthType === "medication" ? "medication" : healthType === "vaccine" ? "vaccine" : "other";
  return "other";
}

/** Titles an Other item made from a form carries: the form's own name, so Done can open the form again. */
export const FORM_TITLES: readonly string[] = [
  FORM_LABELS.potty,
  FORM_LABELS.food,
  FORM_LABELS.fun,
  FORM_LABELS.training,
  FORM_LABELS.weight,
  HEALTH_LABELS.issue,
];

const SEP = " · ";

/** The item's title: "Training", "Medical issue", "Vet visit · Check-up", "Name · 5 mg" (the medication, then its dose). */
export function futureTitle(x: Pick<FutureForm, "form" | "healthType" | "reason" | "med" | "vaccine">): string {
  if (x.form !== "health") return FORM_LABELS[x.form];
  if (x.healthType === "issue") return HEALTH_LABELS.issue;
  // "Vaccine · DHPP · dose 3" (TEC-259), so Done opens the Vaccine form on that vaccine and dose.
  if (x.healthType === "vaccine") return x.vaccine ? vaccinePlanTitle(x.vaccine.id, x.vaccine.dose) : HEALTH_LABELS.vaccine;
  if (x.healthType === "vet") {
    const label = VET_REASONS.find(([id]) => id === x.reason)?.[1];
    return label ? `${HEALTH_LABELS.vet}${SEP}${label}` : HEALTH_LABELS.vet;
  }
  if (!x.med?.name) return HEALTH_LABELS.medication;
  return x.med.dose ? `${x.med.name}${SEP}${x.med.dose} ${x.med.unit}` : x.med.name;
}

/**
 * The upcoming item a future When saves: kind from the form (Vet visit, Medication, or Other with the form's
 * name), the picked day and time, the form's note and an optional repeat. Checked as the server will
 * (`parseUpcoming`), so a mistake is caught before the sheet closes. Throws `InvalidEvent`.
 */
export function futureItem(x: FutureForm): UpcomingInput {
  const title = futureTitle(x);
  return parseUpcoming({
    kind: futureKind(x.form, x.healthType),
    title: title.length > TITLE_MAX ? title.slice(0, TITLE_MAX) : title,
    due_on: x.day,
    due_time: x.time,
    note: x.note,
    repeat_every: x.repeatEvery,
    repeat_unit: x.repeatUnit,
    ...(x.photos?.length ? { attachments: { photos: x.photos, ...(x.names ? { names: x.names } : {}) } } : {}),
  });
}

/** Open items due within the coming week, overdue ones too, soonest first: the Log screen's Next 7 days box. */
export function nextWeek(items: readonly Upcoming[], today: string): Upcoming[] {
  return openItems(items).filter((i) => daysBetween(today, i.due_on) <= SOON_DAYS);
}

/** The Upcoming filter: every open item, soonest first. */
export function allUpcoming(items: readonly Upcoming[]): Upcoming[] {
  return openItems(items);
}

/** Which form a Done opens for an item, or null when Done just marks it done (an old Other item with its own words). */
export function formForItem(item: Pick<Upcoming, "kind" | "title">): { form: FormKind; healthType: HealthType } | null {
  // A plan the Vaccine form made names its vaccine; an older "Rabies booster" still closes through a vet visit.
  if (item.kind === "vaccine" && (item.title === HEALTH_LABELS.vaccine || parseVaccinePlanTitle(item.title))) return { form: "health", healthType: "vaccine" };
  if (item.kind === "vet" || item.kind === "vaccine") return { form: "health", healthType: "vet" };
  if (item.kind === "medication") return { form: "health", healthType: "medication" };
  if (item.title === HEALTH_LABELS.issue) return { form: "health", healthType: "issue" };
  const form = (["potty", "food", "fun", "training", "weight"] as const).find((f) => FORM_LABELS[f] === item.title);
  return form ? { form, healthType: "vet" } : null;
}

/** What a form opens with for a Done: the item's day and time, and what its title and note say. */
export type DonePrefill = {
  day: string;
  time: string;
  reason: string;
  note: string;
  /** A Vaccine plan's vaccine and dose number (TEC-259), from its title; empty for any other item. */
  vaccine: string;
  vaccineDose: number | null;
  /** A medication's id (when the title names one in the list, a retired one too), and the dose and unit its title carries. */
  medId: string;
  dose: string;
  unit: string;
  /** The item's attachments (TEC-203), which the entry a Done creates carries, or the form of an edit opens with. */
  photos: string[];
  names: Record<string, string>;
};

/**
 * The prefill for a Done. A vet visit or vaccine keeps `visitPrefill`'s day, time and reason (a form-made
 * "Vet visit · Check-up" gives its reason too). The note is the item's own note, and the title as well when it
 * is the item's own words rather than a form's name. A medication's title "Name · 5 mg" gives the medication,
 * the dose and the unit.
 */
export function donePrefill(
  item: Pick<Upcoming, "kind" | "title" | "note" | "due_on" | "due_time"> & { attachments?: Attachments | null },
  meds: readonly Medication[] = []
): DonePrefill {
  const base = visitPrefill(item);
  const [head, tail] = item.title.split(SEP);
  const formMade = FORM_TITLES.includes(item.title) || head === HEALTH_LABELS.vet;
  let reason = base.reason;
  if (item.kind === "vet" && head === HEALTH_LABELS.vet && tail) reason = VET_REASONS.find(([, label]) => label === tail)?.[0] ?? reason;
  let medId = "";
  let dose = "";
  let unit = "";
  if (item.kind === "medication") {
    const m = /^(\d+(?:\.\d+)?) (\S+)$/.exec(tail ?? "");
    if (m && (MED_UNITS as readonly string[]).includes(m[2])) [dose, unit] = [m[1], m[2]];
    medId = meds.find((x) => x.name.toLowerCase() === head.trim().toLowerCase())?.id ?? "";
  }
  const planned = item.kind === "vaccine" ? parseVaccinePlanTitle(item.title) : null;
  const own = formMade || item.kind === "medication" || planned || item.title === HEALTH_LABELS.vaccine ? "" : item.title;
  return {
    day: base.day,
    time: base.time,
    reason,
    note: [own, item.note].filter(Boolean).join(" — "),
    vaccine: planned?.vaccine ?? "",
    vaccineDose: planned?.dose ?? null,
    medId,
    dose,
    unit,
    photos: item.attachments?.photos ? [...item.attachments.photos] : [],
    names: item.attachments?.names ? { ...item.attachments.names } : {},
  };
}

/**
 * The When a Done form opens on: the item's day and time when that has come, else null (the form's own
 * "now"). Saving a Done early must not read as a second future entry.
 */
export function doneWhen(p: Pick<DonePrefill, "day" | "time">, now: Date): string | null {
  const when = new Date(`${p.day}T${p.time}`);
  return Number.isNaN(when.getTime()) || when.getTime() > now.getTime() ? null : `${p.day}T${p.time}`;
}
