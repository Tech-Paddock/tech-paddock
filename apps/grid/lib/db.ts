import { addDays, streakFrom, weekdayOf } from "./days";
import { getServiceClient } from "./supabase";
import type { GridList, JournalEntry, More, Today } from "./types";
import type { GoalOp, JournalOp, ListOp, MeditationOp, RoutineOp, TaskOp } from "./validate";

/**
 * The only file that talks to the `grid` tables. Server-side only.
 *
 * - **Every create is `on conflict do nothing` on the browser's id**, so a
 *   retried save after a dropped connection lands once.
 * - **The journal is only ever inserted.** There is no update or delete of
 *   `journal_versions` anywhere in this file (a test reads the source for one),
 *   and the table's trigger refuses one anyway.
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

/** The streak looks back at most a year; the read is capped at a page of finished days. */
const STREAK_WINDOW_DAYS = 400;

export async function readToday(day: string, db: Client = getServiceClient()): Promise<Today> {
  const [tasks, routines, ticks, versions, sessions, finished] = await Promise.all([
    db.from("tasks").select("id,title,due_on,done_on").or(`done_on.is.null,done_on.eq.${day}`).order("created_at").limit(500),
    db.from("routines").select("id,name,weekdays").is("archived_at", null).order("created_at").limit(200),
    db.from("routine_ticks").select("routine_id").eq("day", day).limit(500),
    db.from("journal_versions").select("id,entry_id,body,created_at").eq("day", day).order("created_at").limit(1000),
    db.from("meditation_sessions").select("id,planned_seconds,elapsed_seconds,finished").eq("day", day).order("created_at").limit(200),
    db
      .from("meditation_sessions")
      .select("day")
      .eq("finished", true)
      .gte("day", addDays(day, -STREAK_WINDOW_DAYS))
      .lte("day", day)
      .order("day", { ascending: false })
      .limit(1000),
  ]);
  for (const r of [tasks, routines, ticks, versions, sessions, finished]) check(r.error);

  const ticked = new Set((ticks.data ?? []).map((t) => t.routine_id as string));
  const weekday = weekdayOf(day);

  const entries = new Map<string, JournalEntry>();
  for (const v of versions.data ?? []) {
    const e = entries.get(v.entry_id) ?? { entry_id: v.entry_id as string, versions: [] };
    e.versions.push({ id: v.id as string, body: v.body as string, created_at: v.created_at as string });
    entries.set(v.entry_id, e);
  }

  return {
    day,
    tasks: (tasks.data ?? []) as Today["tasks"],
    routines: (routines.data ?? [])
      .filter((r) => (r.weekdays as number[]).includes(weekday))
      .map((r) => ({ id: r.id as string, name: r.name as string, weekdays: r.weekdays as number[], ticked: ticked.has(r.id as string) })),
    journal: [...entries.values()],
    meditation: {
      streak: streakFrom((finished.data ?? []).map((s) => s.day as string), day),
      sessions: (sessions.data ?? []) as Today["meditation"]["sessions"],
    },
  };
}

export async function readMore(db: Client = getServiceClient()): Promise<More> {
  const [goals, lists, items, routines] = await Promise.all([
    db.from("goals").select("id,title,done_at").order("created_at").limit(500),
    db.from("lists").select("id,name").order("created_at").limit(200),
    db.from("list_items").select("id,list_id,text,done_at").order("created_at").limit(1000),
    db.from("routines").select("id,name,weekdays").is("archived_at", null).order("created_at").limit(200),
  ]);
  for (const r of [goals, lists, items, routines]) check(r.error);

  const byList = new Map<string, GridList>();
  for (const l of lists.data ?? []) byList.set(l.id as string, { id: l.id as string, name: l.name as string, items: [] });
  for (const i of items.data ?? []) {
    byList.get(i.list_id as string)?.items.push({ id: i.id as string, text: i.text as string, done: i.done_at != null });
  }
  return {
    goals: (goals.data ?? []).map((g) => ({ id: g.id as string, title: g.title as string, done: g.done_at != null })),
    lists: [...byList.values()],
    routines: (routines.data ?? []) as More["routines"],
  };
}

async function touched(q: PromiseLike<{ data: unknown[] | null; error: Failure }>) {
  const { data, error } = await q;
  check(error);
  if (!data || data.length === 0) throw new NotFound("Not found");
}

export async function writeTask(o: TaskOp, db: Client = getServiceClient()) {
  if (o.op === "add") {
    const { error } = await db
      .from("tasks")
      .upsert({ id: o.id, title: o.title, due_on: o.due_on }, { onConflict: "id", ignoreDuplicates: true });
    return check(error);
  }
  if (o.op === "done") {
    return touched(db.from("tasks").update({ done_on: o.done ? o.day : null }).eq("id", o.id).select("id"));
  }
  return touched(db.from("tasks").update({ due_on: o.due_on }).eq("id", o.id).select("id"));
}

export async function writeRoutine(o: RoutineOp, db: Client = getServiceClient()) {
  if (o.op === "add") {
    const { error } = await db
      .from("routines")
      .upsert({ id: o.id, name: o.name, weekdays: o.weekdays }, { onConflict: "id", ignoreDuplicates: true });
    return check(error);
  }
  if (o.op === "tick") {
    if (o.ticked) {
      const { error } = await db
        .from("routine_ticks")
        .upsert({ routine_id: o.routine_id, day: o.day }, { onConflict: "routine_id,day", ignoreDuplicates: true });
      return check(error);
    }
    const { error } = await db.from("routine_ticks").delete().eq("routine_id", o.routine_id).eq("day", o.day);
    return check(error);
  }
  return touched(db.from("routines").update({ archived_at: new Date().toISOString() }).eq("id", o.id).select("id"));
}

/** Always an insert of a new version; see the file's header. */
export async function writeJournal(o: JournalOp, db: Client = getServiceClient()) {
  const { error } = await db
    .from("journal_versions")
    .upsert({ id: o.id, entry_id: o.entry_id, day: o.day, body: o.body }, { onConflict: "id", ignoreDuplicates: true });
  check(error);
}

export async function writeMeditation(o: MeditationOp, db: Client = getServiceClient()) {
  const { error } = await db.from("meditation_sessions").upsert(
    { id: o.id, day: o.day, planned_seconds: o.planned_seconds, elapsed_seconds: o.elapsed_seconds, finished: o.finished },
    { onConflict: "id", ignoreDuplicates: true },
  );
  check(error);
}

export async function writeGoal(o: GoalOp, db: Client = getServiceClient()) {
  if (o.op === "add") {
    const { error } = await db.from("goals").upsert({ id: o.id, title: o.title }, { onConflict: "id", ignoreDuplicates: true });
    return check(error);
  }
  return touched(db.from("goals").update({ done_at: o.done ? new Date().toISOString() : null }).eq("id", o.id).select("id"));
}

export async function writeList(o: ListOp, db: Client = getServiceClient()) {
  if (o.op === "add_list") {
    const { error } = await db.from("lists").upsert({ id: o.id, name: o.name }, { onConflict: "id", ignoreDuplicates: true });
    return check(error);
  }
  if (o.op === "add_item") {
    const { error } = await db
      .from("list_items")
      .upsert({ id: o.id, list_id: o.list_id, text: o.text }, { onConflict: "id", ignoreDuplicates: true });
    return check(error);
  }
  return touched(db.from("list_items").update({ done_at: o.done ? new Date().toISOString() : null }).eq("id", o.id).select("id"));
}
