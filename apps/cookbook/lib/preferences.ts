import { getServiceClient } from "./supabase";
import { ConflictError, LookupError } from "./errors";
import { searchFor } from "./grocery";
import { itemWords } from "./itemWords";
import type { Decision } from "./brands";

/**
 * Search words in Your brands: `cookbook.brand_preferences`, **now only its
 * `terms` and old `plain` rows** (TEC-131). Products moved to
 * `cookbook.products`, one row per code (`lib/productStore.ts`); this table's
 * `product` rows were copied there by the `cookbook_products` migration and are
 * no longer read here. Dropping them is a later pull request.
 *
 * A search-word row is a phrase and the words to search instead. `plain` —
 * *search this the ordinary way* — is refused on write since TEC-39 and still
 * honoured on an old row. Matching lives in `lib/brands.ts` (`decide`), so a
 * phrase and a product name are weighed by one rule: longest first.
 */

export type PreferenceKind = "product" | "terms" | "plain";

export type Preference = {
  id: string;
  phrase: string;
  kind: PreferenceKind;
  url: string | null;
  terms: string | null;
  brand: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, phrase, kind, url, terms, brand, note, created_at, updated_at";

/**
 * **Must stay identical to `brand_preferences_phrase_key`'s index expression.**
 * The database refuses a duplicate phrase; this is what decides which phrases
 * are duplicates.
 */
export function normalizePhrase(phrase: string): string {
  return phrase.trim().replace(/\s+/g, " ").toLowerCase();
}

export type ResolvedLink = {
  href: string;
  /** What decided it, or null when nothing did. */
  via: Decision;
};

/**
 * Where a line's link goes: the saved product's page when one product decides
 * it (its default or the one it names, else the top-ranked, when several do),
 * a search for a phrase's words, else a search for **the item alone**
 * (`lib/itemWords.ts`, TEC-131) — "6 cloves of garlic" links to a search for
 * "garlic cloves". A product found only by its Kroger name is unconfirmed
 * (TEC-135), so that line links to the search too.
 */
export function linkFor(name: string, decision: Decision): ResolvedLink {
  if (decision?.kind === "products" && decision.via !== "description" && decision.candidates[0]) {
    return { href: decision.candidates[0].url, via: decision };
  }
  if (decision?.kind === "terms") return { href: searchFor(decision.terms), via: decision };
  return { href: searchFor(itemWords(name) || name), via: decision };
}

// ---------------------------------------------------------------------------
// Reads and writes. A failed read throws rather than returning an empty set.
// ---------------------------------------------------------------------------

/** The search-word rows. The old `product` rows stay in the table, unread. */
export async function readPreferences(): Promise<Preference[]> {
  const { data, error } = await getServiceClient()
    .from("brand_preferences")
    .select(COLUMNS)
    .neq("kind", "product")
    .order("updated_at", { ascending: false });

  if (error) throw new LookupError(`Couldn't read your search words: ${error.message}`);
  return (data ?? []) as Preference[];
}

export type PreferenceDraft = {
  phrase: string;
  kind: "terms";
  terms: string;
  brand?: string | null;
  note?: string | null;
};

/** Validate search words into a row, or say why not, naming the phrase so a batch says which row. */
export function readDraft(raw: unknown): { row: PreferenceDraft } | { error: string } {
  const o = (raw ?? {}) as Record<string, unknown>;

  const phrase = typeof o.phrase === "string" ? o.phrase.trim().replace(/\s+/g, " ") : "";
  if (!phrase) return { error: "Search words need a phrase to match on." };

  if (o.kind === "plain") {
    return { error: `"${phrase}": plain is no longer a kind — give it search words, or save a product.` };
  }
  if (o.kind !== undefined && o.kind !== "terms") {
    return { error: `"${phrase}": a phrase row is search words; a product goes in as a product with its names.` };
  }

  const terms = typeof o.terms === "string" ? o.terms.trim().replace(/\s+/g, " ") : "";
  if (!terms) return { error: `"${phrase}": needs the words to search.` };

  const row: PreferenceDraft = { phrase, kind: "terms", terms };
  // **Only what was sent** (TEC-29 item 2): a field left out keeps the row's.
  if (typeof o.brand === "string") row.brand = o.brand.trim() || null;
  if (typeof o.note === "string") row.note = o.note.trim() || null;
  return { row };
}

/** The row holding this phrase, of any kind — the old product rows hold their phrases until the drop. */
async function holderOf(phrase: string): Promise<Preference | null> {
  const { data, error } = await getServiceClient().from("brand_preferences").select(COLUMNS);
  if (error) throw new LookupError(`Couldn't read your search words: ${error.message}`);
  const wanted = normalizePhrase(phrase);
  return ((data ?? []) as Preference[]).find((p) => normalizePhrase(p.phrase) === wanted) ?? null;
}

/**
 * Write search words, replacing any existing search words for the same
 * phrase. `refuseOverwrite` is Paste a batch's guard: a saved phrase changes
 * only when the review ticked it.
 */
export async function savePreference(draft: PreferenceDraft, options: { refuseOverwrite?: boolean } = {}): Promise<Preference> {
  const existing = await holderOf(draft.phrase);
  if (existing?.kind === "product") {
    throw new ConflictError(
      `"${draft.phrase}" is held by an old product row that is kept until a later cleanup — use a slightly different phrase.`
    );
  }
  if (existing && options.refuseOverwrite) {
    throw new ConflictError(`"${draft.phrase}" is already in Your brands — tick it in the review to replace it.`);
  }

  const payload = { ...draft, url: null, updated_at: new Date().toISOString() };
  const query = existing
    ? getServiceClient().from("brand_preferences").update(payload).eq("id", existing.id)
    : getServiceClient().from("brand_preferences").insert(payload);

  const { data, error } = await query.select(COLUMNS).single();
  if (error) throw new LookupError(`Couldn't save those search words: ${error.message}`);
  return data as Preference;
}

export async function removePreference(id: string): Promise<void> {
  const { error } = await getServiceClient().from("brand_preferences").delete().eq("id", id).neq("kind", "product");
  if (error) throw new LookupError(`Couldn't forget that one: ${error.message}`);
}
