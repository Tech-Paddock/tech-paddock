import { addDays } from "./days";
import { getServiceClient } from "./supabase";
import type { Cadence, Chore, Completion, Person } from "./types";
import type { ChoreOp, CompletionOp, PersonOp } from "./validate";

/**
 * The only file that talks to the `pitrow` tables. Server-side only.
 *
 * - **Every create is `on conflict do nothing` on the browser's id**, so a
 *   retried save after a dropped connection lands once.
 * - **Completions are only ever inserted.** There is no update or delete of
 *   `completions` anywhere in this file (a test reads the source for one), and
 *   the table's trigger refuses one anyway. A void is a new row.
 * - **No error here repeats what was typed.** A database error keeps its code
 *   only; its message and detail can quote the row.
 */
export class NotFound extends Error {}
export class DbError extends Error {
  constructor(public code: string | undefined) {
    super("The database refused the request");
  }
}

type Client = ReturnType<typeof getServiceClient>;
type Failure = { code?: string } | null;

function check(error: Failure) {
  if (error) throw new DbError(error.code);
}

type CompletionRow = { id: string; chore_id: string; day: string; person_id: string; voids: string | null };

/** The ticks still standing: a tick no void names. */
export function liveTicks(rows: CompletionRow[]): Completion[] {
  const voided = new Set(rows.map((r) => r.voids).filter((v): v is string => v != null));
  return rows
    .filter((r) => r.voids == null && !voided.has(r.id))
    .map((r) => ({ id: r.id, chore_id: r.chore_id, day: r.day, person_id: r.person_id }));
}

/** The people and chores, and the live ticks for the seven days from `start` (and every tick of a once-only chore). */
export async function readWeek(start: string, db: Client = getServiceClient()) {
  const end = addDays(start, 6);
  const [people, chores, inWeek] = await Promise.all([
    db.from("people").select("id,name,archived_at").order("created_at").limit(200),
    db.from("chores").select("id,title,cadence,weekdays,every_n,start_on,assignee_id").is("archived_at", null).order("created_at").limit(500),
    db.from("completions").select("id,chore_id,day,person_id,voids").gte("day", start).lte("day", end).limit(3000),
  ]);
  for (const r of [people, chores, inWeek]) check(r.error);

  const choreRows = (chores.data ?? []) as Chore[];
  const rows = new Map<string, CompletionRow>();
  for (const r of (inWeek.data ?? []) as CompletionRow[]) rows.set(r.id, r);

  // A once-only chore is done whenever it was ticked, so its ticks are read whatever their day.
  const onceIds = choreRows.filter((c) => c.cadence === "once").map((c) => c.id);
  if (onceIds.length > 0) {
    const once = await db.from("completions").select("id,chore_id,day,person_id,voids").in("chore_id", onceIds).limit(3000);
    check(once.error);
    for (const r of (once.data ?? []) as CompletionRow[]) rows.set(r.id, r);
  }

  const liveChoreIds = new Set(choreRows.map((c) => c.id));
  return {
    people: (people.data ?? []).map((p) => ({ id: p.id as string, name: p.name as string, active: p.archived_at == null })) as Person[],
    chores: choreRows.map((c) => ({ ...c, assignee_id: c.assignee_id ?? null })),
    completions: liveTicks([...rows.values()]).filter((c) => liveChoreIds.has(c.chore_id)),
  };
}

async function touched(q: PromiseLike<{ data: unknown[] | null; error: Failure }>) {
  const { data, error } = await q;
  check(error);
  if (!data || data.length === 0) throw new NotFound("Not found");
}

export async function writePerson(o: PersonOp, db: Client = getServiceClient()) {
  if (o.op === "add") {
    const { error } = await db.from("people").upsert({ id: o.id, name: o.name }, { onConflict: "id", ignoreDuplicates: true });
    return check(error);
  }
  return touched(db.from("people").update({ archived_at: new Date().toISOString() }).eq("id", o.id).select("id"));
}

export async function writeChore(o: ChoreOp, db: Client = getServiceClient()) {
  if (o.op === "add") {
    const { error } = await db.from("chores").upsert(
      {
        id: o.id,
        title: o.title,
        cadence: o.cadence,
        weekdays: o.weekdays,
        every_n: o.every_n,
        start_on: o.start_on,
        assignee_id: o.assignee_id,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    return check(error);
  }
  return touched(db.from("chores").update({ archived_at: new Date().toISOString() }).eq("id", o.id).select("id"));
}

/** One chore as the calendar sees it, or null when it is gone. */
export async function readChoreForCalendar(id: string, db: Client = getServiceClient()) {
  const { data, error } = await db
    .from("chores")
    .select("id,title,cadence,weekdays,every_n,start_on,archived_at")
    .eq("id", id)
    .limit(1);
  check(error);
  return ((data ?? [])[0] ?? null) as {
    id: string;
    title: string;
    cadence: Cadence;
    weekdays: number[] | null;
    every_n: number | null;
    start_on: string;
    archived_at: string | null;
  } | null;
}

/** Postgres's unique violation: a tick that was already voided, which a retried void must not report as a failure. */
const UNIQUE_VIOLATION = "23505";

/** Always an insert of a new row; see the file's header. */
export async function writeCompletion(o: CompletionOp, db: Client = getServiceClient()) {
  if (o.op === "done") {
    const { error } = await db
      .from("completions")
      .upsert({ id: o.id, chore_id: o.chore_id, day: o.day, person_id: o.person_id }, { onConflict: "id", ignoreDuplicates: true });
    return check(error);
  }
  const { data, error } = await db.from("completions").select("id,chore_id,day,person_id,voids").eq("id", o.completion_id).limit(1);
  check(error);
  const target = ((data ?? [])[0] ?? null) as CompletionRow | null;
  if (!target || target.voids != null) throw new NotFound("Not found");
  const { error: insertError } = await db
    .from("completions")
    .upsert(
      { id: o.id, chore_id: target.chore_id, day: target.day, person_id: target.person_id, voids: target.id },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (insertError && insertError.code === UNIQUE_VIOLATION) return;
  check(insertError);
}
