/**
 * The journal's rules, with no I/O so every one is tested.
 *
 * History is append-only (RULES.md, Never 1). A row is never changed: a
 * correction is a new event of the same kind whose `voids` names the one it
 * replaces, and a delete is a `void` event naming it. An event is **live** when
 * nothing voids it. Every screen reads live events only.
 *
 * Five kinds, each logged through a short form with defaults: potty, food,
 * exercise, weight, health. The shapes of `details` below are also enforced by
 * the database (migrations `lando_people_and_events`, then
 * `widen_lando_events_details_shape`, then `widen_lando_potty_none`, then
 * `lando_health_events`, `lando_health_picklist`, `lando_issue_links`, `lando_vet_weight`,
 * `lando_potty_inside_spot`, `lando_details_ok_search_path`, `lando_potty_minutes`,
 * `lando_box_leash_spot`); change both together.
 */

import { FOOD_TYPES, FOOD_UNITS, cleanFoodName, findFood, foodNameTaken, formatAmount, treatQtyError, unitLabel, type AddedFood, type FoodType, type FoodUnit } from "./foods";
import { dateLabel, fromDateInput, localMidnight, shortDate, toDateInput } from "./localtime";

export const LOG_KINDS = ["potty", "food", "exercise", "weight", "health"] as const;
export type LogKind = (typeof LOG_KINDS)[number];
export type Kind = LogKind | "void";

export const KIND_LABELS: Record<LogKind, string> = {
  potty: "Potty",
  food: "Food",
  exercise: "Exercise",
  weight: "Weight",
  health: "Health",
};

/**
 * The six forms on the Log tab (TEC-136): Fun and Training replace Exercise.
 * Both save as kind `exercise` with the existing `type`; the data shape is
 * unchanged. Fun is walk or playtime, Training is `type: "training"`.
 */
export const FORM_KINDS = ["potty", "food", "fun", "training", "weight", "health"] as const;
export type FormKind = (typeof FORM_KINDS)[number];
export const FORM_LABELS: Record<FormKind, string> = {
  potty: "Potty",
  food: "Food",
  fun: "Fun",
  training: "Training",
  weight: "Weight",
  health: "Health",
};

/** The kind a form saves. */
export function kindOfForm(form: FormKind): LogKind {
  return form === "fun" || form === "training" ? "exercise" : form;
}

/** The form an entry opens in, and the filter chip it falls under. Null for a void. */
export function formOf(e: { kind: Kind; details: Details }): FormKind | null {
  if (e.kind === "void") return null;
  if (e.kind === "exercise") return (e.details as ExerciseDetails).type === "training" ? "training" : "fun";
  return e.kind;
}

/* ── Shapes ──────────────────────────────────────────────────────────────── */

/**
 * `none` is a trip out with nothing done ("No potty", TEC-129): logged, but it
 * resets neither clock, is never an accident, and counts as no pee or poop.
 */
export const POTTY_WHAT = ["pee", "poop", "both", "none"] as const;
export type PottyWhat = (typeof POTTY_WHAT)[number];
export const POTTY_WHAT_LABELS: Record<PottyWhat, string> = { pee: "Pee", poop: "Poop", both: "Both", none: "No potty" };
export const WHERE = ["outside", "inside"] as const;
/**
 * How an outside potty went. `box` is offered since TEC-186; `pen` is retired the way the food catalogue
 * and the health reasons retire an id (RULES.md, Settled): not offered, still accepted here and by
 * `lando.details_ok`, still labelled, and kept by a correction. Never delete or re-id one.
 */
export const LEASH = ["leashed", "unleashed", "box", "pen"] as const;
export type Leash = (typeof LEASH)[number];
export const LEASH_LABELS: Record<Leash, string> = { leashed: "Leashed", unleashed: "Unleashed", box: "In box", pen: "In pen" };
/** What the Leash pick offers, in order. */
export const LEASH_OFFERED = ["leashed", "unleashed", "box"] as const satisfies readonly Leash[];
/** Where an inside potty happened (inside only). `box` is offered; `crate` and `pen` are retired, as above. */
export const SPOT = ["box", "loose", "crate", "pen"] as const;
export type Spot = (typeof SPOT)[number];
export const SPOT_LABELS: Record<Spot, string> = { box: "Box", loose: "Loose", crate: "Crate", pen: "Pen" };
/** What the Spot pick offers, in order. */
export const SPOT_OFFERED = ["box", "loose"] as const satisfies readonly Spot[];

type Opts<T extends string> = readonly (readonly [T, string])[];

/**
 * The Leash chips: the offered ones, plus the entry's own retired value (shown picked) when a correction
 * opens on one, so it is visible and saved unchanged until another is tapped.
 */
export function leashOptions(current: Leash | "" | null | undefined): Opts<Leash> {
  const ids: Leash[] = [...LEASH_OFFERED];
  if (current && !ids.includes(current)) ids.push(current);
  return ids.map((id) => [id, LEASH_LABELS[id]] as const);
}

/** The Spot chips, the same way. */
export function spotOptions(current: Spot | "" | null | undefined): Opts<Spot> {
  const ids: Spot[] = [...SPOT_OFFERED];
  if (current && !ids.includes(current)) ids.push(current);
  return ids.map((id) => [id, SPOT_LABELS[id]] as const);
}

/**
 * Time outside is picked from range chips only (TEC-186, ranges TEC-193): up to 5, 5 to 15, 15 to 30, 30 to
 * 45 and 45 to 60 minutes. A chip stores its upper bound in `minutes`, so the stored value is still any
 * whole 1 to OUT_MINUTES_MAX, which the server and database accept: an older entry holding another number
 * (10, 20, 25) keeps it and reads "N min".
 */
export const OUT_MINUTES_CHIPS = [5, 15, 30, 45, 60] as const;
export const OUT_MINUTES_MAX = 120;
const OUT_RANGES: Record<number, string> = { 5: "≤5", 15: "5–15", 30: "15–30", 45: "30–45", 60: "45–60" };
/** A chip's face: "≤5", "5–15"… (the upper bound is what it saves). */
export const outMinutesLabel = (m: number) => OUT_RANGES[m] ?? String(m);
/** The feed's words for a stored `minutes`: a range for the five chip values, "N min" for any other. */
export const outMinutesText = (m: number) => `${outMinutesLabel(m)} min`;
/** A chip's name for a screen reader. */
export const outMinutesAria = (m: number) => (m === 5 ? "5 minutes or less" : `${OUT_RANGES[m].replace("–", " to ")} minutes`);
/** The chip a stored value matches, or null (an older value such as 10 picks no chip). */
export const outMinutesChip = (m: number | null | undefined): number | null =>
  m !== null && m !== undefined && (OUT_MINUTES_CHIPS as readonly number[]).includes(m) ? m : null;
export type PottyDetails = {
  what: PottyWhat;
  where: (typeof WHERE)[number];
  /** Outside only; entries from before it existed have none. */
  leash?: Leash;
  /** Inside only; optional, and entries from before it existed have none. */
  spot?: Spot;
  /** Time outside, whole minutes 1 to OUT_MINUTES_MAX (TEC-176); outside only, optional. */
  minutes?: number;
  /** A medical issue this relates to (TEC-142): the id of a Health issue event, possibly a superseded copy; `resolveIssue` finds the live one. */
  issue?: string;
  /** Storage paths of photos (TEC-142), 1 to MAX_PHOTOS; no key when there are none. */
  photos?: string[];
};

/** A snapshot of the catalogue item at log time, plus how much. */
export type FoodDetails = {
  type: FoodType;
  item_id: string;
  item_name: string;
  kcal_per: number | null;
  unit: string | null;
  amount: number | null;
};

export const EXERCISE_TYPES = ["walk", "playtime", "training"] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];
export const EXERCISE_LABELS: Record<ExerciseType, string> = { walk: "Walk", playtime: "Playtime", training: "Training" };
/** The Fun form's types: exercise without training. */
export const FUN_TYPES = ["walk", "playtime"] as const satisfies readonly ExerciseType[];

/** The fixed list of commands a training session can practise, in display order. */
export const COMMANDS = [
  ["sit", "Sit"],
  ["down", "Down"],
  ["stay", "Stay"],
  ["come", "Come"],
  ["leave-it", "Leave it"],
  ["name", "Name"],
  ["crate", "Crate"],
  ["potty-bell", "Potty bell"],
  ["touch", "Touch"],
  ["heel", "Heel"],
] as const;
export type CommandId = (typeof COMMANDS)[number][0];
const COMMAND_IDS = new Set<string>(COMMANDS.map(([id]) => id));
const COMMAND_LABEL = Object.fromEntries(COMMANDS) as Record<CommandId, string>;

export type ExerciseDetails = {
  type: ExerciseType;
  where: (typeof WHERE)[number];
  with_dogs: boolean;
  minutes: number;
  treats: number;
  /** Training only. */
  commands?: CommandId[];
  /**
   * Which friends' dogs, by `lando.dogs` id: at least one when present, and
   * then `with_dogs` is true. Entries from before it existed carry
   * `with_dogs` alone. The form has no Yes/No: picking a dog is the answer.
   */
  dogs?: string[];
  /** Storage paths of photos (TEC-139), 1 to MAX_PHOTOS; no key when there are none. Same bucket and path as Health's. */
  photos?: string[];
};

/** A friend's dog, from `lando.dogs`. Names live in the database, never in the repo. */
export type Dog = { id: string; name: string };

/** At most this many dogs on one session. */
export const MAX_DOGS = 20;

/*
 * Other dogs is one pick (TEC-129): None, one dog by id, Multiple, or Add dog.
 * These are the picklist values that are not a dog id.
 */
export const DOGS_NONE = "";
export const DOGS_MULTIPLE = "__multiple";
export const DOGS_ADD = "__add";
/** A correction of an entry naming several dogs, or one no longer listed: kept as it was. */
export const DOGS_KEPT = "__kept";

/**
 * The `with_dogs` and `dogs` an Other dogs pick saves. One dog: its id.
 * Multiple: `with_dogs` and no ids (the same shape as an entry from before the
 * list). `kept` is what a correction opened on, saved again while
 * `DOGS_KEPT` is still the pick.
 */
export function dogsFromPick(pick: string, kept: readonly string[] | null): Pick<ExerciseDetails, "with_dogs" | "dogs"> {
  if (pick === DOGS_NONE || pick === DOGS_ADD) return { with_dogs: false };
  if (pick === DOGS_MULTIPLE) return { with_dogs: true };
  if (pick === DOGS_KEPT) return kept?.length ? { with_dogs: true, dogs: [...kept] } : { with_dogs: true };
  return { with_dogs: true, dogs: [pick] };
}

/**
 * What a form opens Other dogs on, for an entry being corrected (or none).
 * `kept` is set when the entry names dogs the single pick cannot show: several,
 * or one no longer in the list.
 */
export function dogsPickFor(
  x: Pick<ExerciseDetails, "with_dogs" | "dogs"> | null,
  dogs: readonly Dog[]
): { pick: string; kept: string[] | null } {
  if (!x) return { pick: DOGS_NONE, kept: null };
  const ids = x.dogs ?? [];
  if (ids.length === 1 && dogs.some((d) => d.id === ids[0])) return { pick: ids[0], kept: null };
  if (ids.length) return { pick: DOGS_KEPT, kept: [...ids] };
  return { pick: x.with_dogs ? DOGS_MULTIPLE : DOGS_NONE, kept: null };
}

export const UNITS = ["lb", "kg"] as const;
export type Unit = (typeof UNITS)[number];
const KG_PER_LB = 0.45359237;
export type WeightDetails = {
  value: number;
  unit: Unit;
  /** Set when a vet visit's Weight field saved it (TEC-151): the id of that visit, possibly a superseded copy; `resolveVisit` finds the live one. */
  visit?: string;
};

/* ── Health (TEC-137) ────────────────────────────────────────────────────── */

/** A vet visit, or a medical issue noticed at home. Photos can go on either. */
export const HEALTH_TYPES = ["vet", "issue"] as const;
export type HealthType = (typeof HEALTH_TYPES)[number];
export const HEALTH_LABELS: Record<HealthType, string> = { vet: "Vet visit", issue: "Medical issue" };

/**
 * Why we went to the vet: one high-level pick (TEC-139), the detail goes in
 * the note. Fixed in code and in the database check (`lando.details_ok`,
 * widened by `lando_health_picklist`), like COMMANDS: add to both. Display
 * order. A retired id stays valid (below), so none is ever removed.
 */
export const VET_REASONS = [
  ["checkup", "Check-up"],
  ["vaccines", "Vaccines"],
  ["sick-injured", "Sick or injured"],
  ["procedure", "Procedure (spay/neuter, dental)"],
  ["follow-up", "Follow-up"],
  ["other", "Other"],
] as const;

/** What the medical issue is, one high-level pick. Fixed in code and in the check. */
export const ISSUE_PICKS = [
  ["stomach-appetite", "Stomach & appetite"],
  ["skin-ears-eyes", "Skin, ears & eyes"],
  ["limping-injury", "Limping or injury"],
  ["breathing-cough", "Breathing or cough"],
  ["energy-behaviour", "Energy or behaviour"],
  ["other", "Other"],
] as const;

/**
 * TEC-137's detailed reasons, retired by TEC-139 the way the food catalogue
 * retires items: the form no longer offers them, but `parseDetails` and the
 * database still accept them, the feed still labels them, and a correction
 * opens on them as a kept option. Never delete one or change its id: old
 * entries (several reasons each) are keyed by them.
 */
export const VET_RETIRED = [
  ["deworming", "Deworming / fecal test"],
  ["flea-tick-heartworm", "Flea, tick & heartworm"],
  ["spay-neuter", "Spay / neuter"],
  ["dental", "Dental"],
  ["microchip", "Microchip"],
  ["sick", "Sick visit"],
  ["injury", "Injury"],
  ["skin-ears", "Skin or ears"],
  ["stomach", "Stomach upset"],
  ["recheck", "Recheck / follow-up"],
] as const;

export const ISSUE_RETIRED = [
  ["vomiting", "Vomiting"],
  ["diarrhea", "Diarrhea"],
  ["limping", "Limping"],
  ["itching-skin", "Itching / skin"],
  ["ear", "Ear"],
  ["eye", "Eye"],
  ["cough-sneeze", "Cough / sneeze"],
  ["not-eating", "Not eating"],
  ["low-energy", "Low energy"],
  ["wound", "Cut / wound"],
  ["ate-something", "Ate something"],
] as const;

type Pair = readonly (readonly [string, string])[];

/** The pick list a health type offers. */
export function healthOptions(type: HealthType): Pair {
  return type === "vet" ? VET_REASONS : ISSUE_PICKS;
}

/** Every id the type accepts: the offered picks, then the retired ones. */
export function healthAccepted(type: HealthType): Pair {
  return type === "vet" ? [...VET_REASONS, ...VET_RETIRED] : [...ISSUE_PICKS, ...ISSUE_RETIRED];
}

/** A reason's label, offered or retired, else the stored id as it is. */
export function healthReasonLabel(type: HealthType, id: string): string {
  return healthAccepted(type).find(([v]) => v === id)?.[1] ?? id;
}

/** The select's extra option for an entry's retired or several reasons, kept unchanged until another pick is made. */
export const HEALTH_KEPT = "__kept";

/**
 * What the Health select opens on. A new entry has no pick; an entry with
 * exactly one offered reason opens on it; anything else (several reasons, or
 * a retired one) opens on `HEALTH_KEPT` carrying those reasons as they were.
 */
export function healthPickFor(h: Pick<HealthDetails, "type" | "reasons"> | null): { pick: string; kept: string[] | null } {
  if (!h) return { pick: "", kept: null };
  const [only] = h.reasons;
  if (h.reasons.length === 1 && healthOptions(h.type).some(([id]) => id === only)) return { pick: only, kept: null };
  return { pick: HEALTH_KEPT, kept: [...h.reasons] };
}

/** The `reasons` a pick saves: one id, the kept ones unchanged, or none. */
export function healthReasonsFromPick(pick: string, kept: readonly string[] | null): string[] {
  if (pick === HEALTH_KEPT) return kept ? [...kept] : [];
  return pick ? [pick] : [];
}

/**
 * A new entry takes exactly one offered reason. A correction may also keep the
 * entry it replaces unchanged, when that one is older (several reasons, or a
 * retired one). Throws `InvalidEvent`.
 */
export function checkHealthReasons(next: { details: Details }, target: { kind: string; details: Details } | null): void {
  const d = next.details as HealthDetails;
  if (d.reasons.length === 1 && healthOptions(d.type).some(([id]) => id === d.reasons[0])) return;
  if (target?.kind === "health") {
    const t = target.details as HealthDetails;
    const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
    if (t.type === d.type && same(t.reasons, d.reasons)) return;
  }
  throw new InvalidEvent(d.type === "vet" ? "pick one reason for the vet visit" : "pick one thing for the issue");
}

/** At most this many photos on one entry. */
export const MAX_PHOTOS = 6;

/**
 * A photo's storage path in the private bucket: `health/<id>.<ext>`, the id
 * chosen by the phone and the extension by the upload's type. Only this path
 * is stored in the event, never the picture or a URL (a signed URL expires).
 */
export const PHOTO_PATH = /^health\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export type HealthDetails = {
  type: HealthType;
  /** One from the type's list; an entry from before TEC-139 may hold several, or retired ids. */
  reasons: string[];
  /** Storage paths, 1 to MAX_PHOTOS; no key when there are none. */
  photos?: string[];
  /** Vet visits only (TEC-142): the id of the Health issue event it relates to; `resolveIssue` finds the live one. */
  issue?: string;
};

export type Details = Record<string, unknown>;

export type JournalEvent = {
  id: string;
  kind: Kind;
  at: string;
  person_id: string | null;
  details: Details;
  note: string | null;
  voids: string | null;
  created_at: string;
};

/* The server validated every row on the way in, so these are views, not checks. */
export const potty = (e: Pick<JournalEvent, "details">) => e.details as PottyDetails;
export const food = (e: Pick<JournalEvent, "details">) => e.details as FoodDetails;
export const exercise = (e: Pick<JournalEvent, "details">) => e.details as ExerciseDetails;
export const weight = (e: Pick<JournalEvent, "details">) => e.details as WeightDetails;
export const health = (e: Pick<JournalEvent, "details">) => e.details as HealthDetails;

/** The photo paths an entry names: Health's, Fun's, Training's and Potty's (TEC-139, TEC-142); none for any other kind. */
export function eventPhotos(e: Pick<JournalEvent, "kind" | "details">): string[] {
  if (e.kind !== "health" && e.kind !== "exercise" && e.kind !== "potty") return [];
  const p = (e.details as { photos?: unknown }).photos;
  return Array.isArray(p) ? (p as string[]) : [];
}

/**
 * Inside is an accident: warned in the form, red in the timeline, counted
 * apart. A No potty is never one, wherever it was: nothing happened.
 */
export const isAccident = (e: Pick<JournalEvent, "kind" | "details">) =>
  e.kind === "potty" && potty(e).where === "inside" && potty(e).what !== "none";

/* ── Reading ─────────────────────────────────────────────────────────────── */

/** Live events: every non-void event that no other event voids. Order is kept. */
export function liveEvents(events: JournalEvent[]): JournalEvent[] {
  const voided = new Set<string>();
  for (const e of events) if (e.voids) voided.add(e.voids);
  return events.filter((e) => e.kind !== "void" && !voided.has(e.id));
}

/** Newest first by `at`, then by `created_at` so two saves in one second keep their order. */
export function newestFirst(a: JournalEvent, b: JournalEvent): number {
  return Date.parse(b.at) - Date.parse(a.at) || Date.parse(b.created_at) - Date.parse(a.created_at);
}

/* ── The feed (TEC-136) ──────────────────────────────────────────────────── */

/**
 * When a row happened, for ordering: its `at` (the When picked in the form),
 * never `created_at`. A weight is a day, so it orders at local noon of its day
 * whatever time an older one was logged at.
 */
export function happenedAt(e: { kind: Kind; at: string }): number {
  if (e.kind === "weight") {
    const noon = fromDateInput(toDateInput(e.at));
    if (noon) return Date.parse(noon);
  }
  return Date.parse(e.at);
}

/** A feed row: a saved entry (`created_at` set) or one not saved yet (`created_at` null). */
export type FeedRow<T> = { kind: Kind; at: string; created_at: string | null; item: T };
export type FeedDay<T> = { day: string; label: string; rows: FeedRow<T>[] };

/**
 * Rows grouped under the phone's local day they happened on, newest day first
 * and newest first within a day, by `happenedAt`. Ties: unsaved rows first,
 * then the later save. Labels are "Today", "Yesterday", then a short date.
 */
export function feedDays<T>(rows: FeedRow<T>[], now: Date): FeedDay<T>[] {
  const unsavedFirst = (r: FeedRow<T>) => (r.created_at === null ? 0 : 1);
  const sorted = [...rows].sort(
    (a, b) =>
      happenedAt(b) - happenedAt(a) ||
      unsavedFirst(a) - unsavedFirst(b) ||
      (a.created_at && b.created_at ? Date.parse(b.created_at) - Date.parse(a.created_at) : 0)
  );
  const out: FeedDay<T>[] = [];
  for (const r of sorted) {
    const day = toDateInput(new Date(happenedAt(r)).toISOString());
    const last = out[out.length - 1];
    if (last?.day === day) last.rows.push(r);
    else out.push({ day, label: dateLabel(day, now), rows: [r] });
  }
  return out;
}

/**
 * The feed filter's picks (TEC-177): none is All. Tapping a form's pill adds it
 * or takes it off; picking all six reads as All, so the picks clear.
 */
export function toggleForm(picks: readonly FormKind[], k: FormKind): FormKind[] {
  const next = picks.includes(k) ? picks.filter((x) => x !== k) : [...picks, k];
  return next.length >= FORM_KINDS.length ? [] : next;
}

/** Whether an entry of this form shows under the picks: everything when none is picked. */
export function inPicks(picks: readonly FormKind[], form: FormKind | null): boolean {
  return picks.length === 0 || (form !== null && picks.includes(form));
}

/**
 * What colours a feed row (TEC-177): its form, or `accident` for an inside
 * potty, which stays red over Potty's colour (`--lando-kind-*` in globals.css).
 */
export type FeedTone = FormKind | "accident";
export function feedTone(e: Pick<JournalEvent, "kind" | "details">): FeedTone | null {
  if (isAccident(e)) return "accident";
  return formOf(e);
}

/**
 * The empty feed's line: "Nothing logged yet." or, under one pick, "No training
 * entries yet."; under several, "No entries yet for those."
 */
export function emptyFeedText(picks: FormKind | readonly FormKind[] | null): string {
  const list = picks === null ? [] : typeof picks === "string" ? [picks] : picks;
  if (list.length === 0) return "Nothing logged yet.";
  return list.length === 1 ? `No ${FORM_LABELS[list[0]].toLowerCase()} entries yet.` : "No entries yet for those.";
}

/**
 * The treats logged from a training's Treats pop-up: live food treats at the
 * training's exact time. Each is saved at the session's `at`, to the
 * millisecond, so nothing else lands on it; there is no link column (the data
 * shape is unchanged). A correction that moves the session's time leaves its
 * treats where they were, and they then no longer show on it.
 */
export function treatsWith(events: JournalEvent[], training: Pick<JournalEvent, "at">): JournalEvent[] {
  const t = Date.parse(training.at);
  return liveEvents(events).filter((e) => e.kind === "food" && food(e).type === "treat" && Date.parse(e.at) === t);
}

/**
 * A treat picked in Training's Treats pop-up, waiting in the form for the
 * session's Save. Its id is fixed when it is picked, so a retry is the same row.
 */
export type QueuedTreat = { id: string; item_id: string; amount: number | null };

/**
 * The food entry a queued treat becomes: a `treat` at the session's time, by
 * the session's person, with no note. Throws `InvalidEvent` like any form.
 */
export function treatEntry(
  t: QueuedTreat,
  at: string,
  personId: string | null,
  added: readonly AddedFood[] = []
): { id: string; kind: "food"; at: string; person_id: string | null; details: Details; note: null } {
  return {
    id: t.id,
    kind: "food",
    at,
    person_id: personId,
    details: parseDetails("food", { type: "treat", item_id: t.item_id, amount: t.amount }, added),
    note: null,
  };
}

/** The inline treat row on Potty and Training (TEC-193): the pick, how many, and the id its entry will have. */
export type InlineTreat = { id: string; item_id: string; qty: number | null };

/**
 * What the inline treat row saves after its parent: one treat entry at the parent's time and person, or
 * nothing when the quantity is empty or 0. The row opens at 0, so a form saved without touching it logs no
 * treat. Any other quantity must be a whole number, 1 or more. Throws `InvalidEvent` like any form.
 */
export function inlineTreatEntries(
  t: InlineTreat,
  at: string,
  personId: string | null,
  added: readonly AddedFood[] = []
): ReturnType<typeof treatEntry>[] {
  if (t.qty === null || t.qty === 0) return [];
  const bad = treatQtyError(t.qty);
  if (bad) throw new InvalidEvent(bad);
  return [treatEntry({ id: t.id, item_id: t.item_id, amount: t.qty }, at, personId, added)];
}

/** How far behind today the journal is read. A clock with nothing in it says so. */
export const HORIZON_DAYS = 30;

export type Clock = "pee" | "poop" | "food" | "exercise";
export const CLOCKS: Clock[] = ["pee", "poop", "food", "exercise"];
/** The pills' faces. The `exercise` clock is Fun (TEC-186): walks and playtime only, a training does not reset it. */
export const CLOCK_LABELS: Record<Clock, string> = { pee: "Pee", poop: "Poop", food: "Meal", exercise: "Fun" };

/**
 * What a tapped pill, or the Treats button, opens its form on (TEC-181, TEC-186). Pee and Poop: Potty,
 * outside, leashed, which is the form's own default, so only the `what` is set. Meal: Food with the last
 * meal's item and amount; null item and amount mean the form's usual defaults. Fun: the Fun form on a new
 * entry, all defaults. Treats (the button, not a pill): Food on a treat, with a treat's usual defaults.
 */
export type QuickLog =
  | { form: "potty"; what: "pee" | "poop" }
  | { form: "food"; itemId: string | null; amount: number | null; type?: "treat" }
  | { form: "fun" };

/** The Treats button: the Food form opened on a treat (the meal/treat choice stays in the form). */
export const TREAT_QUICK_LOG: QuickLog = { form: "food", itemId: null, amount: null, type: "treat" };

export function quickLog(clock: Clock, lastMeal: JournalEvent | null, added: readonly AddedFood[] = []): QuickLog | null {
  if (clock === "pee" || clock === "poop") return { form: "potty", what: clock };
  if (clock === "exercise") return { form: "fun" };
  // `lastMeal` is `sinceLast`'s food clock: a live meal, never a treat. A meal whose item the
  // catalogue no longer lists opens on the usual defaults rather than an id the form cannot show.
  const none: QuickLog = { form: "food", itemId: null, amount: null };
  if (!lastMeal || lastMeal.kind !== "food") return none;
  const f = food(lastMeal);
  if (f.type !== "meal" || !findFood("meal", f.item_id, added)) return none;
  return { form: "food", itemId: f.item_id, amount: typeof f.amount === "number" ? f.amount : null };
}

/**
 * The potty a Fun form's Pee or Poop button logs (TEC-186), from the form's current state. A walk is
 * outside and leashed; playtime outside is outside; playtime inside is inside, an accident. Training has
 * no such buttons (null). Pure; the form adds the time (the tap) and the person.
 */
export function funPotty(
  fun: { type: ExerciseType; where: (typeof WHERE)[number] },
  what: "pee" | "poop"
): PottyDetails | null {
  if (fun.type === "walk") return { what, where: "outside", leash: "leashed" };
  if (fun.type === "playtime") return { what, where: fun.where };
  return null;
}

function countsFor(e: JournalEvent, clock: Clock): boolean {
  switch (clock) {
    case "pee":
    case "poop": {
      // An accident inside is still a pee or a poop, and the next one is due
      // from it. A No potty is neither: the clock keeps running.
      if (e.kind !== "potty") return false;
      const w = potty(e).what;
      return w === clock || w === "both";
    }
    case "food":
      // The food clock is the last meal (TEC-142): a treat is not a meal and
      // does not reset it.
      return e.kind === "food" && food(e).type === "meal";
    default:
      // The Fun clock (TEC-186): walks and playtime; a training does not reset it.
      return e.kind === "exercise" && exercise(e).type !== "training";
  }
}

/**
 * The most recent live event for each clock, or null when there is none in
 * what was read. An event in the future (a mistyped time) is ignored, so a clock
 * never reads "in 3 hours".
 */
export function sinceLast(events: JournalEvent[], now: Date): Record<Clock, JournalEvent | null> {
  const out: Record<Clock, JournalEvent | null> = { pee: null, poop: null, food: null, exercise: null };
  const t = now.getTime();
  for (const e of liveEvents(events)) {
    if (Date.parse(e.at) > t) continue;
    for (const c of CLOCKS) {
      if (!countsFor(e, c)) continue;
      const cur = out[c];
      if (!cur || newestFirst(e, cur) < 0) out[c] = e;
    }
  }
  return out;
}

/* ── The Meal pill's label (TEC-194) ─────────────────────────────────────── */

const EIGHTHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];

/** Cups rounded to the nearest ⅛ (never below ⅛) as a mixed fraction: "⅞", "1⅛", "2". */
export function formatCups(cups: number): string {
  const eighths = Math.max(1, Math.round(cups * 8));
  return `${Math.floor(eighths / 8) || ""}${EIGHTHS[eighths % 8]}`;
}

/** "cup" at one or less, "cups" above it, judged on the rounded ⅛ amount. */
export function cupsWord(cups: number): string {
  return Math.max(1, Math.round(cups * 8)) <= 8 ? "cup" : "cups";
}

/**
 * Today's meals for the Meal pill: how many (live meals on the phone's day, voids out, treats never)
 * and the cups eaten (only meals logged in cups add; Misc and other units count toward `count` alone).
 * `cups` is null when no meal today has a cup amount.
 */
export function mealsSummary(events: JournalEvent[], now: Date): { count: number; cups: number | null } {
  const start = localMidnight(now).getTime();
  const end = start + 86_400_000;
  let count = 0;
  let cups: number | null = null;
  for (const e of liveEvents(events)) {
    if (e.kind !== "food" || food(e).type !== "meal") continue;
    const t = Date.parse(e.at);
    if (t < start || t >= end) continue;
    count++;
    const f = food(e);
    if (f.unit === "cup" && typeof f.amount === "number" && f.amount > 0) cups = (cups ?? 0) + f.amount;
  }
  return { count, cups };
}

/** The Meal pill's face: "Meals: 2 · 1⅛ cups", or "Meals: 2" when no cup amount was logged. */
export function mealPillLabel(events: JournalEvent[], now: Date): string {
  const { count, cups } = mealsSummary(events, now);
  return cups === null ? `Meals: ${count}` : `Meals: ${count} · ${formatCups(cups)} ${cupsWord(cups)}`;
}

/**
 * Short enough for a pill, never more than six characters: "now", "47m",
 * "2h 5m", "14h", "3d 4h", "12d". Past ten hours the minutes are dropped, and
 * past ten days the hours.
 */
export function formatAgo(fromIso: string, now: Date): string {
  const mins = Math.floor((now.getTime() - Date.parse(fromIso)) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h >= 10 && h < 24) return `${h}h`;
  if (h < 24) {
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  if (d >= 10) return `${d}d`;
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

/* ── Pill status (TEC-142) ───────────────────────────────────────────────── */

const HOUR_MS = 3_600_000;

/** Pee and poop: green under 1 h, yellow from 1 h up to and including 3 h, red over 3 h. */
export const POTTY_YELLOW_MS = 1 * HOUR_MS;
export const POTTY_RED_MS = 3 * HOUR_MS;
/** Food, the last meal only: green under 3 h, yellow from 3 h, red at 5 h or more. */
export const MEAL_YELLOW_MS = 3 * HOUR_MS;
export const MEAL_RED_MS = 5 * HOUR_MS;

export type PillStatus = "green" | "yellow" | "red";
export const PILL_STATUS_WORDS: Record<PillStatus, string> = {
  green: "green, recent",
  yellow: "yellow, getting long",
  red: "red, overdue",
};

/**
 * The colour of a since-last pill, from the time since its last event.
 * Exercise is never coloured, and neither is a pill with nothing in it
 * (`elapsedMs` null): "none" stays neutral. A time in the future reads as 0.
 */
export function pillStatus(clock: Clock, elapsedMs: number | null): PillStatus | null {
  if (elapsedMs === null || clock === "exercise") return null;
  const ms = Math.max(0, elapsedMs);
  if (clock === "food") return ms >= MEAL_RED_MS ? "red" : ms >= MEAL_YELLOW_MS ? "yellow" : "green";
  return ms > POTTY_RED_MS ? "red" : ms >= POTTY_YELLOW_MS ? "yellow" : "green";
}

/* ── Linking to a medical issue (TEC-142) ────────────────────────────────── */

const isIssueEvent = (e: Pick<JournalEvent, "kind" | "details">) => e.kind === "health" && health(e).type === "issue";

/** Where a link ends up: the live version of the target, a deleted one, or an id nothing read knows. */
export type Link = { state: "live"; event: JournalEvent } | { state: "removed" } | { state: "unknown" };
export type IssueLink = Link;

type LinkIndex = { byId: Map<string, JournalEvent>; voiderOf: Map<string, JournalEvent> };

function linkIndex(events: JournalEvent[]): LinkIndex {
  const byId = new Map(events.map((e) => [e.id, e]));
  const voiderOf = new Map<string, JournalEvent>();
  for (const e of events) if (e.voids) voiderOf.set(e.voids, e);
  return { byId, voiderOf };
}

/** Follow `id` through the `voids` chain; the end must satisfy `isTarget` to be live. Shared by issue and visit links. */
function followLink(ix: LinkIndex, id: string, isTarget: (e: JournalEvent) => boolean): Link {
  let cur = id;
  // A chain is never longer than the events, so a cycle (impossible, but) ends.
  for (let i = 0; i <= ix.byId.size; i++) {
    const next = ix.voiderOf.get(cur);
    if (!next) {
      const e = ix.byId.get(cur);
      return e && isTarget(e) ? { state: "live", event: e } : { state: "unknown" };
    }
    if (next.kind === "void") return { state: "removed" };
    cur = next.id;
  }
  return { state: "unknown" };
}

/**
 * Follow a link through the `voids` chain to the live version of the issue.
 * An issue corrected once or twice resolves to its newest copy; one whose
 * chain ends in a delete is `removed`; an id that is not a Health issue in
 * `events` (older than the read, or never there) is `unknown`. `events` holds
 * everything read, voids included. Pure.
 */
export function resolveIssue(events: JournalEvent[], id: string): IssueLink {
  return followLink(linkIndex(events), id, isIssueEvent);
}

/** An issue's first reason as its label: "Stomach & appetite". */
function issuePick(e: JournalEvent): string {
  const h = health(e);
  return healthReasonLabel("issue", h.reasons?.[0] ?? "") || "Issue";
}

/** The feed's words for a link: "re: Stomach & appetite, Oct 24", "removed issue", "re: earlier issue". */
export function issueLinkText(events: JournalEvent[], id: string): string {
  const link = resolveIssue(events, id);
  if (link.state === "removed") return "removed issue";
  if (link.state === "unknown") return "re: earlier issue";
  return `re: ${issuePick(link.event)}, ${shortDate(link.event.at)}`;
}

/** How many recent issues the Related issue select lists. */
export const ISSUE_CHOICES_MAX = 20;

/**
 * The Related issue select's options: recent live medical issues, newest
 * first, labelled by date and pick ("Oct 24 · Stomach & appetite"). When the
 * entry being corrected already links somewhere the list would not show (a
 * superseded copy, a deleted or an old issue), that link is kept as an extra
 * first option so an untouched correction keeps it. `current` is the stored id.
 */
export function issueChoices(events: JournalEvent[], current: string | null): { id: string; label: string }[] {
  const live = liveEvents(events)
    .filter(isIssueEvent)
    .sort(newestFirst)
    .slice(0, ISSUE_CHOICES_MAX)
    .map((e) => ({ id: e.id, label: `${shortDate(e.at)} · ${issuePick(e)}` }));
  if (!current || live.some((c) => c.id === current)) return live;
  const link = resolveIssue(events, current);
  const label =
    link.state === "removed"
      ? "Removed issue"
      : link.state === "unknown"
        ? "Earlier issue"
        : `${shortDate(link.event.at)} · ${issuePick(link.event)}`;
  return [{ id: current, label }, ...live];
}

/**
 * The server's check on a link: the id must be a Health issue event. It may
 * be a voided one, since an old link can point at a superseded copy. `target`
 * is the row with that id, or null. Throws `InvalidEvent`.
 */
export function checkIssueTarget(target: Pick<JournalEvent, "kind" | "details"> | null): void {
  if (!target || !isIssueEvent(target)) throw new InvalidEvent("that medical issue doesn't exist — reload");
}

/* ── A vet visit's weight (TEC-151) ──────────────────────────────────────── */

const isVisitEvent = (e: Pick<JournalEvent, "kind" | "details">) => e.kind === "health" && health(e).type === "vet";

/** The live version of a vet visit a weight links to, resolved the way an issue link is. */
export function resolveVisit(events: JournalEvent[], id: string): Link {
  return followLink(linkIndex(events), id, isVisitEvent);
}

/**
 * The live weight a vet visit's Weight field saved: a live weight whose
 * `visit` resolves, through the `voids` chain, to the live visit `visitId`.
 * A weight corrected from the Weight form keeps its `visit`; one deleted is
 * gone (so the field opens empty); a deleted visit leaves its weight. If more
 * than one qualified, the newest `at`. Pure.
 */
export function linkedWeight(events: JournalEvent[], visitId: string): JournalEvent | null {
  const ix = linkIndex(events);
  return (
    liveEvents(events)
      .filter((e) => {
        if (e.kind !== "weight") return false;
        const v = weight(e).visit;
        if (typeof v !== "string") return false;
        const end = followLink(ix, v, isVisitEvent);
        return end.state === "live" && end.event.id === visitId;
      })
      .sort(newestFirst)[0] ?? null
  );
}

/**
 * The server's check on a weight's `visit`: the id must be a vet visit event
 * (type `vet`). A voided copy passes, since the link may name a superseded
 * one. `target` is the row with that id, or null. Throws `InvalidEvent`.
 */
export function checkVisitTarget(target: Pick<JournalEvent, "kind" | "details"> | null): void {
  if (!target || !isVisitEvent(target)) throw new InvalidEvent("that vet visit doesn't exist — reload");
}

/** An entry saved after another (a training's treat, a vet visit's weight): the shape of a form's body. */
export type FollowUp = {
  id: string;
  kind: LogKind;
  at: string;
  person_id: string | null;
  details: Details;
  note: string | null;
  voids?: string;
};

/**
 * What a vet visit's Weight field adds to Save, to be saved **after** the
 * visit (like a training's treats). `typed` is the field as typed, `linked`
 * the weight already saved with the visit being corrected (`linkedWeight`).
 *
 *  - Blank, nothing linked: no weight. Blank with one linked is refused: the
 *    field opened on it, and a weight that was measured is removed from the
 *    feed, not by a blank box.
 *  - Filled, nothing linked: a new weight on the visit's day (local noon, as
 *    every weight), `visit` the id this visit is saved under.
 *  - Filled, same value and unit as the linked one: nothing; the link follows
 *    the correction by itself.
 *  - Filled, different: a correction of the linked weight (it `voids` it), its
 *    `visit` the corrected visit's new id, so a second weight is never added.
 *
 * Throws `InvalidEvent` on a weight the weight form would refuse.
 */
export function visitWeightPlan(x: {
  typed: string;
  unit: Unit;
  linked: JournalEvent | null;
  weightId: string;
  visitId: string;
  visitAt: string;
  personId: string | null;
}): FollowUp[] {
  const text = x.typed.trim().replace(",", ".");
  if (!text) {
    if (x.linked) throw new InvalidEvent("this visit has a weight — change it here, or delete that weight from the feed");
    return [];
  }
  const value = Number(text);
  const details = parseDetails("weight", { value, unit: x.unit, visit: x.visitId });
  if (x.linked && weight(x.linked).value === value && weight(x.linked).unit === x.unit) return [];
  const at = fromDateInput(toDateInput(x.visitAt));
  if (!at) throw new InvalidEvent("pick a time");
  return [
    {
      id: x.weightId,
      kind: "weight",
      at,
      person_id: x.personId,
      details,
      note: x.linked?.note ?? null,
      ...(x.linked ? { voids: x.linked.id } : {}),
    },
  ];
}

/** A pending row's "+ 2 treats" or "+ 7.6 lb": what is saved after it, so a failed row says what Retry and ✕ carry. */
export function followText(then: readonly Pick<FollowUp, "kind" | "details">[]): string {
  const treats = then.filter((t) => t.kind === "food").length;
  return [
    treats ? `+ ${treats} ${treats === 1 ? "treat" : "treats"}` : "",
    ...then.filter((t) => t.kind === "weight").map((t) => `+ ${round1(weight(t).value)} ${weight(t).unit}`),
  ]
    .filter(Boolean)
    .join(" ");
}

export type GrowthPoint = { at: string; kg: number; id: string };

export function toKg(value: number, unit: Unit): number {
  return unit === "lb" ? value * KG_PER_LB : value;
}

export function fromKg(kg: number, unit: Unit): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

/** Live weights, oldest first, in kilograms. */
export function growthPoints(events: JournalEvent[]): GrowthPoint[] {
  return liveEvents(events)
    .filter((e) => e.kind === "weight" && typeof weight(e).value === "number" && weight(e).unit)
    .map((e) => ({ at: e.at, kg: toKg(weight(e).value, weight(e).unit), id: e.id }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** The newest live weight, or null. */
export function latestWeight(events: JournalEvent[]): JournalEvent | null {
  return (
    liveEvents(events)
      .filter((e) => e.kind === "weight")
      .sort(newestFirst)[0] ?? null
  );
}

/** The unit the chart speaks: the newest weight's, pounds when there is none. */
export function displayUnit(events: JournalEvent[]): Unit {
  const w = latestWeight(events);
  return w ? weight(w).unit : "lb";
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A timeline row: a bold title and one line of what the details say.
 * `dogs` names the friends' dogs an exercise session lists; an id not in it
 * reads "another dog".
 */
export function describe(
  e: Pick<JournalEvent, "kind" | "details"> & { id?: string },
  dogs: readonly Dog[] = [],
  events: JournalEvent[] = []
): { title: string; detail: string } {
  switch (e.kind) {
    case "potty": {
      const p = potty(e);
      // The title says what happened (the form's own words); the detail says where, never the what again.
      const base =
        p.where === "inside"
          ? `${isAccident(e) ? "accident, " : ""}inside${p.spot ? ` · ${SPOT_LABELS[p.spot].toLowerCase()}` : ""}`
          : [
              "outside",
              p.leash ? LEASH_LABELS[p.leash].toLowerCase() : "",
              p.minutes ? outMinutesText(p.minutes) : "",
            ]
              .filter(Boolean)
              .join(" · ");
      const n = p.photos?.length ?? 0;
      const detail = [
        base,
        p.issue ? issueLinkText(events, p.issue) : "",
        n ? `${n} ${n === 1 ? "photo" : "photos"}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return { title: POTTY_WHAT_LABELS[p.what], detail };
    }
    case "food": {
      const f = food(e);
      const amount =
        f.amount === null ? "" : f.unit ? `${formatAmount(f.amount)} ${unitLabel(f.unit, f.amount)}` : formatAmount(f.amount);
      return { title: f.type === "treat" ? "Treat" : "Meal", detail: [f.item_name, amount].filter(Boolean).join(" · ") };
    }
    case "exercise": {
      const x = exercise(e);
      const parts = [
        `${x.minutes} min`,
        x.where,
        x.dogs?.length
          ? `with ${x.dogs.map((id) => dogs.find((d) => d.id === id)?.name ?? "another dog").join(", ")}`
          : x.with_dogs
            ? "with several dogs" // Multiple, and entries from before the list (the owner's call, 2026-10-22)
            : "",
        x.treats ? `${x.treats} ${x.treats === 1 ? "treat" : "treats"}` : "",
        (x.commands ?? []).map((c) => COMMAND_LABEL[c] ?? c).join(", "),
        x.photos?.length ? `${x.photos.length} ${x.photos.length === 1 ? "photo" : "photos"}` : "",
      ];
      return { title: EXERCISE_LABELS[x.type] ?? "Exercise", detail: parts.filter(Boolean).join(" · ") };
    }
    case "weight": {
      const w = weight(e);
      return { title: "Weight", detail: `${round1(w.value)} ${w.unit}` };
    }
    case "health": {
      const h = health(e);
      const n = h.photos?.length ?? 0;
      // A vet visit's linked weight (TEC-151): "Check-up · 7.6 lb".
      const w = h.type === "vet" && e.id ? linkedWeight(events, e.id) : null;
      const parts = [
        (h.reasons ?? []).map((id) => healthReasonLabel(h.type, id)).join(", "),
        w ? `${round1(weight(w).value)} ${weight(w).unit}` : "",
        h.issue ? issueLinkText(events, h.issue) : "",
        n ? `${n} ${n === 1 ? "photo" : "photos"}` : "",
      ];
      return { title: HEALTH_LABELS[h.type] ?? "Health", detail: parts.filter(Boolean).join(" · ") };
    }
    default:
      return { title: "", detail: "" };
  }
}

/* ── Writing ─────────────────────────────────────────────────────────────── */

export type NewEvent = {
  id: string;
  kind: Kind;
  at: string | null;
  person_id: string | null;
  details: Details;
  note: string | null;
  voids: string | null;
};

export class InvalidEvent extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

function text(v: unknown, field: string, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new InvalidEvent(`${field} must be text`);
  const t = v.trim();
  if (t.length > max) throw new InvalidEvent(`${field} is longer than ${max} characters`);
  return t || undefined;
}

/** A `photos` value checked into storage paths: once each, in the order given; none is undefined (no key). */
function parsePhotos(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.some((p) => typeof p !== "string" || !PHOTO_PATH.test(p))) {
    throw new InvalidEvent("photos must be ones uploaded here");
  }
  const photos = [...new Set(raw as string[])];
  if (photos.length > MAX_PHOTOS) throw new InvalidEvent(`at most ${MAX_PHOTOS} photos on one entry`);
  return photos.length ? photos : undefined;
}

/** A linked issue's id, lowercased; none is undefined (no key). That it is a Health issue is the server's check (`checkIssueTarget`). */
function parseIssue(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (!isUuid(raw)) throw new InvalidEvent("the related issue must be one from the list");
  return raw.toLowerCase();
}

/** A weight's linked vet visit id, lowercased; none is undefined (no key). That it is a vet visit is the server's check (`checkVisitTarget`). */
function parseVisit(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (!isUuid(raw)) throw new InvalidEvent("the vet visit must be one that was saved");
  return raw.toLowerCase();
}

function oneOf<T extends string>(v: unknown, options: readonly T[], field: string): T {
  if (typeof v !== "string" || !options.includes(v as T)) throw new InvalidEvent(`${field} must be ${options.join(" or ")}`);
  return v as T;
}

function wholeNumber(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new InvalidEvent(`${field} must be a whole number from ${min} to ${max}`);
  }
  return v;
}

/**
 * Food details from what the form sends ({type, item_id, amount}): the name,
 * calories and unit are taken from the catalogue here, never from the phone.
 */
export function foodSnapshot(type: FoodType, itemId: string, amount: number | null, added: readonly AddedFood[] = []): FoodDetails {
  const item = findFood(type, itemId, added);
  if (!item) throw new InvalidEvent("that food is not in the list");
  return { type, item_id: item.id, item_name: item.name, kcal_per: item.kcalPer, unit: item.unit, amount };
}

/**
 * A new food as the form sends it ({type, name, unit, kcalPer}), checked: the name trimmed, 1 to 60
 * characters and not already in that list (code or added, case-blind); a unit from `FOOD_UNITS`;
 * calories optional, above 0. Throws `InvalidEvent` with a sentence the form can show (TEC-191).
 */
export function parseNewFood(
  raw: unknown,
  added: readonly AddedFood[] = []
): { type: FoodType; name: string; unit: FoodUnit; kcalPer: number | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InvalidEvent("expected a JSON object");
  const r = raw as Record<string, unknown>;
  const type = oneOf(r.type, FOOD_TYPES, "type");
  const name = typeof r.name === "string" ? cleanFoodName(r.name) : "";
  if (name.length < 1 || name.length > 60) throw new InvalidEvent("a name is 1 to 60 characters");
  const unit = oneOf(r.unit, FOOD_UNITS, "unit");
  let kcalPer: number | null = null;
  if (r.kcalPer !== undefined && r.kcalPer !== null) {
    if (typeof r.kcalPer !== "number" || !Number.isFinite(r.kcalPer) || r.kcalPer <= 0 || r.kcalPer > 10000) {
      throw new InvalidEvent("calories must be a number above 0");
    }
    kcalPer = Math.round(r.kcalPer * 1000) / 1000;
  }
  if (foodNameTaken(type, name, added)) throw new InvalidEvent(`${name} is already in the list`);
  return { type, name, unit, kcalPer };
}

/** Only the fields a kind owns survive; every required one must be there. */
export function parseDetails(kind: Kind, raw: unknown, added: readonly AddedFood[] = []): Details {
  if (kind === "void") return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InvalidEvent("details must be an object");
  const r = raw as Record<string, unknown>;
  switch (kind) {
    case "potty": {
      const out: PottyDetails = { what: oneOf(r.what, POTTY_WHAT, "what"), where: oneOf(r.where, WHERE, "where") };
      if (r.leash !== undefined && r.leash !== null) {
        if (out.where !== "outside") throw new InvalidEvent("leashed, unleashed or in box is for outside only");
        out.leash = oneOf(r.leash, LEASH, "leash");
      }
      if (r.spot !== undefined && r.spot !== null) {
        if (out.where !== "inside") throw new InvalidEvent("box or loose is for inside only");
        out.spot = oneOf(r.spot, SPOT, "spot");
      }
      if (r.minutes !== undefined && r.minutes !== null) {
        if (out.where !== "outside") throw new InvalidEvent("time outside is for outside only");
        out.minutes = wholeNumber(r.minutes, "time outside", 1, OUT_MINUTES_MAX);
      }
      const issue = parseIssue(r.issue);
      if (issue) out.issue = issue;
      const photos = parsePhotos(r.photos);
      if (photos) out.photos = photos;
      return out;
    }
    case "food": {
      const type = oneOf(r.type, FOOD_TYPES, "type");
      if (typeof r.item_id !== "string") throw new InvalidEvent("pick a food");
      let amount: number | null = null;
      if (r.amount !== undefined && r.amount !== null) {
        if (typeof r.amount !== "number" || !Number.isFinite(r.amount) || r.amount <= 0 || r.amount > 1000) {
          throw new InvalidEvent("amount must be a number above 0");
        }
        amount = Math.round(r.amount * 1000) / 1000;
      }
      return foodSnapshot(type, r.item_id, amount, added);
    }
    case "exercise": {
      const type = oneOf(r.type, EXERCISE_TYPES, "type");
      if (typeof r.with_dogs !== "boolean") throw new InvalidEvent("with other dogs must be yes or no");
      const out: ExerciseDetails = {
        type,
        where: oneOf(r.where, WHERE, "where"),
        with_dogs: r.with_dogs,
        minutes: wholeNumber(r.minutes, "minutes", 1, 600),
        treats: wholeNumber(r.treats, "treats used", 0, 500),
      };
      if (type === "training") {
        const raw = r.commands ?? [];
        if (!Array.isArray(raw) || raw.some((c) => typeof c !== "string" || !COMMAND_IDS.has(c))) {
          throw new InvalidEvent("commands must come from the list");
        }
        // Kept in the list's order, once each.
        out.commands = COMMANDS.map(([id]) => id).filter((id) => raw.includes(id));
      }
      if (r.dogs !== undefined && r.dogs !== null) {
        if (!Array.isArray(r.dogs) || r.dogs.some((d) => !isUuid(d))) throw new InvalidEvent("dogs must come from the list");
        // Once each, in the order picked; none picked is no key at all.
        const ids = [...new Set((r.dogs as string[]).map((d) => d.toLowerCase()))];
        if (ids.length > MAX_DOGS) throw new InvalidEvent(`at most ${MAX_DOGS} dogs on one session`);
        if (ids.length) {
          if (!out.with_dogs) throw new InvalidEvent("naming a dog means with other dogs");
          out.dogs = ids;
        }
      }
      const photos = parsePhotos(r.photos);
      if (photos) out.photos = photos;
      return out;
    }
    case "weight": {
      const value = r.value;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 200) {
        throw new InvalidEvent("weight must be a number above 0");
      }
      const out: WeightDetails = { value, unit: oneOf(r.unit, UNITS, "unit") };
      const visit = parseVisit(r.visit);
      if (visit) out.visit = visit;
      return out;
    }
    case "health": {
      const type = oneOf(r.type, HEALTH_TYPES, "type");
      const accepted = healthAccepted(type);
      const picked = r.reasons;
      if (!Array.isArray(picked) || picked.some((c) => typeof c !== "string" || !accepted.some(([id]) => id === c))) {
        throw new InvalidEvent("reasons must come from the list");
      }
      // Once each, in the order given. How many is `checkHealthReasons`'s, on a write:
      // old entries hold several, and a correction may keep them.
      const reasons = [...new Set(picked as string[])];
      if (!reasons.length) throw new InvalidEvent(type === "vet" ? "pick why you went to the vet" : "pick what the issue is");
      const out: HealthDetails = { type, reasons };
      const issue = parseIssue(r.issue);
      if (issue) {
        if (type !== "vet") throw new InvalidEvent("only a vet visit links to an issue");
        out.issue = issue;
      }
      const photos = parsePhotos(r.photos);
      if (photos) out.photos = photos;
      return out;
    }
  }
}

/**
 * A request body checked into an insertable event. Throws `InvalidEvent` with a
 * sentence the screen can show.
 *
 * `id` comes from the phone, so a retried save after a dropped response is the
 * same row rather than a second pee.
 */
export function parseNewEvent(body: unknown, now: Date, added: readonly AddedFood[] = []): NewEvent {
  if (!body || typeof body !== "object") throw new InvalidEvent("expected a JSON object");
  const b = body as Record<string, unknown>;
  if (!isUuid(b.id)) throw new InvalidEvent("id must be a UUID");
  const kind = b.kind;
  if (kind !== "void" && !LOG_KINDS.includes(kind as LogKind)) throw new InvalidEvent("unknown kind");

  if (b.voids !== undefined && b.voids !== null && !isUuid(b.voids)) throw new InvalidEvent("voids must be a UUID");
  const voids = (b.voids as string | null | undefined) ?? null;
  if (kind === "void" && !voids) throw new InvalidEvent("a delete must name the entry it deletes");
  if (voids === b.id) throw new InvalidEvent("an entry cannot void itself");

  let at: string | null = null;
  if (kind !== "void" && b.at !== undefined && b.at !== null) {
    if (typeof b.at !== "string" || Number.isNaN(Date.parse(b.at))) throw new InvalidEvent("at must be a time");
    const t = Date.parse(b.at);
    // A day ahead allows any time zone; past that it is a typo.
    if (t > now.getTime() + 24 * 3600_000) throw new InvalidEvent("that time is in the future");
    at = new Date(t).toISOString();
  }

  if (b.person_id !== undefined && b.person_id !== null && !isUuid(b.person_id)) throw new InvalidEvent("person_id must be a UUID");

  // Health needs the story: the pick is only the headline (TEC-139).
  const note = kind === "void" ? null : (text(b.note, "note", 500) ?? null);
  if (kind === "health" && !note) throw new InvalidEvent("say what happened — the note is required");

  return {
    id: b.id,
    kind: kind as Kind,
    at,
    person_id: (b.person_id as string | null | undefined) ?? null,
    details: parseDetails(kind as Kind, b.details, added),
    note,
    voids,
  };
}

/**
 * Whether `next` may void `target`, given what the database holds. A delete may
 * void any live entry; a correction must keep the kind. Nothing voids a void or
 * an entry already replaced (the unique index on `voids` backs the second).
 */
export function checkVoid(next: NewEvent, target: JournalEvent | null, alreadyVoided: boolean): void {
  if (!next.voids) return;
  if (!target) throw new InvalidEvent("the entry it replaces does not exist");
  if (target.kind === "void") throw new InvalidEvent("a delete cannot be corrected or deleted");
  if (alreadyVoided) throw new InvalidEvent("that entry was already changed — reload to see the current one");
  if (next.kind !== "void" && next.kind !== target.kind) throw new InvalidEvent("a correction keeps the entry's kind");
}

/** The row to insert for a correction: `at` falls back to the original's, never to now. */
export function correctionAt(next: NewEvent, target: JournalEvent): string {
  return next.at ?? target.at;
}
