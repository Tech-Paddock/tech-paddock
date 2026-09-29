import { getServiceClient } from "./supabase";
import { LookupError } from "./items";
import { GRAM_KEYS, isGramKey, targetFor, type Target, type TargetInput } from "./targets";

/**
 * Reading and writing `health.targets` (TEC-53). Database only — no model.
 *
 * **A failed read is never "no target set".** Both are an empty answer to a
 * careless caller, and only one of them is true; the other would show a full
 * day's budget as simply absent. So a failed query throws `LookupError`, and
 * null comes back only when the table genuinely has no target for the day.
 */

type Row = {
  id: string; effective_from: string; created_at: string;
  protein_g: number | string; carbs_g: number | string; fat_g: number | string;
  locked: string[] | null;
};

function toTarget(row: Row): Target {
  return {
    id: row.id,
    effective_from: row.effective_from,
    created_at: row.created_at,
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
    locked: GRAM_KEYS.filter((k) => (row.locked ?? []).filter(isGramKey).includes(k)),
  };
}

/** The target in effect on `date`, or null when none had started by then. */
export async function readTargetFor(date: string): Promise<Target | null> {
  const { data, error } = await getServiceClient()
    .from("targets")
    .select("id, effective_from, created_at, protein_g, carbs_g, fat_g, locked")
    .lte("effective_from", date)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new LookupError(`Couldn't read your target: ${error.message}`);
  // The query already orders by the rule; `targetFor` applies it once more so
  // the rule that decides is the tested one, not the query's.
  return targetFor(((data ?? []) as Row[]).map(toTarget), date);
}

/** Append a target. Nothing is updated in place; a day keeps the one it had. */
export async function saveTarget(input: TargetInput): Promise<Target> {
  const { data, error } = await getServiceClient()
    .from("targets")
    .insert({
      effective_from: input.effective_from,
      protein_g: input.protein_g,
      carbs_g: input.carbs_g,
      fat_g: input.fat_g,
      locked: input.locked,
    })
    .select("id, effective_from, created_at, protein_g, carbs_g, fat_g, locked")
    .single();

  if (error) throw new LookupError(`Couldn't save that target: ${error.message}`);
  return toTarget(data as Row);
}
