/**
 * **In cart mirrors the List** (TEC-227): the pieces the browser reads. No imports, so a client
 * file can use them without pulling in Kroger or the database (`lib/mirror.ts` resolves the rows).
 */

export type MirrorRow =
  | { id: string; state: "product"; upc: string; label: string; size: string | null; price: number | null }
  | { id: string; state: "pick-one" }
  | { id: string; state: "unknown" };

/**
 * The In cart section's two kinds of row. **Live** is what Cookbook sent (`sent_at`): the only rows
 * the In cart count and total include. **Grey** is every unsent, unticked List line, mirrored. A
 * line is in one kind, never both; sending it sets `sent_at` and moves it from grey to live.
 */
export function cartSplit<T extends { sent_at: string | null; checked: boolean }>(items: T[]): { live: T[]; grey: T[] } {
  return {
    live: items.filter((i) => i.sent_at !== null),
    grey: items.filter((i) => i.sent_at === null && !i.checked),
  };
}

/** "Coke Zero 12 oz": a product's name and its size, once. The size is left out when the name already says it. */
export function productWords(label: string, size: string | null): string {
  const name = label.trim();
  const s = size?.trim();
  if (!s || name.toLowerCase().includes(s.toLowerCase())) return name;
  return `${name} ${s}`;
}

/**
 * What a grey row reads: the exact product, "<word> — pick one" when there is no clear match, or
 * the plain word when it could not be worked out. `word` is the List line as it reads.
 */
export function greyWords(word: string, row: MirrorRow | null | undefined): string {
  if (!row || row.state === "unknown") return word;
  if (row.state === "pick-one") return `${word} — pick one`;
  return productWords(row.label, row.size);
}

/**
 * What a grey row's price is: the line's nightly total when it has one, else the product's price
 * times how many. Null is "no price yet", never $0. Kept apart from the cart total.
 */
export function greyTotal(row: MirrorRow | null | undefined, quantity: number, nightly: number | null): number | null {
  if (nightly !== null) return nightly;
  return row?.state === "product" && row.price !== null ? Math.round(row.price * quantity * 100) / 100 : null;
}
