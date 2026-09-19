import { getServiceClient } from "./supabase";
import {
  findItem, upsertItem, addVersion, versionsOf, resolveVersion, eraFor,
  LookupError, type ItemVersion,
} from "./items";
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

/** Exact equality, because a draft's numbers are either untouched or typed over. */
export function sameMacros(a: Macros, b: Macros): boolean {
  return (
    a.kcal === b.kcal && a.protein_g === b.protein_g &&
    a.carbs_g === b.carbs_g && a.fat_g === b.fat_g
  );
}

// ---------------------------------------------------------------------------
// Approving a draft — the only thing that writes.
// ---------------------------------------------------------------------------

/**
 * Guardrail 1: the draft is not the log, and approving is the only thing that
 * writes. Everything above this line is read-only.
 *
 * **Whether a line becomes a new version is decided here, from the numbers
 * themselves rather than from a flag the client sends.** A client flag is a
 * claim; re-resolving and comparing is a measurement, and this is the write
 * path for the table the whole design calls authoritative.
 *
 * A number typed over by hand becomes a `correction` — the default kind, and
 * the right one: you are saying the figure was wrong, not that the food changed.
 * A food that actually changed is a different gesture, made deliberately from
 * the item's own screen, and it is the one that does not reach backwards.
 */
export async function saveEntry(draft: Draft): Promise<{ id: string }> {
  const supabase = getServiceClient();

  const rows: {
    item_id: string; quantity: number; position: number;
    resolved_source: MacroSource; resolved_model: string | null;
  }[] = [];

  for (const [index, line] of draft.items.entries()) {
    if (line.error) continue;

    const item = await upsertItem(line.name);
    const existing = await versionsOf(item.id);
    const current = resolveVersion(existing, draft.eaten_on);

    let source = line.source;
    let model = line.model;

    if (!current) {
      // First time this food has been eaten: the draft's numbers become its
      // first version, carrying whatever produced them.
      await addVersion({
        itemId: item.id,
        macros: line.macros,
        kind: "correction",
        effectiveFrom: draft.eaten_on,
        source: line.source,
        model: line.source === "hand" ? null : line.model,
        sourceUrl: line.source_url,
        note: line.note,
      });
    } else if (!sameMacros(macrosOf(current), line.macros)) {
      // Typed over. That is a correction to the era in effect on this date, so
      // it reaches backwards through that era and nothing is overwritten.
      await addVersion({
        itemId: item.id,
        macros: line.macros,
        kind: "correction",
        effectiveFrom: eraFor(existing, draft.eaten_on),
        source: "hand",
        model: null,
        note: "Corrected while approving a log entry.",
      });
      source = "hand";
      model = null;
    } else {
      source = current.source;
      model = current.model;
    }

    rows.push({
      item_id: item.id,
      quantity: line.quantity,
      position: index,
      resolved_source: source,
      resolved_model: source === "hand" ? null : model,
    });
  }

  if (rows.length === 0) throw new LookupError("Nothing in this draft could be logged.");

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

/**
 * A day, with every line resolved to the version that applies **to that day**
 * rather than to the newest one.
 *
 * That is the whole reason entries reference an item's identity instead of
 * carrying a copy of its numbers: a correction made today fixes last Tuesday,
 * and a change made today leaves last Tuesday alone.
 */
export async function readDay(date: string): Promise<Day> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("entries")
    .select("id, dictated_text, meal, eaten_on, created_at, entry_items(id, item_id, quantity, position, resolved_source, resolved_model)")
    .eq("eaten_on", date)
    .order("created_at", { ascending: true });

  if (error) throw new LookupError(`Couldn't read ${date}: ${error.message}`);

  const raw = (data ?? []) as {
    id: string; dictated_text: string; meal: Meal;
    entry_items: { id: string; item_id: string; quantity: number; position: number; resolved_source: MacroSource; resolved_model: string | null }[];
  }[];

  const itemIds = [...new Set(raw.flatMap((e) => e.entry_items.map((i) => i.item_id)))];
  if (itemIds.length === 0) return { date, entries: [], total: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } };

  const { data: itemRows, error: itemError } = await supabase
    .from("items").select("id, name").in("id", itemIds);
  if (itemError) throw new LookupError(`Couldn't read the foods for ${date}: ${itemError.message}`);

  const { data: versionRows, error: versionError } = await supabase
    .from("item_versions").select("*").in("item_id", itemIds);
  if (versionError) throw new LookupError(`Couldn't read the numbers for ${date}: ${versionError.message}`);

  const names = new Map((itemRows ?? []).map((i) => [i.id as string, i.name as string]));
  const byItem = new Map<string, ItemVersion[]>();
  for (const v of (versionRows ?? []) as ItemVersion[]) {
    byItem.set(v.item_id, [...(byItem.get(v.item_id) ?? []), v]);
  }

  const entries: LoggedEntry[] = raw.map((e) => {
    const items: LoggedItem[] = [...e.entry_items]
      .sort((a, b) => a.position - b.position)
      .map((line) => {
        const version = resolveVersion(byItem.get(line.item_id) ?? [], date);
        return {
          id: line.id,
          item_id: line.item_id,
          name: names.get(line.item_id) ?? "Unknown",
          quantity: Number(line.quantity),
          macros: version ? macrosOf(version) : { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
          // What answered at approval time, which is what makes a day's totals
          // readable later: your own log, or a model.
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
