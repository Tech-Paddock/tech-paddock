import { getServiceClient } from "./supabase";
import { LookupError } from "./errors";
import { searchFor, type GroceryItem } from "./grocery";

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
 * from Paste a batch by Joel on 2026-09-24 (TEC-39). The enum and the database
 * still hold it, and `resolveLink` still honours a row that has it, because
 * dropping a value is a destructive change that zero rows did not justify.
 *
 * **Longest match wins.** `2 cups whole milk` contains both phrases; `whole
 * milk` is longer, so it decides. That one rule is what keeps the table the size
 * of your decisions rather than the size of your vocabulary.
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
 * are duplicates. The two disagreeing means a collision the database catches and
 * the app cannot explain.
 */
export function normalizePhrase(phrase: string): string {
  return phrase.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Does this phrase appear in this line, as whole words?
 *
 * **Whole words, or `milk` matches `buttermilk`** — which is not a near miss, it
 * is a different aisle. It still matches `milk chocolate`, and that is left
 * deliberately: the fix is a `plain` row for `milk chocolate`, which is the same
 * mechanism as the rest of the feature rather than a second one.
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
 * The preference that decides this line, or null.
 *
 * Longest phrase first; **the most recently updated row breaks a tie**, because
 * that is the one you last had an opinion about. Pure, and the reason every
 * rule in this file is testable without a database.
 */
export function matchPreference(name: string, preferences: Preference[]): Preference | null {
  const line = normalizePhrase(name);

  let best: Preference | null = null;
  let bestLength = 0;

  for (const preference of preferences) {
    const phrase = normalizePhrase(preference.phrase);
    if (!mentions(line, phrase)) continue;

    if (
      phrase.length > bestLength ||
      (phrase.length === bestLength && best !== null && preference.updated_at > best.updated_at)
    ) {
      best = preference;
      bestLength = phrase.length;
    }
  }

  return best;
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
  return (data ?? []) as Preference[];
}

export type PreferenceDraft = {
  phrase: string;
  kind: PreferenceKind;
  url?: string | null;
  terms?: string | null;
  brand?: string | null;
  note?: string | null;
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

  // **`plain` is no longer written** (Joel, 2026-09-24, TEC-39): only *this
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
  return { row };
}

/**
 * Write one preference, replacing any existing row for the same phrase.
 *
 * **Upsert on the normalised phrase, not insert-then-catch**, because unlike a
 * recipe name a second opinion about milk is a correction rather than a mistake.
 */
export async function savePreference(
  draft: PreferenceDraft,
  /** The current rows, when the caller already has them — see `importPreferences`. */
  known?: Preference[]
): Promise<Preference> {
  const wanted = normalizePhrase(draft.phrase);
  const all = known ?? (await readPreferences());
  const existing = all.find((p) => normalizePhrase(p.phrase) === wanted) ?? null;

  const payload = { ...draft, updated_at: new Date().toISOString() };
  const query = existing
    ? getServiceClient().from("brand_preferences").update(payload).eq("id", existing.id)
    : getServiceClient().from("brand_preferences").insert(payload);

  const { data, error } = await query.select(COLUMNS).single();
  if (error) throw new LookupError(`Couldn't save that preference: ${error.message}`);
  return data as Preference;
}

export async function removePreference(id: string): Promise<void> {
  const { error } = await getServiceClient().from("brand_preferences").delete().eq("id", id);
  if (error) throw new LookupError(`Couldn't forget that one: ${error.message}`);
}

export type ImportOutcome = { saved: number; rejected: { row: number; reason: string }[] };

/**
 * Take a batch of drafts — the handoff from a receipts session.
 *
 * **Every row is validated before any row is written, and a bad row is reported
 * rather than dropped.** A silent skip in a seed of forty is how you find out in
 * the shop that the one you cared about never landed.
 *
 * **A row that fails at the database is reported the same way, and the rest of
 * the batch still lands.** Throwing halfway would leave an unknown number of
 * rows written behind an error that names none of them, which is worse than a
 * partial import you can read.
 *
 * The table is read once, not once per row. Later rows see earlier ones through
 * `known`, so a batch containing the same phrase twice updates rather than
 * colliding with itself.
 */
export async function importPreferences(rows: unknown[]): Promise<ImportOutcome> {
  const drafts: { row: number; draft: PreferenceDraft }[] = [];
  const rejected: { row: number; reason: string }[] = [];

  rows.forEach((raw, i) => {
    const read = readDraft(raw);
    if ("error" in read) rejected.push({ row: i + 1, reason: read.error });
    else drafts.push({ row: i + 1, draft: read.row });
  });

  const known = drafts.length > 0 ? await readPreferences() : [];
  let saved = 0;

  for (const { row, draft } of drafts) {
    try {
      const written = await savePreference(draft, known);
      const at = known.findIndex((p) => p.id === written.id);
      if (at === -1) known.push(written);
      else known[at] = written;
      saved++;
    } catch (e) {
      rejected.push({ row, reason: e instanceof Error ? e.message : "The database refused it." });
    }
  }

  return { saved, rejected };
}
