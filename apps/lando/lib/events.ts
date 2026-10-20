/**
 * The journal's rules, with no I/O so every one is tested.
 *
 * History is append-only (charter, Never 1). A row is never changed: a
 * correction is a new event of the same kind whose `voids` names the one it
 * replaces, and a delete is a `void` event naming it. An event is **live** when
 * nothing voids it. Every screen reads live events only.
 */

export const LOG_KINDS = ["pee", "poop", "accident", "meal", "treat", "training", "weight"] as const;
export type LogKind = (typeof LOG_KINDS)[number];
export type Kind = LogKind | "void";

export const KIND_LABELS: Record<LogKind, string> = {
  pee: "Pee",
  poop: "Poop",
  accident: "Accident",
  meal: "Meal",
  treat: "Treat",
  training: "Training",
  weight: "Weight",
};

export const UNITS = ["kg", "lb"] as const;
export type Unit = (typeof UNITS)[number];
const KG_PER_LB = 0.45359237;

export type Details = {
  /** meal: how much, as typed ("1 cup"). */
  amount?: string;
  /** weight */
  value?: number;
  unit?: Unit;
  /** training: what was practised. */
  practised?: string;
  /** accident: which, when known. Counts toward that since-last clock. */
  what?: "pee" | "poop";
};

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

/** Live events: every non-void event that no other event voids. Order is kept. */
export function liveEvents(events: JournalEvent[]): JournalEvent[] {
  const voided = new Set<string>();
  for (const e of events) if (e.voids) voided.add(e.voids);
  return events.filter((e) => e.kind !== "void" && !voided.has(e.id));
}

/** Newest first by `at`, then by `created_at` so two taps in one second keep their order. */
export function newestFirst(a: JournalEvent, b: JournalEvent): number {
  return Date.parse(b.at) - Date.parse(a.at) || Date.parse(b.created_at) - Date.parse(a.created_at);
}

/** How far behind today the journal is read for the clocks. A clock with nothing in it says so. */
export const HORIZON_DAYS = 30;
export const HORIZON_DAYS_LABEL = `${HORIZON_DAYS} days`;

export type Clock = "pee" | "poop" | "meal";
export const CLOCKS: Clock[] = ["pee", "poop", "meal"];
export const CLOCK_LABELS: Record<Clock, string> = { pee: "Pee", poop: "Poop", meal: "Meal" };

function countsFor(e: JournalEvent, clock: Clock): boolean {
  if (e.kind === clock) return true;
  // An accident inside is still a pee or a poop, and the next one is due from it.
  return e.kind === "accident" && clock !== "meal" && e.details.what === clock;
}

/**
 * The most recent live event for each clock, or null when there is none in
 * what was read. An event in the future (a mistyped time) is ignored, so a clock
 * never reads "in 3 hours".
 */
export function sinceLast(events: JournalEvent[], now: Date): Record<Clock, JournalEvent | null> {
  const out: Record<Clock, JournalEvent | null> = { pee: null, poop: null, meal: null };
  const t = now.getTime();
  for (const e of liveEvents(events)) {
    const at = Date.parse(e.at);
    if (at > t) continue;
    for (const c of CLOCKS) {
      if (!countsFor(e, c)) continue;
      const cur = out[c];
      if (!cur || newestFirst(e, cur) < 0) out[c] = e;
    }
  }
  return out;
}

/** "just now", "47 min ago", "2 h 5 min ago", "3 d 4 h ago". */
export function formatAgo(fromIso: string, now: Date): string {
  const mins = Math.floor((now.getTime() - Date.parse(fromIso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) {
    const m = mins % 60;
    return m ? `${h} h ${m} min ago` : `${h} h ago`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} d ${rh} h ago` : `${d} d ago`;
}

export type GrowthPoint = { at: string; kg: number; id: string };

export function toKg(value: number, unit: Unit): number {
  return unit === "lb" ? value * KG_PER_LB : value;
}

export function fromKg(kg: number, unit: Unit): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

/** Live weights that carry a value, oldest first, in kilograms. */
export function growthPoints(events: JournalEvent[]): GrowthPoint[] {
  return liveEvents(events)
    .filter((e) => e.kind === "weight" && typeof e.details.value === "number" && e.details.unit)
    .map((e) => ({ at: e.at, kg: toKg(e.details.value as number, e.details.unit as Unit), id: e.id }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** The unit the chart speaks: the newest weight's, kilograms when there is none. */
export function displayUnit(events: JournalEvent[]): Unit {
  const w = liveEvents(events)
    .filter((e) => e.kind === "weight" && e.details.unit)
    .sort(newestFirst)[0];
  return w?.details.unit ?? "kg";
}

/** One line of what a row's details say, or "" when it has none. */
export function describe(e: Pick<JournalEvent, "kind" | "details">): string {
  const d = e.details;
  switch (e.kind) {
    case "meal":
      return d.amount ?? "";
    case "training":
      return d.practised ?? "";
    case "accident":
      return d.what ?? "";
    case "weight":
      return typeof d.value === "number" && d.unit ? `${round1(d.value)} ${d.unit}` : "no value yet";
    default:
      return "";
  }
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Kinds whose details are the point, so the editor opens once the tap is saved. */
export const ASKS_FOR_DETAILS: ReadonlySet<LogKind> = new Set(["meal", "training", "weight"]);

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

/** Only the fields a kind owns survive; anything else is refused or dropped. */
export function parseDetails(kind: Kind, raw: unknown): Details {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new InvalidEvent("details must be an object");
  const r = raw as Record<string, unknown>;
  const out: Details = {};
  switch (kind) {
    case "meal": {
      const amount = text(r.amount, "amount", 60);
      if (amount) out.amount = amount;
      break;
    }
    case "training": {
      const practised = text(r.practised, "practised", 120);
      if (practised) out.practised = practised;
      break;
    }
    case "accident": {
      if (r.what !== undefined && r.what !== null) {
        if (r.what !== "pee" && r.what !== "poop") throw new InvalidEvent("what must be pee or poop");
        out.what = r.what;
      }
      break;
    }
    case "weight": {
      if (r.value === undefined || r.value === null || r.value === "") break;
      const value = typeof r.value === "number" ? r.value : Number.NaN;
      if (!Number.isFinite(value) || value <= 0 || value >= 200) throw new InvalidEvent("weight must be a number above 0");
      if (r.unit !== "kg" && r.unit !== "lb") throw new InvalidEvent("unit must be kg or lb");
      out.value = value;
      out.unit = r.unit;
      break;
    }
    default:
      break;
  }
  return out;
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
    details: kind === "void" ? {} : parseDetails(kind as Kind, b.details),
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
