import { pageFor, productIdFromUrl } from "./kingsoopers";
import { itemInName, itemWords } from "./itemWords";

/**
 * Your brands, one row per King Soopers product code (TEC-131; `RULES.md`,
 * *Storage* and *Send to cart*). **Pure**: no database, no Kroger, so every
 * rule here is tested without either. `lib/productStore.ts` reads and writes
 * `cookbook.products`; `lib/preferences.ts` still holds the search-word rows.
 *
 * **How a list line finds its products**, in order:
 * 1. **A line that is a product code** (8–14 digits) is that exact product.
 * 2. **Saved names**, as whole words, longest first: `whole milk` overrides
 *    `milk`. Every product carrying the longest matching name is a candidate,
 *    so a name on several products is *Settle these*. A search-word row whose
 *    phrase is longer decides instead; on the same length, products win.
 * 3. **Only when no name matched**, the item alone (`lib/itemWords.ts`) against
 *    each saved product's official Kroger name, as whole words.
 *
 * Candidates are ranked **most counted first, then most recently updated**.
 * The count ranks; it never claims what was bought.
 */

export type Successor = {
  product_id: string;
  description: string;
  size: string | null;
  url: string;
  price: number | null;
};

export type SavedProduct = {
  id: string;
  product_id: string;
  names: string[];
  count: number;
  size_first: string | null;
  brand: string | null;
  note: string | null;
  description: string | null;
  kroger_brand: string | null;
  size: string | null;
  url: string | null;
  price: number | null;
  in_stock: boolean | null;
  checked_at: string | null;
  missing_since: string | null;
  successor: Successor | null;
  /** The pack conversion (TEC-131): the shopping-unit label, and how many of a recipe unit one holds. */
  pack_label: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  created_at: string;
  updated_at: string;
};

/** A search-word row from `brand_preferences`, as far as matching cares. */
export type WordRow = {
  id: string;
  phrase: string;
  kind: "product" | "terms" | "plain";
  terms: string | null;
  updated_at: string;
};

/** One saved product a line could go in as. `id` is null for a code typed on the list that is not saved. */
export type Candidate = {
  id: string | null;
  upc: string;
  url: string;
  count: number;
  missing: boolean;
  description: string | null;
  size: string | null;
  sizeFirst: string | null;
  price: number | null;
  names: string[];
  /** The pack conversion, when the product has one (`lib/lineView.ts`). */
  pack?: { label: string | null; size: number | null; unit: string | null };
};

/** What decides a line. One copy, for the cart review, the estimate, the deal scan and the list's links. */
export type Decision =
  | { kind: "products"; via: "code" | "name" | "description"; name: string; candidates: Candidate[] }
  | { kind: "terms"; phrase: string; terms: string }
  | { kind: "plain"; phrase: string }
  | null;

/** Trim, collapse spaces, lowercase. The same expression as the old phrase index. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A name as stored: trimmed, spaces collapsed, case kept. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Does this name appear in this line, as whole words? **Whole words, or `milk`
 * matches `buttermilk`**, which is a different aisle.
 */
export function mentions(line: string, name: string): boolean {
  const words = normalizeName(line).split(/[^a-z0-9%]+/i).filter(Boolean);
  const target = normalizeName(name).split(/[^a-z0-9%]+/i).filter(Boolean);
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

/** Most counted first, then the most recently updated. */
export function byRank(a: Pick<SavedProduct, "count" | "updated_at">, b: Pick<SavedProduct, "count" | "updated_at">): number {
  const counted = (b.count ?? 0) - (a.count ?? 0);
  if (counted !== 0) return counted;
  return b.updated_at.localeCompare(a.updated_at);
}

/** A product's page: Kroger's, or one built from its code. */
export function pageOf(p: Pick<SavedProduct, "product_id" | "url" | "names" | "description">): string {
  return p.url && productIdFromUrl(p.url) === p.product_id ? p.url : pageFor(p.product_id, p.description ?? p.names[0] ?? p.product_id);
}

export function candidateOf(p: SavedProduct): Candidate {
  return {
    id: p.id,
    upc: p.product_id,
    url: pageOf(p),
    count: p.count ?? 0,
    missing: !!p.missing_since,
    description: p.description,
    size: p.size,
    sizeFirst: p.size_first,
    price: p.price,
    names: p.names,
    pack: { label: p.pack_label ?? null, size: p.pack_size ?? null, unit: p.pack_unit ?? null },
  };
}

/** The longest saved name of this product that the line mentions, or 0. */
function longestName(line: string, p: SavedProduct): number {
  let best = 0;
  for (const name of p.names) {
    const n = normalizeName(name);
    if (n.length > best && mentions(line, n)) best = n.length;
  }
  return best;
}

/** What decides this line. See the header for the order. */
export function decide(line: string, products: SavedProduct[], words: WordRow[]): Decision {
  const name = cleanName(line);

  // 1. A product code typed as the line.
  if (/^\d{8,14}$/.test(name)) {
    const saved = products.find((p) => p.product_id === name);
    const candidate: Candidate = saved
      ? candidateOf(saved)
      : { id: null, upc: name, url: pageFor(name, name), count: 0, missing: false, description: null, size: null, sizeFirst: null, price: null, names: [] };
    return { kind: "products", via: "code", name, candidates: [candidate] };
  }

  // 2. Saved names and search-word phrases, longest first.
  let best = 0;
  let hits: SavedProduct[] = [];
  for (const p of products) {
    const length = longestName(name, p);
    if (length === 0) continue;
    if (length > best) {
      best = length;
      hits = [p];
    } else if (length === best) {
      hits.push(p);
    }
  }

  let word: WordRow | null = null;
  let wordLength = 0;
  for (const w of words) {
    if (w.kind === "product") continue;
    const phrase = normalizeName(w.phrase);
    if (!mentions(name, phrase)) continue;
    if (phrase.length > wordLength || (phrase.length === wordLength && word !== null && w.updated_at > word.updated_at)) {
      word = w;
      wordLength = phrase.length;
    }
  }

  if (word && wordLength > best) {
    return word.kind === "terms" && word.terms ? { kind: "terms", phrase: word.phrase, terms: word.terms } : { kind: "plain", phrase: word.phrase };
  }
  if (hits.length > 0) {
    return { kind: "products", via: "name", name, candidates: [...hits].sort(byRank).map(candidateOf) };
  }

  // 3. The item alone against each product's official Kroger name.
  const item = itemWords(name);
  if (item) {
    const named = products.filter((p) => p.description && itemInName(item, p.description));
    if (named.length > 0) {
      return { kind: "products", via: "description", name, candidates: [...named].sort(byRank).map(candidateOf) };
    }
  }
  return null;
}

/** `decide`, bound to the rows. */
export function decider(products: SavedProduct[], words: WordRow[]): (name: string) => Decision {
  return (name) => decide(name, products, words);
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * Names from a field: a list, or one comma-separated string (the editor's
 * field). Trimmed, spaces collapsed, **duplicates dropped ignoring case**, the
 * first spelling kept.
 */
export function readNames(raw: unknown): string[] | { error: string } {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : null;
  if (!parts) return { error: "names must be a list of words" };
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") return { error: "every name must be text" };
    const name = cleanName(part);
    if (!name) continue;
    if (name.length > 120) return { error: `"${name.slice(0, 20)}…" is too long for a name` };
    if (!out.some((n) => normalizeName(n) === normalizeName(name))) out.push(name);
  }
  if (out.length === 0) return { error: "needs at least one name" };
  return out;
}

/** `a`, then whatever of `b` is not already in it, ignoring case. */
export function unionNames(a: string[], b: string[]): string[] {
  const out = [...a];
  for (const name of b) {
    if (!out.some((n) => normalizeName(n) === normalizeName(name))) out.push(name);
  }
  return out;
}

/** A product field as a code: the code itself, or a King Soopers product page's digits. */
export function codeOf(raw: unknown): string | { error: string } {
  if (typeof raw === "number") return { error: "the product code must be text in quotes — a number loses its leading zeros" };
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return { error: "needs a product (its code, or its King Soopers page)" };
  if (/^\d{8,14}$/.test(v)) return v;
  const fromPage = productIdFromUrl(v);
  if (fromPage) return fromPage;
  return { error: `"${v.slice(0, 60)}" isn't a product code (8–14 digits) or a King Soopers product page` };
}

function optionalText(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  return typeof raw === "string" ? raw.trim() || null : undefined;
}

/** A product as the editor or a batch writes it. A field left out keeps the row's value. */
export type ProductDraft = {
  product_id: string;
  names: string[];
  /** The page that came with it, when one did. */
  url?: string;
  count?: number;
  size_first?: string | null;
  brand?: string | null;
  note?: string | null;
  pack_label?: string | null;
  pack_size?: number | null;
  pack_unit?: string | null;
};

/**
 * Validate a product into a draft, or say why not. Takes `product` (a code or
 * a page), `names` (a list or a comma-separated string), and optionally
 * `count`, `size_first`, `brand`, `note`, and the pack conversion
 * `pack_label`, `pack_size`, `pack_unit` (size and unit together, or neither).
 */
export function readProductDraft(raw: unknown): { draft: ProductDraft } | { error: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const names = readNames(o.names);
  const label = Array.isArray(names) ? `"${names[0]}": ` : "";
  if (!Array.isArray(names)) return { error: names.error[0].toUpperCase() + names.error.slice(1) + "." };
  const code = codeOf(o.product);
  if (typeof code !== "string") return { error: `${label}${code.error}.` };

  const draft: ProductDraft = { product_id: code, names };
  if (typeof o.product === "string" && productIdFromUrl(o.product.trim()) === code) draft.url = o.product.trim();
  if (o.count !== undefined) {
    if (typeof o.count !== "number" || !Number.isInteger(o.count) || o.count < 0) {
      return { error: `${label}count must be a whole number, 0 or more.` };
    }
    draft.count = o.count;
  }
  const size = optionalText(o.size_first);
  if (size !== undefined) draft.size_first = size;
  const brand = optionalText(o.brand);
  if (brand !== undefined) draft.brand = brand;
  const note = optionalText(o.note);
  if (note !== undefined) draft.note = note;

  const packLabel = optionalText(o.pack_label);
  if (packLabel !== undefined) draft.pack_label = packLabel;
  const unit = optionalText(o.pack_unit);
  let packSize: number | null | undefined;
  if (o.pack_size === null || o.pack_size === "") packSize = null;
  else if (o.pack_size !== undefined) {
    const n = typeof o.pack_size === "string" ? Number(o.pack_size) : o.pack_size;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return { error: `${label}pack_size must be a number above 0.` };
    packSize = n;
  }
  if (packSize !== undefined || unit !== undefined) {
    if (((packSize ?? null) === null) !== ((unit ?? null) === null)) {
      return { error: `${label}a pack conversion needs both pack_size and pack_unit (1 head = 10 cloves), or neither.` };
    }
    draft.pack_size = packSize ?? null;
    draft.pack_unit = unit ?? null;
  }
  return { draft };
}

/** Where a product draft lands: a new row, over its own row, or refused. */
export type Placement = { action: "insert" } | { action: "update"; existing: SavedProduct } | { error: string };

/**
 * **A product code is never saved twice.** With `id` (the editor), that row
 * is updated unless the new code belongs to another row. Without, a code
 * already saved is that row.
 */
export function placeProduct(draft: ProductDraft, all: SavedProduct[], id?: string): Placement {
  const holder = all.find((p) => p.product_id === draft.product_id) ?? null;
  if (id) {
    const existing = all.find((p) => p.id === id);
    if (!existing) return { error: "That product is no longer in Your brands." };
    if (holder && holder.id !== id) {
      return { error: `That product is already in Your brands, as "${holder.names[0]}" — add these names there instead.` };
    }
    return { action: "update", existing };
  }
  return holder ? { action: "update", existing: holder } : { action: "insert" };
}

/**
 * What remembering a line does (`RULES.md`, *Send to cart*): **the line's name
 * is added to that product's names, or a new product row is made.** Nothing
 * when the product already carries the name.
 */
export function rememberPlacement(
  all: SavedProduct[],
  name: string,
  upc: string
): { action: "none"; id: string } | { action: "add-name"; id: string; names: string[] } | { action: "insert" } {
  const existing = all.find((p) => p.product_id === upc);
  if (!existing) return { action: "insert" };
  const names = unionNames(existing.names, [cleanName(name)]);
  return names.length === existing.names.length ? { action: "none", id: existing.id } : { action: "add-name", id: existing.id, names };
}

/** The counts a send moves: **+1 per add**, on the row with that code. */
export function countBumps(all: SavedProduct[], addedUpcs: string[]): { id: string; count: number }[] {
  const adds = new Map<string, number>();
  for (const upc of addedUpcs) adds.set(upc, (adds.get(upc) ?? 0) + 1);
  return all.flatMap((p) => {
    const n = adds.get(p.product_id);
    return n ? [{ id: p.id, count: (p.count ?? 0) + n }] : [];
  });
}

/**
 * Replacing a product with the successor the refresh offered (`RULES.md`).
 * **Keeps the names, the count and the size first bought** — so a smaller
 * successor shows as drift — and clears what Kroger said about the old code.
 * Refused when there is no successor, or its code is already saved.
 */
export function successorPatch(product: SavedProduct, all: SavedProduct[]): { patch: Partial<SavedProduct> } | { error: string } {
  const s = product.successor;
  if (!s) return { error: "Kroger offered no successor for that one. Edit it with a new product page instead." };
  const holder = all.find((p) => p.product_id === s.product_id && p.id !== product.id);
  if (holder) return { error: `That product is already in Your brands, as "${holder.names[0]}".` };
  return {
    patch: {
      product_id: s.product_id,
      url: s.url,
      description: s.description,
      size: s.size,
      price: s.price,
      in_stock: null,
      missing_since: null,
      successor: null,
      checked_at: null,
    },
  };
}
