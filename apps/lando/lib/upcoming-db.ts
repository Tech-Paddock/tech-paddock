import type { getServiceClient } from "./supabase";
import { InvalidEvent } from "./events";
import { Conflict } from "./journal";
import { needsVisit, repeatOf, type Upcoming, type UpcomingAction, type UpcomingInput } from "./upcoming";

/**
 * The database half of Upcoming (TEC-192). Every failure throws: a failed read must never render as
 * an empty list, and a failed write must never look saved. Items are plans: edited in place, cancelled
 * (status, never a delete). Nothing here writes the journal.
 */

type SupabaseClient = ReturnType<typeof getServiceClient>;

const COLUMNS =
  "id, kind, title, due_on, due_time, note, repeat_every, repeat_unit, status, done_on, done_event, created_at, updated_at";

/** `due_time` comes back as HH:MM:SS; the screen holds HH:MM. */
function row(r: Upcoming): Upcoming {
  return { ...r, due_time: r.due_time ? r.due_time.slice(0, 5) : null };
}

/** Open items only; done and cancelled stay in the table and off the screen. */
export async function listOpen(db: SupabaseClient): Promise<Upcoming[]> {
  const { data, error } = await db
    .from("upcoming")
    .select(COLUMNS)
    .eq("status", "open")
    .order("due_on", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`couldn't read upcoming: ${error.message}`);
  return (data as Upcoming[]).map(row);
}

async function insert(db: SupabaseClient, item: UpcomingInput): Promise<Upcoming> {
  const { data, error } = await db.from("upcoming").insert(item).select(COLUMNS).single();
  if (error) throw new Error(`couldn't add: ${error.message}`);
  return row(data as Upcoming);
}

async function findOpen(db: SupabaseClient, id: string): Promise<Upcoming> {
  const { data, error } = await db.from("upcoming").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`couldn't read the item: ${error.message}`);
  if (!data) throw new InvalidEvent("that item doesn't exist — reload");
  if ((data as Upcoming).status !== "open") throw new Conflict("that item is already done or cancelled — reload");
  return row(data as Upcoming);
}

/** Apply one action. Returns the item written and, for a repeating item that was done, the next one. */
export async function applyAction(
  db: SupabaseClient,
  a: UpcomingAction,
  now = new Date()
): Promise<{ item: Upcoming; next: Upcoming | null }> {
  if (a.action === "add") return { item: await insert(db, a.item), next: null };

  const current = await findOpen(db, a.id);
  const stamp = now.toISOString();
  // Only a row still open is changed, so two phones acting at once cannot both win.
  const update = async (patch: Record<string, unknown>) => {
    const { data, error } = await db
      .from("upcoming")
      .update({ ...patch, updated_at: stamp })
      .eq("id", a.id)
      .eq("status", "open")
      .select(COLUMNS);
    if (error) throw new Error(`couldn't save: ${error.message}`);
    if (!data || data.length === 0) throw new Conflict("that item is already done or cancelled — reload");
    return row((data as Upcoming[])[0]);
  };

  if (a.action === "edit") return { item: await update(a.item), next: null };
  if (a.action === "cancel") return { item: await update({ status: "cancelled" }), next: null };

  // Done. A vet visit or vaccine is closed by the visit it names, which must be saved: the server
  // checks, so nothing closes it by a visit that never reached the journal.
  if (needsVisit(current.kind)) {
    if (!a.done_event) throw new InvalidEvent("a vet visit or vaccine is done by saving the visit");
    const { data, error } = await db.from("events").select("id, kind, details").eq("id", a.done_event).maybeSingle();
    if (error) throw new Error(`couldn't read the visit: ${error.message}`);
    const e = data as { kind: string; details: { type?: string } } | null;
    if (!e || e.kind !== "health" || e.details?.type !== "vet") throw new InvalidEvent("that vet visit isn't saved yet");
  }
  const item = await update({ status: "done", done_on: a.done_on, done_event: a.done_event });
  const again = repeatOf(current);
  if (!again) return { item, next: null };
  try {
    return { item, next: await insert(db, again) };
  } catch (e) {
    // The repeat did not land: put the item back, so Done can be tried again rather than lose the repeat.
    await db.from("upcoming").update({ status: "open", done_on: null, done_event: null, updated_at: stamp }).eq("id", a.id);
    throw e;
  }
}
