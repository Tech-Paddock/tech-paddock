import { normalizeName, type ItemVersion } from "./items";
import type { Macros, MacroSource } from "./macros";
import { fixItInTheCookbook } from "./cookbook";

/**
 * What approving one draft line writes, decided before anything is written.
 *
 * Pure, so the decision that puts provenance on the one table this app calls
 * authoritative is tested rather than reasoned about. `saveEntry` does the reads,
 * asks this, and only then writes.
 *
 * **Provenance is never inferred from a numeric difference.** It used to be: a
 * line whose numbers differed from the stored ones was recorded as a hand
 * correction. So a renamed line carried one food's numbers onto another as
 * though you had typed them, and a second estimate of the same food became a
 * "correction" of the first. Now a number is `hand` only when the line says it
 * was typed over, and a difference nobody typed is a stale draft, refused.
 */

export type ApprovedLine = {
  name: string;
  macros: Macros;
  source: MacroSource;
  model: string | null;
  source_url: string | null;
  note: string | null;
  /** The item the draft was looked up as. Null when the lookup found nothing. */
  item_id: string | null;
};

export type LineDecision =
  /** The draft no longer describes what the table holds. Nothing is written. */
  | { action: "reject"; reason: string }
  /** First time this food is logged: the line's numbers become its first version. */
  | { action: "first"; source: MacroSource; model: string | null; source_url: string | null; note: string | null }
  /** Typed over by hand: append a hand correction and snapshot it. */
  | { action: "correct" }
  /** The table's current version, unchanged: snapshot it as it stands. */
  | { action: "reuse"; version: ItemVersion }
  /** A Cookbook recipe whose numbers differ from the item's current version: append them as a `cookbook` version. */
  | { action: "cookbook" };

export function sameMacros(a: Macros, b: Macros): boolean {
  return (
    Number(a.kcal) === Number(b.kcal) && Number(a.protein_g) === Number(b.protein_g) &&
    Number(a.carbs_g) === Number(b.carbs_g) && Number(a.fat_g) === Number(b.fat_g)
  );
}

/**
 * @param itemId  the item the line's name resolves to now, or null for a miss
 * @param current the version of that item in effect on the entry's date
 */
export function decideLine(line: ApprovedLine, itemId: string | null, current: ItemVersion | null): LineDecision {
  // The draft was looked up as one food and now names another — renamed after
  // the lookup, or the table changed underneath it. Its numbers and provenance
  // belong to whatever it was looked up as, so none of them can be trusted here.
  if ((line.item_id ?? null) !== (itemId ?? null)) {
    return {
      action: "reject",
      reason: `"${line.name}" has changed since it was looked up. Look it up again before logging it.`,
    };
  }

  // A Cookbook number reaches here only when the name no longer matches a
  // recipe — renamed or removed in the Cookbook since the draft was made.
  // Its numbers belong to a recipe that is not there, so look it up again.
  if (line.source === "cookbook") {
    return {
      action: "reject",
      reason: `"${line.name}" isn't a Cookbook recipe any more. Look it up again before logging it.`,
    };
  }

  if (!itemId || !current) {
    if (line.source === "hand") {
      return { action: "first", source: "hand", model: null, source_url: null, note: line.note };
    }
    // The database refuses a model-produced number without its model; saying
    // so here is clearer than the constraint's name.
    if (!line.model) {
      return { action: "reject", reason: `"${line.name}" has no model behind its numbers. Look it up again.` };
    }
    return { action: "first", source: line.source, model: line.model, source_url: line.source_url, note: line.note };
  }

  if (sameMacros(line.macros, current)) return { action: "reuse", version: current };

  if (line.source === "hand") return { action: "correct" };

  return {
    action: "reject",
    reason: `The numbers for "${line.name}" don't match your log and weren't typed in. Look it up again.`,
  };
}

/**
 * What approving a line that names a Cookbook recipe writes (TEC-25).
 *
 * **The recipe's numbers have one owner, the Cookbook** (Joel, 2026-09-26), so
 * the line must carry exactly what the Cookbook says now, read again at approve
 * time rather than trusted from the browser. A number typed over here is
 * refused: stored as a Health correction it would be bypassed by the next log,
 * which asks the Cookbook first. The fix belongs in the Cookbook.
 *
 * The recipe is stored as an ordinary item, keyed on its name, with a
 * `cookbook` version appended whenever the Cookbook's numbers differ from the
 * item's current one — so the snapshot and a backfill work unchanged.
 *
 * @param itemId     the item the line's name resolves to now, or null
 * @param current    that item's version in effect on the entry's date
 * @param perServing what the Cookbook returned for this recipe just now
 */
export function decideRecipeLine(
  line: ApprovedLine,
  itemId: string | null,
  current: ItemVersion | null,
  perServing: Macros
): LineDecision {
  if ((line.item_id ?? null) !== (itemId ?? null)) {
    return {
      action: "reject",
      reason: `"${line.name}" has changed since it was looked up. Look it up again before logging it.`,
    };
  }
  if (line.source === "hand") {
    return {
      action: "reject",
      reason: fixItInTheCookbook(line.name),
    };
  }
  // Not looked up as a recipe (it became one after the draft), or the Cookbook's
  // numbers moved since the lookup. Either way the draft is stale.
  if (line.source !== "cookbook" || !sameMacros(line.macros, perServing)) {
    return {
      action: "reject",
      reason: `The Cookbook's numbers for "${line.name}" changed since it was looked up. Look it up again.`,
    };
  }
  if (!itemId) return { action: "first", source: "cookbook", model: null, source_url: null, note: line.note };
  if (current && current.source === "cookbook" && sameMacros(current, perServing)) {
    return { action: "reuse", version: current };
  }
  return { action: "cookbook" };
}

/**
 * Lines that name the same food. Two lines for one food would be two lookups
 * that can disagree, and the second would land as a version of the first, so a
 * draft carrying them is refused rather than guessed at.
 */
export function duplicateFoods(names: string[]): string[] {
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const name of names) {
    const key = normalizeName(name);
    if (seen.has(key)) dupes.push(name);
    else seen.set(key, name);
  }
  return dupes;
}

/**
 * Fold parsed lines that name the same food into one, adding their quantities,
 * **before** anything is estimated — so a food said twice is one lookup and one
 * set of numbers rather than two estimates that can disagree.
 */
export function mergeSameFood<T extends { name: string; quantity: number }>(items: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) {
    const key = normalizeName(item.name);
    const already = byKey.get(key);
    if (already) byKey.set(key, { ...already, quantity: already.quantity + item.quantity });
    else byKey.set(key, { ...item });
  }
  return [...byKey.values()];
}
