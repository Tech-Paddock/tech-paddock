import { getServiceClient } from "./supabase";
import { LookupError } from "./errors";

/**
 * The shopping list, and the two ways it leaves this app.
 *
 * **This is the cheap version, and it was chosen rather than settled for.** The
 * list goes to King Soopers as text you copy or a search link you tap — no
 * stored credential, no OAuth, no carve-out in `middleware.ts`. Pushing straight
 * into a Kroger cart needs all three and the only thing it buys is who does the
 * tapping. Joel picked this on 2026-09-19 and the constraint moved here with the
 * list rather than being reopened.
 *
 * **This is `cookbook.grocery_items`, not Health's table.** Health's `/list` is
 * live and stays Health's until the technical director sequences the move
 * (ledger item 23 — destructive, so two pull requests). Nothing here writes
 * `health.*`, and nothing here assumes that screen disappears on any date.
 */

export type GrocerySource = "manual" | "recipe";

export type GroceryItem = {
  id: string;
  name: string;
  note: string | null;
  source: GrocerySource;
  checked: boolean;
  created_at: string;
};

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

/** The open lines as a block you can paste anywhere. Ticked-off lines are not shopping. */
export function asText(items: GroceryItem[]): string {
  const open = items.filter((i) => !i.checked);
  if (open.length === 0) return "";
  return open.map((i) => (i.note ? `${i.name} — ${i.note}` : i.name)).join("\n");
}

// ---------------------------------------------------------------------------
// Reads and writes. A failed query throws; it never returns an empty list.
// ---------------------------------------------------------------------------

export async function readList(): Promise<GroceryItem[]> {
  const { data, error } = await getServiceClient()
    .from("grocery_items")
    .select("id, name, note, source, checked, created_at")
    .order("checked", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new LookupError(`Couldn't read the list: ${error.message}`);
  return (data ?? []) as GroceryItem[];
}

export async function addItems(
  lines: { name: string; note?: string | null; source?: GrocerySource }[]
): Promise<GroceryItem[]> {
  const rows = lines
    .map((l) => ({
      name: l.name.trim(),
      note: l.note?.trim() || null,
      source: l.source ?? ("manual" as GrocerySource),
    }))
    .filter((l) => l.name.length > 0);

  if (rows.length === 0) throw new LookupError("Nothing to add.");

  const { data, error } = await getServiceClient()
    .from("grocery_items")
    .insert(rows)
    .select("id, name, note, source, checked, created_at");

  if (error) throw new LookupError(`Couldn't add that: ${error.message}`);
  return (data ?? []) as GroceryItem[];
}

export async function setChecked(id: string, checked: boolean): Promise<void> {
  const { error } = await getServiceClient()
    .from("grocery_items")
    .update({ checked })
    .eq("id", id);
  if (error) throw new LookupError(`Couldn't tick that off: ${error.message}`);
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
 * you buy.
 */
export function validateTidy(open: GroceryItem[], lines: TidyLine[]): string | null {
  const seen = new Map<string, number>();
  for (const line of lines) {
    if (!line.name.trim()) return "A proposed line has no name.";
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

/** Apply an approved tidy: the absorbed rows go, the consolidated lines arrive. */
export async function applyTidy(open: GroceryItem[], lines: TidyLine[]): Promise<GroceryItem[]> {
  const problem = validateTidy(open, lines);
  if (problem) throw new LookupError(problem);

  const rows = lines.map((l) => ({ name: l.name, note: l.note, source: sourceOf(l, open) }));

  // Write first, then delete. The other order has a window where a failed insert
  // leaves you with no list at all, in a shop, which is the one outcome worth
  // designing around — a duplicated list is annoying and recoverable by ticking.
  const added = await addItems(rows);
  await removeItems(open.map((i) => i.id));
  return added;
}
