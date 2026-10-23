import { normalizeName, readProductDraft, unionNames, type ProductDraft, type SavedProduct } from "./brands";
import { normalizePhrase, readDraft, type Preference, type PreferenceDraft } from "./preferences";

/**
 * Paste a batch and Export — **one format both ways** (TEC-131), so an export
 * pastes back in and a seed can be written by hand. The format is documented
 * in NOTES.md, *Paste a batch format*; change it there and here together.
 *
 * A batch is a JSON array. **A product row** carries `product` (its code as a
 * string; a King Soopers product page is read for its code too), `names` (a
 * list) and optionally `count`, `size_first`, `brand`, `note` and a pack
 * conversion (`pack_label`, `pack_size`, `pack_unit`). **A search-word
 * row** carries `phrase` and `terms`, and optionally `brand`, `note`.
 * `replace: true` is set only by the review, on a row ticked over a saved one.
 *
 * Pure: the preview and write routes supply the saved rows.
 */

export type BatchEntry =
  | { row: number; kind: "product"; draft: ProductDraft; replace: boolean }
  | { row: number; kind: "words"; draft: PreferenceDraft; replace: boolean };

export type BatchRefusal = { row: number; label: string | null; reason: string };

/** Read a pasted batch. **A bad row is reported, never dropped.** */
export function readBatch(raw: unknown): { entries: BatchEntry[]; refused: BatchRefusal[] } {
  const entries: BatchEntry[] = [];
  const refused: BatchRefusal[] = [];
  if (!Array.isArray(raw)) return { entries, refused: [{ row: 0, label: null, reason: "Expected a JSON array of rows." }] };

  raw.forEach((value, i) => {
    const row = i + 1;
    const o = (value ?? {}) as Record<string, unknown>;
    const replace = o.replace === true;
    const isProduct = o.product !== undefined || o.names !== undefined;
    const isWords = o.phrase !== undefined || o.terms !== undefined;

    if (isProduct && isWords) {
      refused.push({ row, label: null, reason: "A row is a product (product, names) or search words (phrase, terms), not both." });
      return;
    }
    if (isProduct) {
      const read = readProductDraft(o);
      if ("error" in read) {
        const first = Array.isArray(o.names) && typeof o.names[0] === "string" ? o.names[0] : null;
        refused.push({ row, label: first, reason: read.error });
      } else {
        entries.push({ row, kind: "product", draft: read.draft, replace });
      }
      return;
    }
    if (isWords) {
      if (o.count !== undefined) {
        refused.push({ row, label: typeof o.phrase === "string" ? o.phrase : null, reason: "A count goes with a product, not search words." });
        return;
      }
      const read = readDraft(o);
      if ("error" in read) refused.push({ row, label: typeof o.phrase === "string" ? o.phrase : null, reason: read.error });
      else entries.push({ row, kind: "words", draft: read.row, replace });
      return;
    }
    refused.push({ row, label: null, reason: "Needs product and names, or phrase and terms." });
  });
  return { entries, refused };
}

export type PreviewStatus = "new" | "updates" | "already" | "replaces" | "refused";

/** One line of the review: what would be written, and what is saved now. */
export type PreviewEntry = {
  row: number;
  kind: "product" | "words";
  label: string;
  status: PreviewStatus;
  /** For a product. */
  productId?: string;
  names?: string[];
  count?: number | null;
  sizeFirst?: string | null;
  /** For search words. */
  terms?: string;
  /** What is saved now, for `updates`, `already` and `replaces`. */
  existing?: { names?: string[]; count?: number; sizeFirst?: string | null; terms?: string | null };
  /** What ticking it changes, in words, for `updates`. */
  changes?: string[];
  reason?: string;
  /** What the client sends back to write it; `replace` is set when it changes a saved row. */
  send?: Record<string, unknown>;
};

function productRow(d: ProductDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { product: d.product_id, names: d.names };
  if (d.count !== undefined) out.count = d.count;
  if (d.size_first !== undefined && d.size_first !== null) out.size_first = d.size_first;
  if (d.brand !== undefined && d.brand !== null) out.brand = d.brand;
  if (d.note !== undefined && d.note !== null) out.note = d.note;
  if (d.pack_label) out.pack_label = d.pack_label;
  if (d.pack_size) out.pack_size = d.pack_size;
  if (d.pack_unit) out.pack_unit = d.pack_unit;
  return out;
}

function wordsRow(d: PreferenceDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { phrase: d.phrase, terms: d.terms };
  if (d.brand) out.brand = d.brand;
  if (d.note) out.note = d.note;
  return out;
}

/** What writing this draft over the saved row would change, in words. Empty when nothing would. */
export function productChanges(draft: ProductDraft, saved: SavedProduct): string[] {
  const changes: string[] = [];
  const added = unionNames(saved.names, draft.names).slice(saved.names.length);
  if (added.length > 0) changes.push(`adds ${added.map((n) => `"${n}"`).join(", ")}`);
  if (draft.count !== undefined && draft.count !== saved.count) changes.push(`count ${saved.count} → ${draft.count}`);
  if (draft.size_first && !saved.size_first) changes.push(`size first bought: ${draft.size_first}`);
  if (draft.brand !== undefined && draft.brand !== saved.brand) changes.push("brand");
  if (draft.note !== undefined && draft.note !== saved.note) changes.push("note");
  if (draft.pack_label !== undefined && draft.pack_label !== saved.pack_label) changes.push(`shopping unit: ${draft.pack_label ?? "none"}`);
  if (draft.pack_size !== undefined && (draft.pack_size !== saved.pack_size || draft.pack_unit !== saved.pack_unit)) {
    changes.push(draft.pack_size ? `pack: 1 = ${draft.pack_size} ${draft.pack_unit}` : "pack conversion removed");
  }
  return changes;
}

/**
 * **The review, before anything is written.** Every entry is placed against
 * what is saved now and against the entries above it, so a batch naming the
 * same code twice refuses the second.
 *
 * - `new`: a code (or phrase) not in Your brands. Starts ticked.
 * - `updates`: a saved code; ticking adds the batch's names to the saved ones,
 *   sets its count, and fills the size first bought only if it is empty.
 *   Starts unticked, showing what is saved.
 * - `already`: nothing would change.
 * - `replaces`: a saved phrase with other search words. Starts unticked.
 * - `refused`: cannot be written, with the reason.
 */
export function previewBatch(raw: unknown, products: SavedProduct[], words: Preference[]): PreviewEntry[] {
  const { entries, refused } = readBatch(raw);
  const out: PreviewEntry[] = refused.map((r) => ({
    row: r.row,
    kind: "product",
    label: r.label ?? `Row ${r.row}`,
    status: "refused",
    reason: r.reason,
  }));
  const seenCodes = new Set<string>();
  const seenPhrases = new Set<string>();

  for (const e of entries) {
    if (e.kind === "product") {
      const d = e.draft;
      const base: PreviewEntry = {
        row: e.row,
        kind: "product",
        label: d.names[0],
        status: "new",
        productId: d.product_id,
        names: d.names,
        count: d.count ?? null,
        sizeFirst: d.size_first ?? null,
      };
      if (seenCodes.has(d.product_id)) {
        out.push({ ...base, status: "refused", reason: `Product ${d.product_id} is twice in this batch — the first one is written. Put every name on one row.` });
        continue;
      }
      seenCodes.add(d.product_id);
      const saved = products.find((p) => p.product_id === d.product_id);
      if (!saved) {
        out.push({ ...base, send: productRow(d) });
        continue;
      }
      const changes = productChanges(d, saved);
      out.push({
        ...base,
        status: changes.length > 0 ? "updates" : "already",
        existing: { names: saved.names, count: saved.count, sizeFirst: saved.size_first },
        ...(changes.length > 0 ? { changes, send: { ...productRow(d), replace: true } } : {}),
      });
      continue;
    }

    const d = e.draft;
    const key = normalizePhrase(d.phrase);
    const base: PreviewEntry = { row: e.row, kind: "words", label: d.phrase, status: "new", terms: d.terms };
    if (seenPhrases.has(key)) {
      out.push({ ...base, status: "refused", reason: "Twice in this batch — the first one is written." });
      continue;
    }
    seenPhrases.add(key);
    const saved = words.find((w) => normalizePhrase(w.phrase) === key);
    if (!saved) {
      out.push({ ...base, send: wordsRow(d) });
      continue;
    }
    const same = saved.kind === "terms" && saved.terms === d.terms;
    out.push({
      ...base,
      status: same ? "already" : "replaces",
      existing: { terms: saved.kind === "terms" ? saved.terms : null },
      ...(same ? {} : { send: { ...wordsRow(d), replace: true } }),
    });
  }
  return out.sort((a, b) => a.row - b.row);
}

/**
 * **Export**: Your brands in the batch format. Products by first name, then
 * search words by phrase. Pasted back, every row reviews as `already`. An old
 * `plain` row exports as `"kind": "plain"`, which the review refuses by name.
 */
export function exportBatch(products: SavedProduct[], words: Preference[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const sortedProducts = [...products].sort((a, b) => normalizeName(a.names[0] ?? "").localeCompare(normalizeName(b.names[0] ?? "")));
  for (const p of sortedProducts) {
    out.push({
      product: p.product_id,
      names: p.names,
      count: p.count,
      ...(p.size_first ? { size_first: p.size_first } : {}),
      ...(p.brand ? { brand: p.brand } : {}),
      ...(p.note ? { note: p.note } : {}),
      ...(p.pack_label ? { pack_label: p.pack_label } : {}),
      ...(p.pack_size ? { pack_size: p.pack_size, pack_unit: p.pack_unit } : {}),
    });
  }
  const sortedWords = [...words].sort((a, b) => normalizePhrase(a.phrase).localeCompare(normalizePhrase(b.phrase)));
  for (const w of sortedWords) {
    const extras = { ...(w.brand ? { brand: w.brand } : {}), ...(w.note ? { note: w.note } : {}) };
    out.push(w.kind === "terms" ? { phrase: w.phrase, terms: w.terms, ...extras } : { phrase: w.phrase, kind: "plain", ...extras });
  }
  return out;
}
