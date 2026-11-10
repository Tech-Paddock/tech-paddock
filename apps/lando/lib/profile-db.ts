import type { getServiceClient } from "./supabase";
import type { JournalEvent } from "./events";
import { fromRow, type ProfileDetails } from "./profile";

type SupabaseClient = ReturnType<typeof getServiceClient>;

const COLUMNS = "id, kind, at, person_id, details, note, voids, parent_id, created_at";
const PROFILE_COLUMNS = "breed, birth_on, microchip, insurance_provider, insurance_policy, clinic_name, clinic_phone";

/** The stored details, or the empty profile when nothing has been saved. A failed read throws. Never logs a value. */
export async function readProfile(db: SupabaseClient): Promise<ProfileDetails> {
  const { data, error } = await db.from("profile").select(PROFILE_COLUMNS).eq("id", true).maybeSingle();
  if (error) throw new Error(`couldn't read the profile: ${error.message}`);
  return fromRow(data as Record<string, unknown> | null);
}

/** Saves the details as the one row (an upsert on its fixed key). The caller has checked them with `parseProfile`. */
export async function saveProfile(db: SupabaseClient, details: ProfileDetails): Promise<ProfileDetails> {
  const { data, error } = await db
    .from("profile")
    .upsert({ id: true, ...details, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw new Error(`couldn't save the profile: ${error.message}`);
  return fromRow(data as Record<string, unknown>);
}

/**
 * Every vaccine and vet visit ever logged, plus every voiding event so a correction or delete is seen. The journal's
 * own read keeps only 30 days of these, which would drop an older shot from the Profile. Small by nature (a dog has a
 * handful of visits), so one page is enough; a read that fills it is an error, never a short list.
 */
export async function readProfileHistory(db: SupabaseClient): Promise<JournalEvent[]> {
  const LIMIT = 1000;
  const [kept, voids] = await Promise.all([
    db.from("events").select(COLUMNS).eq("kind", "health").in("details->>type", ["vaccine", "vet"]).order("created_at", { ascending: true }).limit(LIMIT),
    db.from("events").select(COLUMNS).not("voids", "is", null).order("created_at", { ascending: true }).limit(LIMIT),
  ]);
  for (const r of [kept, voids]) {
    if (r.error) throw new Error(`couldn't read the history: ${r.error.message}`);
    if ((r.data?.length ?? 0) >= LIMIT) throw new Error("the history is longer than one page; reading it needs a narrower query");
  }
  const byId = new Map<string, JournalEvent>();
  for (const e of [...(kept.data ?? []), ...(voids.data ?? [])] as JournalEvent[]) byId.set(e.id, e);
  return [...byId.values()];
}
