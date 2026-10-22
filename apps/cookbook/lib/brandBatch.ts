import { productIdFromUrl } from "./kingsoopers";
import { productPage } from "./kroger";
import { byRank, normalizePhrase, placeDraft, readDraft, type Preference, type PreferenceDraft } from "./preferences";

/**
 * Paste a batch and Export — **one format both ways** (TEC-51), so an export
 * pastes back in, and a TD helper or the weekly Chrome task (TEC-126) can write
 * a seed by hand. The format is documented in NOTES.md, *Paste a batch format*;
 * change it there and here together.
 *
 * A batch is a JSON array. Each row is one phrase:
 *
 * - `phrase` — required; what has to appear in a list line.
 * - `product` — a King Soopers product page (`https://www.kingsoopers.com/p/<slug>/<digits>`)
 *   or the bare product number (8–14 digits). `url` is accepted as the older name.
 * - `terms` — search words instead of a product. A row has `product` or `terms`, never both.
 * - `count` — the product's starting count, a whole number ≥ 0 (default 0 on a new row).
 * - `alternatives` — other products for the same phrase (sizes, flavours), each
 *   `{ "product": …, "count": … }`, each becoming its own row that Settle these offers.
 * - `brand`, `note` — optional text, kept on the row (on alternatives too).
 * - `kind` — optional: `product` or `terms`. `plain` is refused.
 * - `replace` — true only on a row the review ticked over an existing one.
 *
 * Pure: the preview route and the write route supply the rows.
 */

export type BatchEntry = {
  /** The batch row this came from, 1-based; alternatives share their row's number. */
  row: number;
  draft: PreferenceDraft;
  replace: boolean;
};

export type BatchRefusal = { row: number; phrase: string | null; reason: string };

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * A product field as a page this app can send: a product page with its number,
 * or a bare number turned into one (`/p/<phrase>/<number>`, the shape
 * `productIdFromUrl` reads back; the refresh fills in Kroger's own page).
 */
function productUrl(value: unknown, phrase: string): { url: string } | { error: string } {
  const v = typeof value === "number" ? String(value) : text(value);
  if (!v) return { error: "needs a product (a King Soopers product page or its number)" };
  if (/^\d{8,14}$/.test(v)) return { url: productPage(v, phrase, null) };
  if (productIdFromUrl(v)) return { url: v };
  return { error: `"${v}" isn't a King Soopers product page with its number, or a product number` };
}

function count(value: unknown): { tally?: number } | { error: string } {
  if (value === undefined || value === null) return {};
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return { error: "count must be a whole number, 0 or more" };
  }
  return { tally: value };
}

/** One product under a phrase, as a draft — the main one or an alternative. */
function productDraft(phrase: string, o: Record<string, unknown>): { draft: PreferenceDraft } | { error: string } {
  const page = productUrl(o.product ?? o.url, phrase);
  if ("error" in page) return page;
  const n = count(o.count);
  if ("error" in n) return n;
  const read = readDraft({ phrase, kind: "product", url: page.url, brand: o.brand, note: o.note, tally: n.tally });
  if ("error" in read) return read;
  return { draft: read.row };
}

/**
 * Expand a pasted batch into one draft per product, and name every row it
 * cannot read. **A bad row is reported, never dropped**, and an alternative
 * that fails is reported on its own without losing its row's others.
 */
export function readBatch(raw: unknown): { entries: BatchEntry[]; refused: BatchRefusal[] } {
  const entries: BatchEntry[] = [];
  const refused: BatchRefusal[] = [];
  if (!Array.isArray(raw)) return { entries, refused: [{ row: 0, phrase: null, reason: "Expected a JSON array of rows." }] };

  raw.forEach((value, i) => {
    const row = i + 1;
    const o = (value ?? {}) as Record<string, unknown>;
    const phrase = text(o.phrase).replace(/\s+/g, " ");
    const replace = o.replace === true;
    const refuse = (reason: string) => refused.push({ row, phrase: phrase || null, reason });

    if (!phrase) return refuse("A row needs a phrase to match on.");
    if (o.kind === "plain") return refuse(`"${phrase}": plain is no longer a kind — use product or terms.`);
    if (o.kind !== undefined && o.kind !== "product" && o.kind !== "terms") {
      return refuse(`"${phrase}": kind must be product or terms.`);
    }

    const hasProduct = o.product !== undefined || o.url !== undefined;
    const isTerms = o.kind === "terms" || (o.kind === undefined && !hasProduct && o.terms !== undefined);

    if (isTerms) {
      if (hasProduct) return refuse(`"${phrase}": a row is a product or search words, not both.`);
      if (o.count !== undefined || o.alternatives !== undefined) {
        return refuse(`"${phrase}": a count and alternatives go with products, not search words.`);
      }
      const read = readDraft({ phrase, kind: "terms", terms: o.terms, brand: o.brand, note: o.note });
      if ("error" in read) return refuse(read.error);
      entries.push({ row, draft: read.row, replace });
      return;
    }

    if (o.terms !== undefined && hasProduct) return refuse(`"${phrase}": a row is a product or search words, not both.`);
    const main = productDraft(phrase, o);
    if ("error" in main) refuse(`"${phrase}": ${main.error.replace(/^"[^"]*": /, "")}`);
    else entries.push({ row, draft: main.draft, replace });

    if (o.alternatives === undefined) return;
    if (!Array.isArray(o.alternatives)) return refuse(`"${phrase}": alternatives must be a list.`);
    for (const alt of o.alternatives) {
      const a = (alt ?? {}) as Record<string, unknown>;
      const read = productDraft(phrase, a);
      if ("error" in read) refuse(`"${phrase}" (alternative): ${read.error.replace(/^"[^"]*": /, "")}`);
      else entries.push({ row, draft: read.draft, replace: a.replace === true || replace });
    }
  });

  return { entries, refused };
}

export type PreviewStatus = "new" | "adds" | "already" | "replaces" | "refused";

/** One line of the review: what would be written, and what is there now. */
export type PreviewEntry = {
  row: number;
  phrase: string;
  kind: "product" | "terms";
  url: string | null;
  productId: string | null;
  terms: string | null;
  /** The count it would write; null when it sends none. */
  count: number | null;
  brand: string | null;
  note: string | null;
  status: PreviewStatus;
  /** For `adds`, how many products the phrase already has. */
  beside?: number;
  /** For `already` and `replaces`, the row there now. */
  existing?: { kind: string; url: string | null; terms: string | null; count: number };
  reason?: string;
  /** What the client sends back to write it, with `replace` set when ticked over an existing row. */
  send?: Record<string, unknown>;
};

/** The flat batch row that writes exactly this draft — what a ticked review entry sends. */
export function draftAsRow(draft: PreferenceDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { phrase: draft.phrase };
  if (draft.kind === "product") out.product = draft.url;
  else out.terms = draft.terms;
  if (draft.tally !== undefined) out.count = draft.tally;
  if (draft.brand !== undefined) out.brand = draft.brand;
  if (draft.note !== undefined) out.note = draft.note;
  return out;
}

/**
 * **The review, before anything is written** (TEC-51). Every entry is placed
 * against what is saved now and against the entries above it, so a batch that
 * names the same product twice shows the second as already there.
 *
 * - `new` — a phrase not in Your brands.
 * - `adds` — another product beside the phrase's saved ones.
 * - `already` — this phrase and product (or these words) are saved; ticking
 *   it writes the batch's count, brand and note over the row's.
 * - `replaces` — the phrase is saved as something else (search words, or one
 *   product being replaced by words); ticking it overwrites that row.
 * - `refused` — cannot be written, with the reason.
 */
export function previewBatch(raw: unknown, saved: Preference[]): PreviewEntry[] {
  const { entries, refused } = readBatch(raw);
  const known: Preference[] = [...saved];
  const out: PreviewEntry[] = refused.map((r) => ({
    row: r.row,
    phrase: r.phrase ?? "",
    kind: "product",
    url: null,
    productId: null,
    terms: null,
    count: null,
    brand: null,
    note: null,
    status: "refused",
    reason: r.reason,
  }));

  entries.forEach(({ row, draft }, i) => {
    const base: PreviewEntry = {
      row,
      phrase: draft.phrase,
      kind: draft.kind === "terms" ? "terms" : "product",
      url: draft.url ?? null,
      productId: draft.url ? productIdFromUrl(draft.url) : null,
      terms: draft.terms ?? null,
      count: draft.tally ?? null,
      brand: draft.brand ?? null,
      note: draft.note ?? null,
      status: "new",
    };
    const placed = placeDraft(draft, known);
    if ("error" in placed) {
      out.push({ ...base, status: "refused", reason: placed.error });
      return;
    }

    if (placed.action === "update") {
      const e = placed.existing;
      const dupInBatch = !saved.some((p) => p.id === e.id);
      if (dupInBatch) {
        out.push({ ...base, status: "refused", reason: "Twice in this batch — the first one is written." });
        return;
      }
      out.push({
        ...base,
        status: placed.same ? "already" : "replaces",
        existing: { kind: e.kind, url: e.url, terms: e.terms, count: e.tally ?? 0 },
        send: { ...draftAsRow(draft), replace: true },
      });
      return;
    }

    out.push({
      ...base,
      status: placed.beside > 0 ? "adds" : "new",
      ...(placed.beside > 0 ? { beside: placed.beside } : {}),
      send: draftAsRow(draft),
    });
    // Later entries see this one, so a repeat in the batch is caught.
    known.push({
      id: `batch-${i}`,
      phrase: draft.phrase,
      kind: draft.kind,
      url: draft.url ?? null,
      terms: draft.terms ?? null,
      brand: draft.brand ?? null,
      note: draft.note ?? null,
      tally: draft.tally ?? 0,
      created_at: "",
      updated_at: "",
    });
  });

  return out.sort((a, b) => a.row - b.row);
}

/**
 * **Export**: every row of Your brands in the batch format, grouped by phrase
 * (alphabetical), the most counted product first and the rest as
 * alternatives. Pasting it back reviews as all *already in Your brands*.
 *
 * A `plain` row (from before TEC-39) is exported as `"kind": "plain"` so the
 * file holds every row, and the review refuses it on the way back in, by name.
 */
export function exportBatch(saved: Preference[]): Record<string, unknown>[] {
  const groups = new Map<string, Preference[]>();
  for (const p of saved) {
    const key = normalizePhrase(p.phrase);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const extras = (p: Preference) => ({
    ...(p.brand ? { brand: p.brand } : {}),
    ...(p.note ? { note: p.note } : {}),
  });

  const out: Record<string, unknown>[] = [];
  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key) as Preference[];
    const products = group.filter((p) => p.kind === "product" && p.url).sort(byRank);
    const words = group.filter((p) => p.kind !== "product");

    if (products.length > 0) {
      const [main, ...rest] = products;
      out.push({
        phrase: main.phrase,
        product: main.url,
        count: main.tally ?? 0,
        ...extras(main),
        ...(rest.length > 0
          ? { alternatives: rest.map((p) => ({ product: p.url, count: p.tally ?? 0, ...extras(p) })) }
          : {}),
      });
    }
    for (const w of words) {
      out.push(w.kind === "terms" ? { phrase: w.phrase, terms: w.terms, ...extras(w) } : { phrase: w.phrase, kind: "plain", ...extras(w) });
    }
  }
  return out;
}
