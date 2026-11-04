import type { Candidate, CartLine, CartPick, Plan, ReviewLine } from "./cart";

/**
 * Send with no review, and the one picker that stays (TEC-206; owner,
 * 2026-11-02: "Best guess, in it goes").
 *
 * **Pure; the browser runs it.** A line goes in as its best guess, with no list
 * to read first:
 * - one saved product, the name's default, or (TEC-214) the pack that fits the
 *   amount, else the most purchased: that product;
 * - still a tie: the first the plan lists (most counted);
 * - nothing saved: **Kroger's top match** for the item.
 * A line with nothing to add is still sent along with no product, so the server
 * reports it ("No product to add.") rather than losing it. No model runs.
 *
 * What goes in is remembered by the same route as before (its name joins that
 * product's names, or a new product row is made).
 */

/** The pick a line goes in as, or `{ id }` when there is no product to add. */
export function guessPick(line: Pick<ReviewLine, "id" | "plan">): CartPick {
  const plan = line.plan;
  if (plan.kind === "exact") return { id: line.id, upc: plan.upc };
  if (plan.kind === "settle") {
    const [first] = plan.options;
    return first ? { id: line.id, upc: first.upc, match: first.url } : { id: line.id };
  }
  if (plan.kind === "match") {
    const p = plan.product;
    return { id: line.id, upc: p.upc, match: p.url, ...(p.size ? { size: p.size } : {}) };
  }
  return { id: line.id };
}

/** Best guesses for every line still on the List; a line already in the cart is never offered again. */
export function guessPicks(lines: ReviewLine[]): CartPick[] {
  return lines.filter((l) => l.sent_at === null).map(guessPick);
}

/** One product a picker offers, whatever kind of plan it came from. */
export type PickerOption = {
  upc: string;
  /** The product's page, remembered when it goes in as a pick. */
  url: string;
  label: string;
  detail: string;
  count: number;
  isDefault: boolean;
  /** Sent beside a match, so a product new to Your brands is saved with the size first bought. */
  size: string | null;
  /** True for Kroger's own match, not a saved product. */
  fresh: boolean;
};

function money(n: number | null): string | null {
  return n === null ? null : `$${n.toFixed(2)}`;
}

function fromCandidate(o: Candidate): PickerOption {
  return {
    upc: o.upc,
    url: o.url,
    label: o.description ?? o.names[0] ?? `Product ${o.upc}`,
    detail: [o.size, money(o.price)].filter(Boolean).join(" · "),
    count: o.count,
    isDefault: o.isDefault === true,
    size: o.size,
    fresh: false,
  };
}

/** The choices a line offers: its saved products, or Kroger's match alone. Empty when nothing can be added. */
export function pickerOptions(plan: Plan): PickerOption[] {
  if (plan.kind === "exact" || plan.kind === "settle") return plan.options.map(fromCandidate);
  if (plan.kind === "match") {
    const p = plan.product;
    return [
      {
        upc: p.upc,
        url: p.url,
        label: p.description,
        detail: [p.size, money(p.price)].filter(Boolean).join(" · "),
        count: 0,
        isDefault: false,
        size: p.size,
        fresh: true,
      },
    ];
  }
  return [];
}

/**
 * **The one picker that stays** (owner): Add an item opens a choice of products
 * when several match and none is the default, which is exactly a `settle` plan.
 */
export function needsSplash(plan: Plan): boolean {
  return plan.kind === "settle" && plan.options.length > 1;
}

/** The pick a tapped option sends. **Never a default** (TEC-214): only Your brands' Make default sets one. */
export function pickOf(line: Pick<CartLine, "id"> & { plan: Plan }, option: PickerOption): CartPick {
  const plan = line.plan;
  if (plan.kind === "exact" && option.upc === plan.upc) return { id: line.id, upc: option.upc };
  return { id: line.id, upc: option.upc, match: option.url, ...(option.fresh && option.size ? { size: option.size } : {}) };
}

// ---------------------------------------------------------------------------
// The confirms: one "Are you sure?", a count, never a list
//
// **Adds never ask** (TEC-211; owner, 2026-11-02: "No confirmation. I clicked it,
// it goes."): + Cart and Send all to cart go at once, so they are not here.
// Taking out, tidying and clearing keep their one confirm.
// ---------------------------------------------------------------------------

export type ConfirmKind = "clear-cart" | "tidy" | "clear-ticked" | "clear-all";

function items(n: number): string {
  return `${n} item${n === 1 ? "" : "s"}`;
}

function lines(n: number): string {
  return `${n} line${n === 1 ? "" : "s"}`;
}

/** The question and the button, for a count. No names: the owner does not want to read a list (TEC-206). */
export function confirmWords(kind: ConfirmKind, n: number): { ask: string; yes: string } {
  switch (kind) {
    case "clear-cart":
      return { ask: `Clear the cart? ${items(n)} leave Cookbook, not King Soopers.`, yes: "Clear cart" };
    case "tidy":
      return { ask: `Tidy ${lines(n)}?`, yes: "Tidy" };
    case "clear-ticked":
      return { ask: `Clear ${n} ticked?`, yes: "Clear ticked" };
    case "clear-all":
      return { ask: `Clear all ${n}?`, yes: "Clear all" };
  }
}
