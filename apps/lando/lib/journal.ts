import type { getServiceClient } from "./supabase";
import {
  HORIZON_DAYS,
  InvalidEvent,
  checkVoid,
  correctionAt,
  parseNewEvent,
  type JournalEvent,
} from "./events";

/**
 * The database half. Every failure throws: a failed read must never render as
 * an empty day, and a failed write must never look logged (charter, Never 5).
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
  const next = parseNewEvent(body, now);

  const existing = await findEvent(db, next.id);
  if (existing) return existing;

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

/** Add a person by name, or return the one already there under that name. */
export async function addPerson(db: SupabaseClient, raw: unknown): Promise<Person> {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > 40) throw new InvalidEvent("a name is 1 to 40 characters");
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
