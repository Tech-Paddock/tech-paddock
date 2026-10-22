import { getServiceClient } from "./supabase";
import { ConflictError, LookupError } from "./errors";
import { searchFor, type GroceryItem } from "./grocery";
import { productIdFromUrl } from "./kingsoopers";

/**
 * Remembered brands for the shopping list.
 *
 * **A line's link is a generic search until you have an opinion.** This is where
 * the opinions live: tap *milk* and land on the milk you actually buy, rather
 * than on a wall of every milk King Soopers sells.
 *
 * **Two kinds are written: `product`, a page you pasted, and `terms`, better
 * words to search.** A third, `plain` — *search this the ordinary way*, so a
 * narrow phrase could override a broad one — was dropped from the editor and
 * from Paste a batch on 2026-09-24 (TEC-39). The enum and the database
 * still hold it, and `resolveLink` still honours a row that has it, because
 * dropping a value is a destructive change that zero rows did not justify.
 *
 * **Longest match wins.** `2 cups whole milk` contains both phrases; `whole
 * milk` is longer, so it decides. That one rule is what keeps the table the size
 * of your decisions rather than the size of your vocabulary.
 *
 * **A phrase can hold several products (TEC-51)** — sizes, flavours — one row
 * each, with a count. Send to cart puts a line with one in straight away and
 * asks about a line with several (Settle these). A search-word row is still one
 * per phrase, and never shares a phrase with products.
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
  /**
   * The count (TEC-51; the `cookbook_brand_tally` migration): seeded by hand
   * from the owner's purchase history, +1 each time Send adds this product.
   * Ranks choices; never a claim of what was bought.
   */
  tally: number;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, phrase, kind, url, terms, brand, note, tally, created_at, updated_at";

/**
 * **Must stay identical to the phrase expression in the `brand_preferences`
 * unique indexes** (`cookbook_brand_tally`). The database refuses a duplicate;
 * this is what decides which phrases are duplicates. The two disagreeing means
 * a collision the database catches and the app cannot explain.
 */
export function normalizePhrase(phrase: string): string {
  return phrase.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Does this phrase appear in this line, as whole words?
 *
 * **Whole words, or `milk` matches `buttermilk`** — which is not a near miss, it
 * is a different aisle. It still matches `milk chocolate`, and that is left
 * deliberately: the fix is a longer phrase for `milk chocolate`, which is the
 * same mechanism as the rest of the feature rather than a second one.
 */
function mentions(line: string, phrase: string): boolean {
  if (!phrase) return false;
  const words = line.split(/[^a-z0-9%]+/i).filter(Boolean);
  const target = phrase.split(/[^a-z0-9%]+/i).filter(Boolean);
  if (target.length === 0 || target.length > words.length) return false;

  for (let i = 0; i + target.length <= words.length; i++) {
    let hit = true;
    for (let j = 0; j < target.length; j++) {
      if (words[i + j] !== target[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * Every saved row that could decide this line, best first (TEC-51).
 *
 * **Longest phrase first, as it always was** — `whole milk` still overrides
 * `milk` — but a phrase can now hold several products, so the answer is that
 * phrase's rows rather than one row. When two different phrases of the same
 * length both appear, the one with the most recently updated row decides,
 * because that is the one you last had an opinion about.
 *
 * Within the phrase: **products only, when it has any**, then **most counted
 * first, then most recently updated.** The count ranks; it never picks on its
 * own — Settle these asks (an automatic tie-break is TEC-51 item 5, later).
 */
export function matchCandidates(name: string, preferences: Preference[]): Preference[] {
  const line = normalizePhrase(name);
  const groups = new Map<string, Preference[]>();

  for (const preference of preferences) {
    const phrase = normalizePhrase(preference.phrase);
    if (!mentions(line, phrase)) continue;
    const group = groups.get(phrase);
    if (group) group.push(preference);
    else groups.set(phrase, [preference]);
  }

  let best: Preference[] | null = null;
  let bestPhrase = "";
  for (const [phrase, group] of groups) {
    if (
      best === null ||
      phrase.length > bestPhrase.length ||
      (phrase.length === bestPhrase.length && newest(group) > newest(best))
    ) {
      best = group;
      bestPhrase = phrase;
    }
  }
  if (!best) return [];

  const products = best.filter((p) => p.kind === "product");
  return [...(products.length > 0 ? products : best)].sort(byRank);
}

function newest(group: Preference[]): string {
  return group.reduce((at, p) => (p.updated_at > at ? p.updated_at : at), "");
}

/** Most counted first, then the most recently updated. */
export function byRank(a: Preference, b: Preference): number {
  const counted = (b.tally ?? 0) - (a.tally ?? 0);
  if (counted !== 0) return counted;
  return b.updated_at.localeCompare(a.updated_at);
}

/**
 * The one preference that decides this line, or null: the top of
 * `matchCandidates`. What the list's link, the estimate and the deal scan use;
 * Send to cart reads every candidate (`lib/decide.ts`). Pure, and the reason
 * every rule in this file is testable without a database.
 */
export function matchPreference(name: string, preferences: Preference[]): Preference | null {
  return matchCandidates(name, preferences)[0] ?? null;
}

export type ResolvedLink = {
  href: string;
  /**
   * The preference that decided it, or null when nothing did.
   *
   * The whole row, so anything on the list that wants to say which rule decided
   * a line can. Nothing on a line shows it since 2026-09-24 (TEC-39): the name
   * is the link, and remembering happens in Your brands.
   */
  via: Preference | null;
};

/**
 * Where a line's link should go.
 *
 * **A `plain` match resolves exactly as no match does** — same URL, but it says
 * so, because "I checked and you wanted the ordinary one" and "nothing matched"
 * are different facts about the same link.
 */
export function resolveLink(
  item: Pick<GroceryItem, "name">,
  preferences: Preference[]
): ResolvedLink {
  const preference = matchPreference(item.name, preferences);
  const fallback = searchFor(item.name);
  if (!preference) return { href: fallback, via: null };

  const via = preference;

  if (preference.kind === "product" && preference.url) return { href: preference.url, via };
  if (preference.kind === "terms" && preference.terms) return { href: searchFor(preference.terms), via };
  return { href: fallback, via };
}

// ---------------------------------------------------------------------------
// Reads and writes. A failed read throws rather than returning an empty set —
// no preferences and we could not look are opposite facts, and silently
// returning [] sends every line to a generic search as though you had no
// opinions at all.
// ---------------------------------------------------------------------------

export async function readPreferences(): Promise<Preference[]> {
  const { data, error } = await getServiceClient()
    .from("brand_preferences")
    .select(COLUMNS)
    .order("updated_at", { ascending: false });

  if (error) throw new LookupError(`Couldn't read your brands: ${error.message}`);
  return ((data ?? []) as Preference[]).map((p) => ({ ...p, tally: Number(p.tally) || 0 }));
}

export type PreferenceDraft = {
  phrase: string;
  kind: PreferenceKind;
  url?: string | null;
  terms?: string | null;
  brand?: string | null;
  note?: string | null;
  /** Only when sent: a field left out keeps the row's count. */
  tally?: number;
};

/**
 * Validate a draft into a row, or say why not.
 *
 * **In code rather than only in the database**, because these drafts arrive in
 * bulk from a chat that read a stack of receipts, and a constraint violation
 * halfway through an import tells you a row was wrong without telling you which
 * one or why.
 */
export function readDraft(raw: unknown): { row: PreferenceDraft } | { error: string } {
  const o = (raw ?? {}) as Record<string, unknown>;

  const phrase = typeof o.phrase === "string" ? o.phrase.trim().replace(/\s+/g, " ") : "";
  if (!phrase) return { error: "A preference needs a phrase to match on." };

  // **`plain` is no longer written** (TEC-39, 2026-09-24): only *this
  // exact product* and *better search words* remain, from the editor and from
  // Paste a batch alike. The database still accepts `plain` and `resolveLink`
  // still honours a row that has it; nothing here makes a new one.
  const kind = o.kind;
  if (kind === "plain") {
    return { error: `"${phrase}": plain is no longer a kind — use product or terms.` };
  }
  if (kind !== "product" && kind !== "terms") {
    return { error: `"${phrase}": kind must be product or terms.` };
  }

  const url = typeof o.url === "string" ? o.url.trim() : "";
  const terms = typeof o.terms === "string" ? o.terms.trim().replace(/\s+/g, " ") : "";

  if (kind === "product") {
    if (!url) return { error: `"${phrase}": a product preference needs a url.` };
    if (!/^https:\/\//i.test(url)) {
      // Not a check that the page exists — nothing here can load it. It is a
      // check that this is a link at all, because a pasted product name in the
      // url column fails as a dead tap on a phone in a shop.
      return { error: `"${phrase}": the url must start with https://.` };
    }
  }
  if (kind === "terms" && !terms) {
    return { error: `"${phrase}": a terms preference needs the words to search.` };
  }

  const row: PreferenceDraft = {
    phrase,
    kind,
    url: kind === "product" ? url : null,
    terms: kind === "terms" ? terms : null,
  };
  // **Only what was sent** (TEC-29 item 2). The editor sends no note, and a
  // missing note used to become `null` and be written — so editing a brand
  // deleted its note. A field left out now stays out of the write, and the row
  // keeps what it had; a blank string still clears it on purpose.
  if (typeof o.brand === "string") row.brand = o.brand.trim() || null;
  if (typeof o.note === "string") row.note = o.note.trim() || null;
  if (o.tally !== undefined) {
    if (typeof o.tally !== "number" || !Number.isInteger(o.tally) || o.tally < 0) {
      return { error: `"${phrase}": the count must be a whole number, 0 or more.` };
    }
    row.tally = o.tally;
  }
  return { row };
}

/** Two product rows are the same product when their pages carry the same number; failing that, the same address. */
export function sameProduct(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = productIdFromUrl(a);
  const y = productIdFromUrl(b);
  return x !== null && y !== null ? x === y : a.trim() === b.trim();
}

/** Where a draft would go: a new row, or over an existing one — and what that one is. */
export type Placement =
  | { action: "insert"; beside: number }
  | { action: "update"; existing: Preference; same: boolean }
  | { error: string };

/**
 * **Where a draft lands, decided in one place** for the editor, Send's
 * remembering, and Paste a batch (TEC-51). Pure.
 *
 * - With `id` (the editor), that row is updated, unless the change would make it
 *   a duplicate of another row, or mix products and search words in a phrase.
 * - A product: the same product under the same phrase is that row (`same`);
 *   a search-word row under the phrase is replaced by it (as before TEC-51);
 *   otherwise it is a new row, `beside` the phrase's other products.
 * - Search words: the phrase's one search-word row, or its one product row, is
 *   replaced (as before); a phrase holding several products is refused, because
 *   which one the words should replace is not this function's guess.
 *
 * `same` is what Paste a batch calls *already in Your brands*.
 */
export function placeDraft(draft: PreferenceDraft, all: Preference[], id?: string): Placement {
  const phrase = normalizePhrase(draft.phrase);
  const others = all.filter((p) => normalizePhrase(p.phrase) === phrase && p.id !== id);
  const products = others.filter((p) => p.kind === "product");
  const words = others.filter((p) => p.kind !== "product");

  if (id) {
    const existing = all.find((p) => p.id === id);
    if (!existing) return { error: "That brand is no longer in Your brands." };
    if (draft.kind === "product") {
      if (products.some((p) => sameProduct(p.url, draft.url))) {
        return { error: `"${draft.phrase}" already has that product in Your brands.` };
      }
      if (words.length > 0) return { error: `"${draft.phrase}" is already search words in Your brands — edit that one.` };
    } else if (others.length > 0) {
      return { error: `"${draft.phrase}" already has products in Your brands — forget them first, or edit one.` };
    }
    return { action: "update", existing, same: existing.kind === draft.kind && (draft.kind === "product" ? sameProduct(existing.url, draft.url) : existing.terms === draft.terms) };
  }

  if (draft.kind === "product") {
    const same = products.find((p) => sameProduct(p.url, draft.url));
    if (same) return { action: "update", existing: same, same: true };
    if (words[0]) return { action: "update", existing: words[0], same: false };
    return { action: "insert", beside: products.length };
  }

  if (words[0]) return { action: "update", existing: words[0], same: words[0].terms === draft.terms && words[0].kind === draft.kind };
  if (products.length === 1) return { action: "update", existing: products[0], same: false };
  if (products.length > 1) {
    return { error: `"${draft.phrase}" has ${products.length} products in Your brands — forget them first, or edit one.` };
  }
  return { action: "insert", beside: 0 };
}

/**
 * Write one preference.
 *
 * Where it lands is `placeDraft`. **`refuseOverwrite`** is Paste a batch's
 * guard (TEC-51): a row already in Your brands is never changed unless the
 * review ticked it, which the client says with `replace`.
 */
export async function savePreference(
  draft: PreferenceDraft,
  /** The current rows, when the caller already has them — see `importPreferences`. */
  known?: Preference[],
  options: { id?: string; refuseOverwrite?: boolean } = {}
): Promise<Preference> {
  const all = known ?? (await readPreferences());
  const placed = placeDraft(draft, all, options.id);
  if ("error" in placed) throw new ConflictError(placed.error);
  if (placed.action === "update" && options.refuseOverwrite) {
    throw new ConflictError(`"${draft.phrase}" is already in Your brands — tick it in the review to overwrite it.`);
  }

  const payload = { ...draft, updated_at: new Date().toISOString() };
  const query =
    placed.action === "update"
      ? getServiceClient().from("brand_preferences").update(payload).eq("id", placed.existing.id)
      : getServiceClient().from("brand_preferences").insert(payload);

  const { data, error } = await query.select(COLUMNS).single();
  if (error) throw new LookupError(`Couldn't save that preference: ${error.message}`);
  return { ...(data as Preference), tally: Number((data as Preference).tally) || 0 };
}

export async function removePreference(id: string): Promise<void> {
  const { error } = await getServiceClient().from("brand_preferences").delete().eq("id", id);
  if (error) throw new LookupError(`Couldn't forget that one: ${error.message}`);
}

/**
 * The counts a send moves (TEC-51): **+1 per add, on every product row whose
 * page carries that product number**, so a product saved under two phrases
 * counts on both. Pure; `bumpTallies` writes it.
 */
export function tallyBumps(all: Preference[], addedUpcs: string[]): { id: string; tally: number }[] {
  const adds = new Map<string, number>();
  for (const upc of addedUpcs) adds.set(upc, (adds.get(upc) ?? 0) + 1);
  const out: { id: string; tally: number }[] = [];
  for (const p of all) {
    if (p.kind !== "product" || !p.url) continue;
    const id = productIdFromUrl(p.url);
    const n = id ? adds.get(id) : undefined;
    if (n) out.push({ id: p.id, tally: (p.tally ?? 0) + n });
  }
  return out;
}

/**
 * Write the counts a send moved. **Read, then write**: one user, one send at a
 * time (`serial` on the list tab), so the read-modify-write race is accepted
 * rather than a database function. A failed write throws; the route says so and
 * the items stay in the cart.
 */
export async function bumpTallies(addedUpcs: string[]): Promise<void> {
  if (addedUpcs.length === 0) return;
  const bumps = tallyBumps(await readPreferences(), addedUpcs);
  for (const { id, tally } of bumps) {
    // updated_at is left alone: a count is not an opinion, and the tie-break
    // between equal-length phrases reads updated_at.
    const { error } = await getServiceClient().from("brand_preferences").update({ tally }).eq("id", id);
    if (error) throw new LookupError(`Couldn't update the counts in Your brands: ${error.message}`);
  }
}

export type ImportOutcome = { saved: number; rejected: { row: number; reason: string }[] };

/**
 * Write the rows a Paste a batch review ticked (TEC-51; format in NOTES.md,
 * parsed by `lib/brandBatch.ts`).
 *
 * **Every row is validated before any row is written, and a bad row is reported
 * rather than dropped.** A silent skip in a seed of forty is how you find out in
 * the shop that the one you cared about never landed.
 *
 * **Nothing already in Your brands is overwritten unless its entry says
 * `replace: true`** — the review's tick. Without it the row is reported, not
 * written.
 *
 * **A row that fails at the database is reported the same way, and the rest of
 * the batch still lands.** Throwing halfway would leave an unknown number of
 * rows written behind an error that names none of them.
 *
 * The table is read once, not once per row. Later rows see earlier ones through
 * `known`, so a batch containing the same row twice updates rather than
 * colliding with itself.
 */
export async function importPreferences(
  drafts: { row: number; draft: PreferenceDraft; replace: boolean }[],
  rejected: { row: number; reason: string }[] = []
): Promise<ImportOutcome> {
  const known = drafts.length > 0 ? await readPreferences() : [];
  let saved = 0;
  const out = [...rejected];

  for (const { row, draft, replace } of drafts) {
    try {
      const written = await savePreference(draft, known, { refuseOverwrite: !replace });
      const at = known.findIndex((p) => p.id === written.id);
      if (at === -1) known.push(written);
      else known[at] = written;
      saved++;
    } catch (e) {
      out.push({ row, reason: e instanceof Error ? e.message : "The database refused it." });
    }
  }

  return { saved, rejected: out.sort((a, b) => a.row - b.row) };
}
