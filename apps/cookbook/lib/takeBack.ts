import type { Modality } from "./modality";

/**
 * Take back — remove from the King Soopers cart what Cookbook sent (TEC-127;
 * `RULES.md`, *Send to cart*).
 *
 * Kroger's public Cart API only adds. Take back sends **the same products with
 * negative quantities**, then marks those lines unsent. **Pure, with Kroger and
 * the database passed in**; the route is `app/api/kroger/cart/take-back`.
 *
 * - **What was sent, not what the line says now.** The ledger
 *   (`cookbook.cart_sends`, reasoning in its migration) holds each product,
 *   quantity and Pickup/Delivery choice a send put in. The line's quantity may
 *   have changed since, its product re-picked, or it was sent "again".
 * - **Only lines still on the list.** A cleared line may have been bought, and
 *   nothing here claims to know.
 * - **Reserve, then ask Kroger.** The negative rows are written first, so a
 *   failed write after Kroger has removed something can never make a second
 *   Take back remove it again — that would take the shopper's own items. A
 *   refusal appends a reversing row.
 * - **Negative quantities are unconfirmed with Kroger.** A refusal fails that
 *   line, it stays marked sent, and the screen offers the cart page. Nothing is
 *   retried without Pickup/Delivery: the product is taken back the way it went in.
 * - **Every line Cookbook sent reports taken back, skipped or failed**, and the
 *   summary never says the cart is empty.
 *
 * No imports but a type, because the browser reads these types.
 */

export type SendKind = "sent" | "taken_back" | "refused";

/** One ledger row, as the database holds it. */
export type SendRow = {
  item_id: string | null;
  name: string;
  kind: SendKind;
  upc: string;
  quantity: number;
  modality: Modality | null;
};

/** What Cookbook still has in the cart for one line: one product, one mode. */
export type Held = { upc: string; quantity: number; modality: Modality | null };

/** The list line, reduced to what Take back reads. */
export type ListLine = { id: string; name: string; sent_at: string | null };

export type TakeBackLine = ListLine & { held: Held[] };

export type TakeBackOutcome = {
  id: string;
  name: string;
  result: "taken back" | "skipped" | "failed";
  detail: string;
};

function key(upc: string, modality: Modality | null): string {
  return `${upc}|${modality ?? ""}`;
}

/**
 * What is still held per line: the ledger summed by product and mode, **only
 * what is above zero**, in the order each product was first sent.
 */
export function heldByLine(rows: SendRow[]): Map<string, Held[]> {
  const sums = new Map<string, Map<string, Held>>();
  for (const row of rows) {
    if (!row.item_id) continue;
    const line = sums.get(row.item_id) ?? new Map<string, Held>();
    sums.set(row.item_id, line);
    const k = key(row.upc, row.modality);
    const held = line.get(k) ?? { upc: row.upc, quantity: 0, modality: row.modality };
    held.quantity += row.quantity;
    line.set(k, held);
  }
  const out = new Map<string, Held[]>();
  for (const [id, line] of sums) {
    const held = [...line.values()].filter((h) => h.quantity > 0);
    if (held.length > 0) out.set(id, held);
  }
  return out;
}

/**
 * The lines Take back acts on: every line on the list that Cookbook sent —
 * with something still held, or marked sent with nothing recorded (sent before
 * the ledger existed, which is skipped and said).
 */
export function takeBackLines(list: ListLine[], rows: SendRow[]): TakeBackLine[] {
  const held = heldByLine(rows);
  return list
    .map((l) => ({ id: l.id, name: l.name, sent_at: l.sent_at, held: held.get(l.id) ?? [] }))
    .filter((l) => l.held.length > 0 || l.sent_at !== null);
}

/** "×2", or "×2 + ×1" for a line sent as two products. */
export function describe(held: Held[]): string {
  return held.map((h) => `×${h.quantity}`).join(" + ");
}

export type TakeBackDeps = {
  /** Append the negative rows for these, before Kroger is asked. Throws when the database refuses. */
  reserve: (line: TakeBackLine, held: Held[]) => Promise<void>;
  /** Kroger: the same product, the same mode, a negative quantity. Throws with a sentence when Kroger refuses. */
  remove: (upc: string, quantity: number, modality: Modality | null) => Promise<void>;
  /** Append the reversing rows for what Kroger refused. */
  refused: (line: TakeBackLine, held: Held[]) => Promise<void>;
};

/**
 * Take back every line given. Returns an outcome per line, and the ids now
 * wholly taken back — **only those** are marked unsent.
 */
export async function takeBack(
  lines: TakeBackLine[],
  deps: TakeBackDeps
): Promise<{ outcomes: TakeBackOutcome[]; unsent: string[] }> {
  const outcomes: TakeBackOutcome[] = [];
  const unsent: string[] = [];

  for (const line of lines) {
    const base = { id: line.id, name: line.name };

    if (line.held.length === 0) {
      outcomes.push({
        ...base,
        result: "skipped",
        detail: "Sent before Cookbook recorded what went in, so it can't say what to take back. Remove it on the King Soopers cart page.",
      });
      continue;
    }

    try {
      await deps.reserve(line, line.held);
    } catch {
      outcomes.push({
        ...base,
        result: "failed",
        detail: "Couldn't record the take-back first, so Kroger wasn't asked. Still in the cart.",
      });
      continue;
    }

    const done: Held[] = [];
    const refusals: { held: Held; why: string }[] = [];
    for (const held of line.held) {
      try {
        await deps.remove(held.upc, held.quantity, held.modality);
        done.push(held);
      } catch (e) {
        refusals.push({ held, why: e instanceof Error ? e.message : "Kroger refused it." });
      }
    }

    if (refusals.length === 0) {
      unsent.push(line.id);
      outcomes.push({ ...base, result: "taken back", detail: `Took back ${describe(done)}.` });
      continue;
    }

    let record = "";
    try {
      await deps.refused(line, refusals.map((r) => r.held));
    } catch {
      record = " This app couldn't record the refusal, so it now reads as taken back — check the cart page.";
    }
    const took = done.length > 0 ? `Took back ${describe(done)}, but not ${describe(refusals.map((r) => r.held))}: ` : "";
    outcomes.push({
      ...base,
      result: "failed",
      detail: `${took}${refusals[0].why} Still marked sent — remove it on the King Soopers cart page.${record}`,
    });
  }

  return { outcomes, unsent };
}

/**
 * "2 taken back, 1 skipped, 1 failed." **Never "the cart is empty"**: anything
 * added to the cart elsewhere is still there, and the sentence says so.
 */
export function summarizeTakeBack(outcomes: TakeBackOutcome[]): string {
  const n = (r: TakeBackOutcome["result"]) => outcomes.filter((o) => o.result === r).length;
  return `${n("taken back")} taken back, ${n("skipped")} skipped, ${n("failed")} failed. Anything added to the cart elsewhere is still there.`;
}
