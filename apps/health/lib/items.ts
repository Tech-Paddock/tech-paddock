import { getServiceClient } from "./supabase";
import type { Macros, MacroSource } from "./macros";

/**
 * The remembered vocabulary: what a food is called, what it weighed, and how to
 * decide which of its versions applies to a given day.
 *
 * The resolution rule is the subtle part of this app, so it lives here as a
 * pure function with tests rather than in a SQL view. A rule nobody can unit
 * test is a rule that drifts.
 */

export type VersionKind = "correction" | "change";

export type ItemVersion = Macros & {
  id: string;
  item_id: string;
  kind: VersionKind;
  /** The date this version describes the food FROM — not the date it was written. */
  effective_from: string;
  source: MacroSource;
  model: string | null;
  source_url: string | null;
  note: string | null;
  created_at: string;
};

export type Item = {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
};

/**
 * A lookup that could not be answered, as against one that answered "no".
 *
 * Guardrail 2, and the reason this class exists at all: "no such item" and "the
 * database is unreachable" are both an empty result, and only one of them is an
 * answer. Swallowing the error degrades this app into internet-first — nothing
 * on screen changes and the numbers quietly start drifting again, which is the
 * one thing the whole design exists to prevent. Coffee learned this the
 * expensive way in `apps/coffee/lib/bags.ts`; this is the same guard.
 */
export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookupError";
  }
}

/**
 * The lookup key. Matching happens on this rather than on the display name, so
 * that punctuation and the several ways of writing a combo number converge
 * without flattening what gets shown back to you.
 *
 * Deliberately conservative: it folds case, punctuation and small number words,
 * and does nothing clever with abbreviations. "CFA" does not become
 * "Chick-fil-A" here — that would be a guess, and a wrong guess silently merges
 * two foods into one row.
 */
const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    // "#1" and "no. 1" both read as "number 1", so they meet "number one".
    .replace(/#/g, " number ")
    .replace(/\bno\.?\s+(?=\d)/g, " number ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => NUMBER_WORDS[w] ?? w)
    .join(" ")
    .trim();
}

/**
 * Which version of an item applies on a given day.
 *
 * **The rule, settled in issue #116.** Take the era with the greatest
 * `effective_from` on or before that day, then within that era take the most
 * recently written row.
 *
 * That single rule gives both behaviours the two kinds need:
 *
 * - A **correction** carries the `effective_from` of the era it corrects, so it
 *   supersedes inside that era without starting a new one — and every past day
 *   in that era resolves to it. The number was always wrong; now it is right,
 *   backwards.
 * - A **change** carries its own later `effective_from`, so it starts a new era
 *   and days before it keep resolving to the older one. The food itself changed;
 *   Tuesday really did have the old macros and must not be falsified.
 *
 * The fallback matters more than it looks: an entry dated before an item's
 * earliest version resolves to that earliest version rather than to nothing. A
 * null here would render as a silently missing total, which is the failure mode
 * this app is least allowed to have.
 */
export function resolveVersion(versions: ItemVersion[], onDate: string): ItemVersion | null {
  if (versions.length === 0) return null;

  const eligible = versions.filter((v) => v.effective_from <= onDate);

  // No era has started yet — fall back to the earliest rather than to null.
  const pool = eligible.length > 0 ? eligible : versions;

  let best = pool[0];
  for (const v of pool) {
    if (v.effective_from > best.effective_from) {
      best = v;
    } else if (v.effective_from === best.effective_from && v.created_at > best.created_at) {
      best = v;
    }
  }
  return best;
}

/** The era an incoming correction belongs to: the one in effect on that date. */
export function eraFor(versions: ItemVersion[], onDate: string): string {
  const current = resolveVersion(versions, onDate);
  return current ? current.effective_from : onDate;
}

// ---------------------------------------------------------------------------
// Database access. Every read distinguishes "no" from "could not ask".
// ---------------------------------------------------------------------------

export type RememberedItem = { item: Item; versions: ItemVersion[] };

/**
 * Tier 1 and 2 of the lookup order: an exact match on the normalised name.
 *
 * Returns null only for a genuine miss. A failed query throws `LookupError`, so
 * a caller cannot accidentally treat an unreachable database as a food it has
 * never seen.
 */
export async function findItem(name: string): Promise<RememberedItem | null> {
  const supabase = getServiceClient();
  const normalized = normalizeName(name);

  const { data: item, error } = await supabase
    .from("items")
    .select("id, name, normalized_name, created_at")
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (error) throw new LookupError(`Couldn't look up "${name}": ${error.message}`);
  if (!item) return null;

  return { item: item as Item, versions: await versionsOf(item.id) };
}

export async function versionsOf(itemId: string): Promise<ItemVersion[]> {
  const { data, error } = await getServiceClient()
    .from("item_versions")
    .select("*")
    .eq("item_id", itemId)
    .order("effective_from", { ascending: true })
    .order("created_at", { ascending: true });

  // An item with no versions is a broken row, not an empty answer — but a
  // failed read is neither, and only this tells them apart.
  if (error) throw new LookupError(`Couldn't read versions for ${itemId}: ${error.message}`);
  return (data ?? []) as ItemVersion[];
}

/** Creates the item if this is the first time it has been eaten. */
export async function upsertItem(name: string): Promise<Item> {
  const supabase = getServiceClient();
  const normalized = normalizeName(name);

  const existing = await findItem(name);
  if (existing) return existing.item;

  const { data, error } = await supabase
    .from("items")
    .insert({ name: name.trim(), normalized_name: normalized })
    .select("id, name, normalized_name, created_at")
    .single();

  // A unique violation means a concurrent insert won the race, which is a
  // success for our purposes — re-read rather than fail.
  if (error?.code === "23505") {
    const raced = await findItem(name);
    if (raced) return raced.item;
  }
  if (error) throw new LookupError(`Couldn't create "${name}": ${error.message}`);
  return data as Item;
}

export async function addVersion(params: {
  itemId: string;
  macros: Macros;
  kind: VersionKind;
  effectiveFrom: string;
  source: MacroSource;
  model?: string | null;
  sourceUrl?: string | null;
  note?: string | null;
}): Promise<ItemVersion> {
  const { data, error } = await getServiceClient()
    .from("item_versions")
    .insert({
      item_id: params.itemId,
      kcal: params.macros.kcal,
      protein_g: params.macros.protein_g,
      carbs_g: params.macros.carbs_g,
      fat_g: params.macros.fat_g,
      kind: params.kind,
      effective_from: params.effectiveFrom,
      source: params.source,
      // The database enforces this pairing too; sending null explicitly keeps
      // a `hand` row from carrying a stale model name from the caller.
      model: params.source === "hand" ? null : (params.model ?? null),
      source_url: params.sourceUrl ?? null,
      note: params.note ?? null,
    })
    .select("*")
    .single();

  if (error) throw new LookupError(`Couldn't record a new version: ${error.message}`);
  return data as ItemVersion;
}
