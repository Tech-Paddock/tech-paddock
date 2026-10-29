import type { getServiceClient } from "./supabase";
import {
  HORIZON_DAYS,
  InvalidEvent,
  checkVoid,
  correctionAt,
  parseNewEvent,
  parseNewFood,
  type Dog,
  type ExerciseDetails,
  checkHealthReasons,
  checkIssueTarget,
  checkVisitTarget,
  eventPhotos,
  type JournalEvent,
} from "./events";
import { missingPhotos } from "./storage";
import type { AddedFood } from "./foods";

/**
 * The database half. Every failure throws: a failed read must never render as
 * an empty day, and a failed write must never look logged (RULES.md, Never 5).
 */

export class Conflict extends Error {}

type SupabaseClient = ReturnType<typeof getServiceClient>;

export type Person = { id: string; display_name: string };

const PAGE = 1000;
const MAX_PAGES = 20;

const COLUMNS = "id, kind, at, person_id, details, note, voids, created_at";

/**
 * Everything the screen needs in one read: the last `HORIZON_DAYS` before
 * `since`, every weight ever (the growth chart), and every voiding event (so a
 * correction or delete of anything read is seen). Paged; a journal too long to
 * read whole is an error, never a silently short one.
 */
export async function readJournal(db: SupabaseClient, since: Date): Promise<JournalEvent[]> {
  const horizon = new Date(since.getTime() - HORIZON_DAYS * 86_400_000).toISOString();
  const out: JournalEvent[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .from("events")
      .select(COLUMNS)
      .or(`at.gte.${horizon},kind.eq.weight,voids.not.is.null`)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`couldn't read the journal: ${error.message}`);
    out.push(...(data as JournalEvent[]));
    if (data.length < PAGE) return out;
  }
  throw new Error(`the journal is longer than ${MAX_PAGES * PAGE} rows; reading it needs a narrower query`);
}

async function findEvent(db: SupabaseClient, id: string): Promise<JournalEvent | null> {
  const { data, error } = await db.from("events").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`couldn't read entry: ${error.message}`);
  return (data as JournalEvent | null) ?? null;
}

/**
 * Insert one event: a tap, a correction or a delete. Saving the same `id`
 * twice returns the first row, so a retry after a lost response never logs a
 * second time.
 */
export async function writeEvent(db: SupabaseClient, body: unknown, now = new Date()): Promise<JournalEvent> {
  // A food entry may name a food added in the app (TEC-191), which only the database knows.
  const isFood = !!body && typeof body === "object" && (body as { kind?: unknown }).kind === "food";
  const next = parseNewEvent(body, now, isFood ? await listFoods(db) : []);

  const existing = await findEvent(db, next.id);
  if (existing) return existing;

  // `dogs` is jsonb, so no foreign key holds it; every id must be a dog here.
  const dogIds = next.kind === "exercise" ? ((next.details as ExerciseDetails).dogs ?? []) : [];
  if (dogIds.length) {
    const { data, error } = await db.from("dogs").select("id").in("id", dogIds);
    if (error) throw new Error(`couldn't read dogs: ${error.message}`);
    if ((data ?? []).length !== dogIds.length) throw new InvalidEvent("that dog is no longer in the list — reload");
  }

  // A photo is stored as a path, so nothing but the bucket knows it is there:
  // an entry is never saved naming one that did not upload (RULES.md, Never 5).
  const photos = eventPhotos(next);
  if (photos.length && (await missingPhotos(db, photos)).length) {
    throw new InvalidEvent("a photo didn't finish uploading — retry it, or remove it");
  }

  // A linked medical issue (TEC-142) is an id in jsonb, so no foreign key
  // holds it: it must be a Health issue event. A voided one passes, since an
  // old link may point at a superseded copy; the screen follows `voids`.
  const issueId = (next.details as { issue?: string }).issue;
  if (issueId) checkIssueTarget(await findEvent(db, issueId));

  // A weight saved from a vet visit (TEC-151) names it the same way: it must be
  // a vet visit event, a voided copy included.
  const visitId = next.kind === "weight" ? (next.details as { visit?: string }).visit : undefined;
  if (visitId) checkVisitTarget(await findEvent(db, visitId));

  if (next.kind === "health" && !next.voids) checkHealthReasons(next, null);

  let at: string | undefined = next.at ?? undefined;
  if (next.voids) {
    const target = await findEvent(db, next.voids);
    const { data: voiders, error } = await db.from("events").select("id").eq("voids", next.voids).limit(1);
    if (error) throw new Error(`couldn't read entry: ${error.message}`);
    try {
      checkVoid(next, target, (voiders ?? []).length > 0);
    } catch (e) {
      if (e instanceof InvalidEvent && /already changed/.test(e.message)) throw new Conflict(e.message);
      throw e;
    }
    if (next.kind !== "void") at = correctionAt(next, target as JournalEvent);
    if (next.kind === "health") checkHealthReasons(next, target);
  }
  if (next.kind === "void") at = undefined; // the database's now()

  const row = {
    id: next.id,
    kind: next.kind,
    ...(at ? { at } : {}),
    person_id: next.person_id,
    details: next.details,
    note: next.note,
    voids: next.voids,
  };
  const { data, error } = await db.from("events").insert(row).select(COLUMNS).single();
  if (!error) return data as JournalEvent;

  if (error.code === "23505") {
    // Two saves of one tap racing: the first won and this is the same entry.
    const again = await findEvent(db, next.id);
    if (again) return again;
    throw new Conflict("that entry was already changed — reload to see the current one");
  }
  if (error.code === "23503") throw new InvalidEvent("that person or entry no longer exists — reload");
  throw new Error(`couldn't save: ${error.message}`);
}

export async function listPeople(db: SupabaseClient): Promise<Person[]> {
  const { data, error } = await db
    .from("people")
    .select("id, display_name")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`couldn't read people: ${error.message}`);
  return data as Person[];
}

/**
 * Friends' dogs, by name. Added in the app (`addDog`, Other dogs' "Add dog…")
 * or by SQL; never in the repo (RULES.md, Never 2). An empty table is an empty
 * list; a failed read throws.
 */
export async function listDogs(db: SupabaseClient): Promise<Dog[]> {
  const { data, error } = await db.from("dogs").select("id, name").order("name", { ascending: true });
  if (error) throw new Error(`couldn't read dogs: ${error.message}`);
  return data as Dog[];
}

/** Add a person by name, or return the one already there under that name. */
export async function addPerson(db: SupabaseClient, raw: unknown): Promise<Person> {
  const name = cleanName(raw);
  const same = (p: Person) => p.display_name.trim().toLowerCase() === name.toLowerCase();

  const before = (await listPeople(db)).find(same);
  if (before) return before;

  const { data, error } = await db.from("people").insert({ display_name: name }).select("id, display_name").single();
  if (!error) return data as Person;
  if (error.code === "23505") {
    const after = (await listPeople(db)).find(same);
    if (after) return after;
  }
  throw new Error(`couldn't add person: ${error.message}`);
}

/** A name as typed: outer spaces off, inner runs of spaces made one. 1 to 40 characters. */
function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > 40) throw new InvalidEvent("a name is 1 to 40 characters");
  return name;
}

/**
 * Add a friend's dog by name, or return the one already there under that name
 * in any case (the table's unique index is on `lower(btrim(name))`). The same
 * pattern as `addPerson`.
 */
export async function addDog(db: SupabaseClient, raw: unknown): Promise<Dog> {
  const name = cleanName(raw);
  const same = (d: Dog) => d.name.trim().toLowerCase() === name.toLowerCase();

  const before = (await listDogs(db)).find(same);
  if (before) return before;

  const { data, error } = await db.from("dogs").insert({ name }).select("id, name").single();
  if (!error) return data as Dog;
  if (error.code === "23505") {
    // Two phones adding the same dog at once: the other one won.
    const after = (await listDogs(db)).find(same);
    if (after) return after;
  }
  throw new Error(`couldn't add dog: ${error.message}`);
}

type FoodRow = { id: string; type: AddedFood["type"]; name: string; unit: string; kcal_per: number | string | null; retired: boolean };

/**
 * Foods added in the app (TEC-191), retired ones too, so an old entry can still be corrected
 * (`findFood`). The code catalogue is in `lib/foods.ts`. An empty table is an empty list; a failed
 * read throws.
 */
export async function listFoods(db: SupabaseClient): Promise<AddedFood[]> {
  const { data, error } = await db
    .from("foods")
    .select("id, type, name, unit, kcal_per, retired")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`couldn't read foods: ${error.message}`);
  return (data as FoodRow[]).map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    unit: r.unit,
    kcalPer: r.kcal_per === null ? null : Number(r.kcal_per),
    ...(r.retired ? { retired: true } : {}),
  }));
}

/**
 * Add a food to a list (the Food form's "Add a food…"). A name already in that list, in any case,
 * is refused, never duplicated (the table's unique index backs the race). The id is the database's
 * and is never changed or deleted.
 */
export async function addFood(db: SupabaseClient, raw: unknown): Promise<AddedFood> {
  const f = parseNewFood(raw, await listFoods(db));
  const { data, error } = await db
    .from("foods")
    .insert({ type: f.type, name: f.name, unit: f.unit, kcal_per: f.kcalPer })
    .select("id")
    .single();
  if (!error) return { id: (data as { id: string }).id, type: f.type, name: f.name, unit: f.unit, kcalPer: f.kcalPer };
  if (error.code === "23505") throw new InvalidEvent(`${f.name} is already in the list`);
  throw new Error(`couldn't add food: ${error.message}`);
}
