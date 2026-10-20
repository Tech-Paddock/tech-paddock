/**
 * The journal's rules, with no I/O so every one is tested.
 *
 * History is append-only (charter, Never 1). A row is never changed: a
 * correction is a new event of the same kind whose `voids` names the one it
 * replaces, and a delete is a `void` event naming it. An event is **live** when
 * nothing voids it. Every screen reads live events only.
 *
 * Four kinds, each logged through a short form with defaults: potty, food,
 * exercise, weight. The shapes of `details` below are also enforced by the
 * database (migration `lando_people_and_events`); change both together.
 */

import { FOOD_TYPES, findFood, formatAmount, unitLabel, type FoodType } from "./foods";

export const LOG_KINDS = ["potty", "food", "exercise", "weight"] as const;
export type LogKind = (typeof LOG_KINDS)[number];
export type Kind = LogKind | "void";

export const KIND_LABELS: Record<LogKind, string> = {
  potty: "Potty",
  food: "Food",
  exercise: "Exercise",
  weight: "Weight",
};

/* ── Shapes ──────────────────────────────────────────────────────────────── */

export const POTTY_WHAT = ["pee", "poop", "both"] as const;
export const WHERE = ["outside", "inside"] as const;
export type PottyDetails = { what: (typeof POTTY_WHAT)[number]; where: (typeof WHERE)[number] };

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
};

export const UNITS = ["lb", "kg"] as const;
export type Unit = (typeof UNITS)[number];
const KG_PER_LB = 0.45359237;
export type WeightDetails = { value: number; unit: Unit };

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

/** Inside is an accident: warned in the form, red in the timeline, counted apart. */
export const isAccident = (e: Pick<JournalEvent, "kind" | "details">) =>
  e.kind === "potty" && potty(e).where === "inside";

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

/** How far behind today the journal is read. A clock with nothing in it says so. */
export const HORIZON_DAYS = 30;

export type Clock = "pee" | "poop" | "food" | "exercise";
export const CLOCKS: Clock[] = ["pee", "poop", "food", "exercise"];
export const CLOCK_LABELS: Record<Clock, string> = { pee: "Pee", poop: "Poop", food: "Food", exercise: "Exercise" };

function countsFor(e: JournalEvent, clock: Clock): boolean {
  switch (clock) {
    case "pee":
    case "poop": {
      // An accident inside is still a pee or a poop, and the next one is due from it.
      if (e.kind !== "potty") return false;
      const w = potty(e).what;
      return w === clock || w === "both";
    }
    default:
      return e.kind === clock;
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

/** A timeline row: a bold title and one line of what the details say. */
export function describe(e: Pick<JournalEvent, "kind" | "details">): { title: string; detail: string } {
  switch (e.kind) {
    case "potty": {
      const p = potty(e);
      const what = p.what === "both" ? "pee + poop" : p.what;
      return { title: isAccident(e) ? "Accident" : "Potty", detail: p.where === "inside" ? `${what}, inside` : what };
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
        x.with_dogs ? "with dogs" : "",
        x.treats ? `${x.treats} ${x.treats === 1 ? "treat" : "treats"}` : "",
        (x.commands ?? []).map((c) => COMMAND_LABEL[c] ?? c).join(", "),
      ];
      return { title: EXERCISE_LABELS[x.type] ?? "Exercise", detail: parts.filter(Boolean).join(" · ") };
    }
    case "weight": {
      const w = weight(e);
      return { title: "Weight", detail: `${round1(w.value)} ${w.unit}` };
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
export function foodSnapshot(type: FoodType, itemId: string, amount: number | null): FoodDetails {
  const item = findFood(type, itemId);
  if (!item) throw new InvalidEvent("that food is not in the list");
  return { type, item_id: item.id, item_name: item.name, kcal_per: item.kcalPer, unit: item.unit, amount };
}

/** Only the fields a kind owns survive; every required one must be there. */
export function parseDetails(kind: Kind, raw: unknown): Details {
  if (kind === "void") return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InvalidEvent("details must be an object");
  const r = raw as Record<string, unknown>;
  switch (kind) {
    case "potty":
      return { what: oneOf(r.what, POTTY_WHAT, "what"), where: oneOf(r.where, WHERE, "where") } satisfies PottyDetails;
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
      return foodSnapshot(type, r.item_id, amount);
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
      return out;
    }
    case "weight": {
      const value = r.value;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 200) {
        throw new InvalidEvent("weight must be a number above 0");
      }
      return { value, unit: oneOf(r.unit, UNITS, "unit") } satisfies WeightDetails;
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
export function parseNewEvent(body: unknown, now: Date): NewEvent {
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

  return {
    id: b.id,
    kind: kind as Kind,
    at,
    person_id: (b.person_id as string | null | undefined) ?? null,
    details: parseDetails(kind as Kind, b.details),
    note: kind === "void" ? null : (text(b.note, "note", 500) ?? null),
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
