import { getServiceClient } from "./supabase";
import { ConflictError, InputError, LookupError } from "./errors";
import { moveSends } from "./cartSends";
import { MAX_QUANTITY, asText } from "./groceryText";

// The helpers the browser runs live in `lib/groceryText.ts`, which imports no `./supabase`.
export { MAX_QUANTITY, asText };

/**
 * The shopping list, and the three ways it leaves this app.
 *
 * **Text you copy, a search link you tap, or Send to cart.** The first two were
 * the whole of it until the no-OAuth rule was reversed for King Soopers on
 * 2026-09-26 (TEC-90); the cart lives in `lib/cart.ts` and `lib/kroger.ts`, and
 * this file only carries what a line needs for it — a quantity, and when it was
 * last sent. No gate exception for the list: the only one is the nightly price scan's path.
 *
 * **This is `cookbook.grocery_items`.** Health's list moved here and its table
 * is gone (TEC-15); nothing here writes `health.*`.
 */

/**
 * A typed line, split into what is searched and what is only for the shopper.
 *
 * **Anything after the first " — " is a note** (TEC-29 item 3): "Milk — the
 * small tin" searches King Soopers for *Milk*, because "the small tin" narrows a
 * search to nothing. The help text under the add box promised this before
 * anything did it. Only a spaced em dash splits, so a hyphenated name never does.
 */
export function splitLine(line: string): { name: string; note: string | null } {
  const at = line.indexOf(" — ");
  if (at === -1) return { name: line.trim(), note: null };
  const name = line.slice(0, at).trim();
  const note = line.slice(at + 3).trim();
  // A line that is all note ("— the small tin") keeps its words as the name
  // rather than becoming a nameless row the database refuses.
  if (!name) return { name: line.replace(/^\s*—\s*/, "").trim(), note: null };
  return { name, note: note || null };
}

export type GrocerySource = "manual" | "recipe";

export type GroceryItem = {
  id: string;
  name: string;
  note: string | null;
  source: GrocerySource;
  checked: boolean;
  created_at: string;
  /**
   * Names of the recipes this line came from — a snapshot, plain text, no join
   * (TEC-39 B; reasoning in the `cookbook_menu_and_line_recipes` migration).
   * Empty for a typed line and for recipe lines added before the column existed.
   */
  recipes: string[];
  /** How many to put in the cart. Default 1 (the `cookbook_list_quantity_and_sent` migration). */
  quantity: number;
  /** When this line last went to the Kroger cart, or null. What a second send warns about. */
  sent_at: string | null;
};

const COLUMNS = "id, name, note, source, checked, created_at, recipes, quantity, sent_at";

/** A quantity this app will store, or null. Whole, 1 to 99 — the same range the table checks. */
export function readQuantity(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_QUANTITY ? n : null;
}

/** `text[]` can come back null from an older client or row; a line always has a list, and a quantity. */
function hydrate(row: Record<string, unknown>): GroceryItem {
  return {
    ...(row as unknown as GroceryItem),
    recipes: Array.isArray(row.recipes) ? (row.recipes as string[]) : [],
    quantity: readQuantity(row.quantity) ?? 1,
    sent_at: typeof row.sent_at === "string" ? row.sent_at : null,
  };
}

/**
 * The recipe names a merged line should carry: every absorbed line's, in order,
 * **without duplicates** — two recipes' olive oil becomes one line naming both,
 * and the same recipe twice names it once.
 */
export function unionRecipes(lines: Pick<GroceryItem, "recipes">[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    for (const name of line.recipes ?? []) {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name.trim());
    }
  }
  return out;
}

/**
 * A King Soopers search for one line.
 *
 * **Provenance, because this is the one string in the app that depends on
 * somebody else's site.** The `/q/<terms>` shape is taken from King Soopers' own
 * indexed URLs rather than from documentation, and it could **not** be confirmed
 * against a live request: `www.kingsoopers.com` is refused by this project's
 * egress proxy, so no session here can load it. It is one constant in one
 * function on purpose — if it is wrong it is a one-line fix, and this comment
 * says how much it was ever worth.
 */
export const SEARCH_BASE = "https://www.kingsoopers.com/q/";

/**
 * A search for whatever words it is given. **The one builder** — `resolveLink`
 * in `lib/preferences.ts` calls this for a remembered phrase and for the
 * fallback alike, so a fix to the URL shape is still a one-line fix.
 */
export function searchFor(terms: string): string {
  return SEARCH_BASE + encodeURIComponent(terms.trim().replace(/\s+/g, " "));
}

/** The generic search for a line: its name, and deliberately not its note. */
export function searchUrl(item: Pick<GroceryItem, "name">): string {
  // "2 lbs" and "the small tin" are instructions to a shopper, not search
  // terms, and they narrow a search to nothing.
  return searchFor(item.name);
}

// ---------------------------------------------------------------------------
// Reads and writes. A failed query throws; it never returns an empty list.
// ---------------------------------------------------------------------------

export async function readList(): Promise<GroceryItem[]> {
  const { data, error } = await getServiceClient()
    .from("grocery_items")
    .select(COLUMNS)
    .order("checked", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new LookupError(`Couldn't read the list: ${error.message}`);
  return (data ?? []).map((r) => hydrate(r as Record<string, unknown>));
}

export async function addItems(
  lines: {
    name: string;
    note?: string | null;
    source?: GrocerySource;
    recipes?: string[];
    quantity?: number;
    sent_at?: string | null;
  }[]
): Promise<GroceryItem[]> {
  const rows = lines
    .map((l) => ({
      name: l.name.trim(),
      note: l.note?.trim() || null,
      source: l.source ?? ("manual" as GrocerySource),
      recipes: unionRecipes([{ recipes: l.recipes ?? [] }]),
      // The quantity comes from the fixed rules (TEC-131, `lib/lineView.ts`) or a tidy; sent_at only from a tidy.
      ...(l.quantity !== undefined ? { quantity: readQuantity(l.quantity) ?? 1 } : {}),
      ...(l.sent_at ? { sent_at: l.sent_at } : {}),
    }))
    .filter((l) => l.name.length > 0);

  if (rows.length === 0) throw new InputError("Nothing to add.");

  const { data, error } = await getServiceClient().from("grocery_items").insert(rows).select(COLUMNS);

  if (error) throw new LookupError(`Couldn't add that: ${error.message}`);
  return (data ?? []).map((r) => hydrate(r as Record<string, unknown>));
}

export async function setChecked(id: string, checked: boolean): Promise<void> {
  const { error } = await getServiceClient()
    .from("grocery_items")
    .update({ checked })
    .eq("id", id);
  if (error) throw new LookupError(`Couldn't tick that off: ${error.message}`);
}

export async function setQuantity(id: string, quantity: number): Promise<void> {
  const { error } = await getServiceClient().from("grocery_items").update({ quantity }).eq("id", id);
  if (error) throw new LookupError(`Couldn't change how many: ${error.message}`);
}

/** Record that these lines went to the cart, so the next send can warn. */
export async function markSent(ids: string[], at: string): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getServiceClient().from("grocery_items").update({ sent_at: at }).in("id", ids);
  if (error) throw new LookupError(`Couldn't record what was sent: ${error.message}`);
}

/**
 * Take back removed what Cookbook sent for these lines (TEC-127): they read as
 * never sent, so the next send does not warn about them.
 */
export async function markUnsent(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getServiceClient().from("grocery_items").update({ sent_at: null }).in("id", ids);
  if (error) throw new LookupError(`Couldn't mark those as no longer sent: ${error.message}`);
}

export async function removeItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getServiceClient().from("grocery_items").delete().in("id", ids);
  if (error) throw new LookupError(`Couldn't remove that: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Tidying — the one model call that is not about a recipe.
// ---------------------------------------------------------------------------

export type TidyLine = {
  name: string;
  note: string | null;
  /** The ids of the list rows this line replaces. */
  absorbed: string[];
};

/**
 * Check a tidy proposal against the list it claims to consolidate.
 *
 * **In code, not in the prompt, because a prompt can only ask.** A tidy that
 * quietly drops *eggs* gives you a list that looks finished and sends you home
 * without eggs, and you find out at the worst possible moment.
 *
 * Every open line must be absorbed exactly once. Not zero times, which loses an
 * item; not twice, which would let one row vanish into two lines and double what
 * you buy. And every proposed line must absorb at least one, or it is shopping
 * the model added.
 */
export function validateTidy(open: GroceryItem[], lines: TidyLine[]): string | null {
  const seen = new Map<string, number>();
  for (const line of lines) {
    if (!line.name.trim()) return "A proposed line has no name.";
    // A line that replaces nothing is a line nobody listed — the tidy adding
    // shopping rather than consolidating it (TEC-29 item 8).
    if (line.absorbed.length === 0) return `"${line.name.trim()}" isn't on your list.`;
    for (const id of line.absorbed) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }

  const missing = open.filter((i) => !seen.has(i.id));
  if (missing.length > 0) {
    return `That would have dropped ${missing.map((i) => `"${i.name}"`).join(", ")}.`;
  }

  const doubled = [...seen.entries()].filter(([, n]) => n > 1);
  if (doubled.length > 0) return "That used the same line twice.";

  const unknown = [...seen.keys()].filter((id) => !open.some((i) => i.id === id));
  if (unknown.length > 0) return "That referred to a line that is not on your list.";

  return null;
}

/**
 * What a consolidated line's source is.
 *
 * Where every row a line absorbed came from the same place, the new line came
 * from there too. A merge of mixed sources is `manual`, because that is what it
 * now is — half of it was typed. Flattening this silently is the kind of loss
 * that is only noticed long after anything cared about it.
 */
function sourceOf(line: TidyLine, open: GroceryItem[]): GrocerySource {
  const sources = new Set(
    line.absorbed.map((id) => open.find((i) => i.id === id)?.source).filter(Boolean)
  );
  return sources.size === 1 ? ([...sources][0] as GrocerySource) : "manual";
}

/**
 * What a merged line carries for the cart (TEC-90).
 *
 * **The largest quantity, not the sum**: two recipes' olive oil is one bottle,
 * and summing would put two in the cart. **The latest send, if any absorbed line
 * was sent**: a merge must never erase the warning, because the Cart API only
 * adds — a merged line that forgot it was half-sent would double that half.
 */
export function carryCart(absorbed: Pick<GroceryItem, "quantity" | "sent_at">[]): {
  quantity: number;
  sent_at: string | null;
} {
  const quantity = Math.max(1, ...absorbed.map((a) => a.quantity ?? 1));
  const sent = absorbed.map((a) => a.sent_at).filter((s): s is string => typeof s === "string").sort();
  return { quantity, sent_at: sent.length > 0 ? sent[sent.length - 1] : null };
}

/** Apply an approved tidy: the absorbed rows go, the consolidated lines arrive. */
export async function applyTidy(
  open: GroceryItem[],
  lines: TidyLine[],
  /** The fixed rules' cart quantity for a merged line (TEC-131); the larger of it and the carried one goes in. */
  quantityOf?: (line: { name: string; note: string | null }) => number
): Promise<GroceryItem[]> {
  const problem = validateTidy(open, lines);
  if (problem) throw new ConflictError(problem);

  const rows = lines.map((l) => {
    const absorbed = l.absorbed.map((id) => open.find((i) => i.id === id)).filter((i): i is GroceryItem => !!i);
    const carried = carryCart(absorbed);
    return {
      name: l.name,
      note: l.note,
      source: sourceOf(l, open),
      // The merged line names every recipe its rows came from (TEC-39 B).
      recipes: unionRecipes(absorbed),
      ...carried,
      // 6 cloves and 8 cloves were a head each; together, 14, they are two.
      quantity: Math.max(carried.quantity, quantityOf ? quantityOf({ name: l.name, note: l.note }) : 1),
    };
  });

  // Write first, then delete. The other order has a window where a failed insert
  // leaves you with no list at all, in a shop, which is the one outcome worth
  // designing around — a duplicated list is annoying and recoverable by ticking.
  const added = await addItems(rows);

  // **What was sent follows the line** (TEC-127): the absorbed rows are about
  // to go, and their cart sends would be let go with them, leaving a sent line
  // that Take back can't find. Before the delete, so a failure leaves the
  // duplicated list described above rather than a lost record.
  if (added.length !== lines.length || added.some((a, i) => a.name !== rows[i].name.trim())) {
    throw new ConflictError("The tidied lines came back out of order, so the old ones were kept. Your list may show both; tick or clear the extras.");
  }
  await Promise.all(lines.map((line, i) => moveSends(line.absorbed, added[i].id)));

  await removeItems(open.map((i) => i.id));
  return added;
}
