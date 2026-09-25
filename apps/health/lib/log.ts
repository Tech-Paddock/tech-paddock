import { getServiceClient } from "./supabase";
import {
  findItem, upsertItem, addVersion, resolveVersion, eraFor,
  LookupError, type ItemVersion,
} from "./items";
import { decideLine, duplicateFoods, type LineDecision } from "./approve";
import { estimateMacros } from "./anthropic";
import { total, round, type Macros, type MacroSource } from "./macros";
import type { Meal } from "./meals";
import { DEFAULT_MODEL, type ModelId } from "./models";

/**
 * The lookup order, the draft it produces, and what approving one writes.
 *
 * **The order is the product** — the charter says so — and it is here rather
 * than in a route so that the route is transport and this is the decision.
 */

export type DraftItem = {
  name: string;
  quantity: number;
  macros: Macros;
  source: MacroSource;
  model: string | null;
  source_url: string | null;
  note: string | null;
  /** True when the table already knew this food. The provenance the screen leads with. */
  known: boolean;
  item_id: string | null;
  /** Set when the lookup or the estimate failed for this line, so it renders as a problem. */
  error: string | null;
};

export type Draft = {
  dictated_text: string;
  meal: Meal;
  eaten_on: string;
  items: DraftItem[];
};

/**
 * Resolve one parsed item against the table, and only go outside on a genuine
 * miss.
 *
 * **Guardrail 6 and guardrail 2 meet here.** The table is read first because a
 * search would otherwise overwrite a correction already made by hand — that is
 * correctness, not cost. And a `LookupError` is re-thrown rather than treated as
 * a miss, because a swallowed database error degrades this whole app into
 * internet-first with nothing on screen changing.
 */
export async function resolveItem(params: {
  name: string;
  quantity: number;
  onDate: string;
  model?: ModelId;
}): Promise<DraftItem> {
  const base = {
    name: params.name,
    quantity: params.quantity,
    source_url: null as string | null,
    note: null as string | null,
    error: null as string | null,
  };

  // Tier 1 and 2. A throw here is a broken database and must reach the caller.
  const remembered = await findItem(params.name);

  if (remembered) {
    const version = resolveVersion(remembered.versions, params.onDate);
    if (version) {
      return {
        ...base,
        macros: macrosOf(version),
        source: version.source,
        model: version.model,
        source_url: version.source_url,
        note: version.note,
        known: true,
        item_id: remembered.item.id,
      };
    }
    // An item row with no versions is a broken row rather than a miss. Say so
    // instead of quietly estimating over it.
    return {
      ...base,
      macros: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      source: "estimate",
      model: null,
      known: true,
      item_id: remembered.item.id,
      error: `"${params.name}" is in your log with no numbers recorded.`,
    };
  }

  // Tier 3. Only reached on a genuine miss.
  const model = params.model ?? DEFAULT_MODEL;
  try {
    const estimate = await estimateMacros({ name: params.name, model });
    return {
      ...base,
      macros: estimate.macros,
      // The model was given the choice and this records which it took: a page
      // it actually read, or its own knowledge. The distinction is what makes
      // the provenance worth showing.
      source: estimate.source_url ? "web" : "estimate",
      model,
      source_url: estimate.source_url,
      note: estimate.note,
      known: false,
      item_id: null,
    };
  } catch (e) {
    return {
      ...base,
      macros: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      source: "estimate",
      model,
      known: false,
      item_id: null,
      error: e instanceof Error ? e.message : `Couldn't work out "${params.name}".`,
    };
  }
}

export function macrosOf(v: ItemVersion): Macros {
  return {
    kcal: Number(v.kcal),
    protein_g: Number(v.protein_g),
    carbs_g: Number(v.carbs_g),
    fat_g: Number(v.fat_g),
  };
}

/**
 * A draft that cannot be logged as it stands — a line that failed, a food named
 * twice, a line renamed after its lookup. The client's to fix, so it is a 409
 * rather than a broken database's 503, and nothing has been written.
 */
export class DraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftError";
  }
}

// ---------------------------------------------------------------------------
// Approving a draft — the only thing that writes.
// ---------------------------------------------------------------------------

/**
 * Guardrail 1: the draft is not the log, and approving is the only thing that
 * writes. Everything above this line is read-only.
 *
 * **Every line is decided before anything is written** (`decideLine`), so a
 * draft refused for one line leaves no half-written food behind for the others.
 * A number is recorded as yours only when the line says it was typed over —
 * never inferred from a difference; a difference nobody typed is a stale draft.
 *
 * **Each line snapshots the numbers it was logged with, and the version they
 * came from** (TEC-21). A day's total is then a plain sum that no later
 * correction moves, and the version id is what a backfill would read.
 */
export async function saveEntry(draft: Draft): Promise<{ id: string }> {
  const supabase = getServiceClient();

  // A line that failed used to be skipped silently, so a meal of three logged
  // as two with nothing said. Refuse it and let the screen say which.
  const failed = draft.items.filter((l) => l.error).map((l) => l.name);
  if (failed.length > 0) {
    throw new DraftError(`Couldn't work out ${failed.map((n) => `"${n}"`).join(", ")}. Fix or remove it before logging.`);
  }
  const dupes = duplicateFoods(draft.items.map((l) => l.name));
  if (dupes.length > 0) {
    throw new DraftError(`${dupes.map((n) => `"${n}"`).join(", ")} is on this draft twice. Make it one line with a quantity.`);
  }

  // Reads and decisions first. A throw from findItem is a broken database.
  const plans: {
    line: DraftItem; index: number; versions: ItemVersion[];
    decision: Exclude<LineDecision, { action: "reject" }>;
  }[] = [];
  for (const [index, line] of draft.items.entries()) {
    const remembered = await findItem(line.name);
    const versions = remembered?.versions ?? [];
    const current = resolveVersion(versions, draft.eaten_on);
    const decision = decideLine(line, remembered?.item.id ?? null, current);
    if (decision.action === "reject") throw new DraftError(decision.reason);
    plans.push({ line, index, versions, decision });
  }

  // Then writes. Versions are knowledge about the food and stand even if the
  // entry below fails; they are append-only, so nothing is lost either way.
  const rows: Record<string, unknown>[] = [];
  for (const { line, index, versions, decision } of plans) {
    let version: ItemVersion;
    if (decision.action === "reuse") {
      version = decision.version;
    } else if (decision.action === "first") {
      const item = await upsertItem(line.name);
      version = await addVersion({
        itemId: item.id,
        macros: line.macros,
        kind: "correction",
        effectiveFrom: draft.eaten_on,
        source: decision.source,
        model: decision.model,
        sourceUrl: decision.source_url,
        note: decision.note,
      });
    } else {
      // Typed over: a correction to the era in effect on this date. It fixes the
      // food from here on and moves no day already logged.
      version = await addVersion({
        itemId: line.item_id as string,
        macros: line.macros,
        kind: "correction",
        effectiveFrom: eraFor(versions, draft.eaten_on),
        source: "hand",
        model: null,
        note: "Corrected while approving a log entry.",
      });
    }

    rows.push({
      item_id: version.item_id,
      item_version_id: version.id,
      ...macrosOf(version),
      quantity: line.quantity,
      position: index,
      resolved_source: version.source,
      resolved_model: version.source === "hand" ? null : version.model,
    });
  }

  if (rows.length === 0) throw new DraftError("Nothing in this draft to log.");

  const { data: entry, error } = await supabase
    .from("entries")
    .insert({
      dictated_text: draft.dictated_text,
      meal: draft.meal,
      eaten_on: draft.eaten_on,
    })
    .select("id")
    .single();

  if (error) throw new LookupError(`Couldn't save that entry: ${error.message}`);

  const { error: itemsError } = await supabase
    .from("entry_items")
    .insert(rows.map((r) => ({ ...r, entry_id: entry.id })));

  if (itemsError) {
    // The entry without its items is a row that renders as an empty meal, which
    // is worse than no row. Remove it rather than leave it.
    await supabase.from("entries").delete().eq("id", entry.id);
    throw new LookupError(`Couldn't save that entry's items: ${itemsError.message}`);
  }

  return { id: entry.id as string };
}

// ---------------------------------------------------------------------------
// Reading a day back.
// ---------------------------------------------------------------------------

export type LoggedItem = {
  id: string;
  name: string;
  item_id: string;
  quantity: number;
  macros: Macros;
  source: MacroSource;
  model: string | null;
};

export type LoggedEntry = {
  id: string;
  dictated_text: string;
  meal: Meal;
  items: LoggedItem[];
  macros: Macros;
};

export type Day = { date: string; entries: LoggedEntry[]; total: Macros };

type SnapshotColumns = {
  item_version_id: string | null;
  kcal: number | string | null; protein_g: number | string | null;
  carbs_g: number | string | null; fat_g: number | string | null;
};

type RawLine = SnapshotColumns & {
  id: string; item_id: string; quantity: number; position: number;
  resolved_source: MacroSource; resolved_model: string | null;
};

/** The numbers a line was logged with, or null for a line written before snapshots. */
export function snapshotOf(line: SnapshotColumns): Macros | null {
  if (line.item_version_id === null || line.kcal === null || line.protein_g === null ||
      line.carbs_g === null || line.fat_g === null) return null;
  return {
    kcal: Number(line.kcal),
    protein_g: Number(line.protein_g),
    carbs_g: Number(line.carbs_g),
    fat_g: Number(line.fat_g),
  };
}

/**
 * A day, as it was logged: **a plain sum of each line's snapshot** (TEC-21). A
 * correction made since does not move it.
 *
 * A line with no snapshot can only have been written by the code before
 * snapshots, in the minutes between the migration and this code going live. It
 * is resolved the old way rather than summed as zero, because a silently
 * missing total is the failure this app is least allowed to have. The fallback
 * goes when the columns become NOT NULL.
 */
export async function readDay(date: string): Promise<Day> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("entries")
    .select("id, dictated_text, meal, eaten_on, created_at, entry_items(id, item_id, quantity, position, resolved_source, resolved_model, item_version_id, kcal, protein_g, carbs_g, fat_g)")
    .eq("eaten_on", date)
    .order("created_at", { ascending: true });

  if (error) throw new LookupError(`Couldn't read ${date}: ${error.message}`);

  const raw = (data ?? []) as { id: string; dictated_text: string; meal: Meal; entry_items: RawLine[] }[];

  const itemIds = [...new Set(raw.flatMap((e) => e.entry_items.map((i) => i.item_id)))];
  if (itemIds.length === 0) return { date, entries: [], total: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } };

  const { data: itemRows, error: itemError } = await supabase
    .from("items").select("id, name").in("id", itemIds);
  if (itemError) throw new LookupError(`Couldn't read the foods for ${date}: ${itemError.message}`);
  const names = new Map((itemRows ?? []).map((i) => [i.id as string, i.name as string]));

  const unsnapshotted = [...new Set(raw.flatMap((e) =>
    e.entry_items.filter((l) => snapshotOf(l) === null).map((l) => l.item_id)))];
  const byItem = new Map<string, ItemVersion[]>();
  if (unsnapshotted.length > 0) {
    const { data: versionRows, error: versionError } = await supabase
      .from("item_versions").select("*").in("item_id", unsnapshotted);
    if (versionError) throw new LookupError(`Couldn't read the numbers for ${date}: ${versionError.message}`);
    for (const v of (versionRows ?? []) as ItemVersion[]) {
      byItem.set(v.item_id, [...(byItem.get(v.item_id) ?? []), v]);
    }
  }

  const entries: LoggedEntry[] = raw.map((e) => {
    const items: LoggedItem[] = [...e.entry_items]
      .sort((a, b) => a.position - b.position)
      .map((line) => {
        let macros = snapshotOf(line);
        if (!macros) {
          const version = resolveVersion(byItem.get(line.item_id) ?? [], date);
          if (!version) throw new LookupError(`A line on ${date} has no numbers recorded.`);
          macros = macrosOf(version);
        }
        return {
          id: line.id,
          item_id: line.item_id,
          name: names.get(line.item_id) ?? "Unknown",
          quantity: Number(line.quantity),
          macros,
          // What answered at approval time: your own log, or a model.
          source: line.resolved_source,
          model: line.resolved_model,
        };
      });

    return {
      id: e.id,
      dictated_text: e.dictated_text,
      meal: e.meal,
      items,
      macros: round(total(items.map((i) => ({ macros: i.macros, quantity: i.quantity })))),
    };
  });

  const everything = entries.flatMap((e) => e.items.map((i) => ({ macros: i.macros, quantity: i.quantity })));
  return { date, entries, total: round(total(everything)) };
}
