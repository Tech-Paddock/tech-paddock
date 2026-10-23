import { getServiceClient } from "./supabase";
import { ConflictError, LookupError } from "./errors";
import { pageFor } from "./kingsoopers";
import {
  cleanName,
  countBumps,
  defaultPatches,
  keptDefaults,
  placeProduct,
  rememberPlacement,
  successorPatch,
  unionNames,
  type ProductDraft,
  type SavedProduct,
  type Successor,
} from "./brands";

/**
 * `cookbook.products` (TEC-131; reasoning in the `cookbook_products`
 * migration). Reads and writes only; the rules are `lib/brands.ts`. A failed
 * read throws rather than returning [] — "no brands" and "could not look" are
 * opposite facts.
 */

const COLUMNS =
  "id, product_id, names, count, size_first, brand, note, description, kroger_brand, size, url, price, in_stock, checked_at, missing_since, successor, pack_label, pack_size, pack_unit, default_for, created_at, updated_at";

function hydrate(r: Record<string, unknown>): SavedProduct {
  return {
    ...(r as unknown as SavedProduct),
    names: Array.isArray(r.names) ? (r.names as string[]) : [],
    count: Number(r.count) || 0,
    // numeric comes back as a string from PostgREST.
    price: r.price === null || r.price === undefined ? null : Number(r.price),
    successor: r.successor && typeof r.successor === "object" ? (r.successor as Successor) : null,
    pack_size: r.pack_size === null || r.pack_size === undefined ? null : Number(r.pack_size),
    default_for: Array.isArray(r.default_for) ? (r.default_for as string[]) : [],
  };
}

export async function readProducts(): Promise<SavedProduct[]> {
  const { data, error } = await getServiceClient().from("products").select(COLUMNS).order("updated_at", { ascending: false });
  if (error) throw new LookupError(`Couldn't read your brands: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(hydrate);
}

/** The columns a draft writes. A field the draft leaves out is left alone. */
function payload(draft: ProductDraft, existing: SavedProduct | null, mode: "edit" | "merge"): Record<string, unknown> {
  const out: Record<string, unknown> = { product_id: draft.product_id, updated_at: new Date().toISOString() };
  // The editor's names are the whole list; a batch adds to what is saved.
  out.names = mode === "merge" && existing ? unionNames(existing.names, draft.names) : draft.names;
  // **A removed name takes its default with it** (TEC-135).
  if (existing && (existing.default_for ?? []).length > 0) out.default_for = keptDefaults(existing.default_for, out.names as string[]);
  if (draft.count !== undefined) out.count = draft.count;
  if (draft.size_first !== undefined) {
    // **A batch never overwrites the size first bought**; the editor can correct it.
    out.size_first = mode === "merge" && existing?.size_first ? existing.size_first : draft.size_first;
  }
  if (draft.brand !== undefined) out.brand = draft.brand;
  if (draft.note !== undefined) out.note = draft.note;
  if (draft.pack_label !== undefined) out.pack_label = draft.pack_label;
  if (draft.pack_size !== undefined) out.pack_size = draft.pack_size;
  if (draft.pack_unit !== undefined) out.pack_unit = draft.pack_unit;
  const codeChanged = existing && existing.product_id !== draft.product_id;
  if (!existing || codeChanged) {
    out.url = draft.url ?? pageFor(draft.product_id, draft.names[0]);
  } else if (draft.url) {
    out.url = draft.url;
  }
  if (codeChanged) {
    // A different product: what Kroger said about the old code no longer applies.
    Object.assign(out, { description: null, kroger_brand: null, size: null, price: null, in_stock: null, checked_at: null, missing_since: null, successor: null });
  }
  return out;
}

/**
 * Write one product. `id` edits that row (the editor). `mode: "merge"` is a
 * batch: names are added to the saved ones, and `refuseOverwrite` refuses a
 * saved code the review did not tick.
 */
export async function saveProduct(
  draft: ProductDraft,
  options: { id?: string; known?: SavedProduct[]; mode?: "edit" | "merge"; refuseOverwrite?: boolean } = {}
): Promise<SavedProduct> {
  const all = options.known ?? (await readProducts());
  const placed = placeProduct(draft, all, options.id);
  if ("error" in placed) throw new ConflictError(placed.error);
  if (placed.action === "update" && options.refuseOverwrite) {
    throw new ConflictError(`"${draft.names[0]}" is already in Your brands — tick it in the review to update it.`);
  }
  const mode = options.mode ?? (options.id ? "edit" : "merge");
  const existing = placed.action === "update" ? placed.existing : null;
  const row = payload(draft, existing, mode);
  const query = existing
    ? getServiceClient().from("products").update(row).eq("id", existing.id)
    : getServiceClient().from("products").insert(row);
  const { data, error } = await query.select(COLUMNS).single();
  if (error) throw new LookupError(`Couldn't save that product: ${error.message}`);
  return hydrate(data as Record<string, unknown>);
}

export async function removeProduct(id: string): Promise<void> {
  const { error } = await getServiceClient().from("products").delete().eq("id", id);
  if (error) throw new LookupError(`Couldn't forget that one: ${error.message}`);
}

/**
 * Remember what went in for a line (`RULES.md`, *Send to cart*): its name on
 * that product, or a new product row. `page` is the page that went in; `size`
 * is the size Kroger showed for it, when known, kept as the size first bought.
 */
export async function rememberProduct(name: string, upc: string, page: string, size: string | null = null): Promise<void> {
  const all = await readProducts();
  const placed = rememberPlacement(all, name, upc);
  if (placed.action === "none") return;
  if (placed.action === "add-name") {
    const { error } = await getServiceClient()
      .from("products")
      .update({ names: placed.names, updated_at: new Date().toISOString() })
      .eq("id", placed.id);
    if (error) throw new LookupError(`Couldn't add the name: ${error.message}`);
    return;
  }
  const { error } = await getServiceClient()
    .from("products")
    .insert({ product_id: upc, names: [cleanName(name)], url: page, size_first: size });
  if (error) throw new LookupError(`Couldn't save the product: ${error.message}`);
}

/**
 * **Make default** (TEC-135; `RULES.md`, *Send to cart*): the product with
 * this code becomes the one default for each name, and every other row gives
 * those names up — cleared first, so a failure part-way leaves no default
 * rather than two. One user, one tap at a time, like `bumpCounts`.
 */
export async function setDefault(names: string[], upc: string, known?: SavedProduct[]): Promise<void> {
  const all = known ?? (await readProducts());
  const result = defaultPatches(all, names, upc);
  if ("error" in result) throw new ConflictError(result.error);
  const target = all.find((p) => p.product_id === upc);
  const ordered = [...result.patches].sort((a, b) => Number(a.id === target?.id) - Number(b.id === target?.id));
  for (const { id, default_for } of ordered) {
    const { error } = await getServiceClient().from("products").update({ default_for }).eq("id", id);
    if (error) throw new LookupError(`Couldn't save the default: ${error.message}`);
  }
}

/**
 * +1 on each product a send put in. **Read, then write**: one user, one send
 * at a time (`serial` on the list tab), so the race is accepted rather than a
 * database function. `updated_at` is left alone: a count is not an edit.
 */
export async function bumpCounts(addedUpcs: string[]): Promise<void> {
  if (addedUpcs.length === 0) return;
  for (const { id, count } of countBumps(await readProducts(), addedUpcs)) {
    const { error } = await getServiceClient().from("products").update({ count }).eq("id", id);
    if (error) throw new LookupError(`Couldn't update the counts in Your brands: ${error.message}`);
  }
}

/** What a refresh writes on one row: Kroger's fields only. */
export type CachePatch = Pick<
  SavedProduct,
  "description" | "kroger_brand" | "size" | "url" | "price" | "in_stock" | "checked_at" | "missing_since" | "successor"
> & { size_first?: string };

export async function writeCache(id: string, patch: CachePatch): Promise<void> {
  const { error } = await getServiceClient().from("products").update(patch).eq("id", id);
  if (error) throw new LookupError(`Couldn't save what Kroger said: ${error.message}`);
}

/** Replace a product with its successor, on the user's tap. Names, count and size first bought stay. */
export async function replaceWithSuccessor(id: string): Promise<SavedProduct> {
  const all = await readProducts();
  const product = all.find((p) => p.id === id);
  if (!product) throw new ConflictError("That product is no longer in Your brands.");
  const result = successorPatch(product, all);
  if ("error" in result) throw new ConflictError(result.error);
  const { data, error } = await getServiceClient()
    .from("products")
    .update({ ...result.patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw new LookupError(`Couldn't replace it: ${error.message}`);
  return hydrate(data as Record<string, unknown>);
}
