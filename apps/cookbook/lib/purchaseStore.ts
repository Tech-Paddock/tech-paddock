import { getServiceClient } from "./supabase";
import { LookupError } from "./errors";
import { readProducts } from "./productStore";
import { matcher, parsePurchases, summary, tally, toRows, type Bought, type ImportResult } from "./purchases";

/**
 * `cookbook.purchases` (TEC-213; reasoning in the `cookbook_purchases`
 * migration). **Insert only**: a conflict on (order_ref, line_key) is ignored,
 * so a re-paste of an order adds nothing. Nothing here updates or deletes.
 */

const CHUNK = 500;
const PAGE = 1000;

/** Write a pasted batch. Unmatched lines are kept with a null product. */
export async function importPurchases(pasted: string): Promise<ImportResult> {
  const { lines, skipped } = parsePurchases(pasted);
  if (lines.length === 0) return summary(0, 0, 0, skipped);
  const orders = new Set(lines.map((l) => l.order_ref)).size;
  const rows = toRows(lines, matcher(await readProducts()));

  let imported = 0;
  let matched = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await getServiceClient()
      .from("purchases")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "order_ref,line_key", ignoreDuplicates: true })
      .select("product_id");
    if (error) throw new LookupError(`Couldn't save the purchases: ${error.message}`);
    const added = (data ?? []) as { product_id: string | null }[];
    imported += added.length;
    matched += added.filter((r) => r.product_id !== null).length;
  }
  return summary(imported, orders, matched, skipped);
}

/**
 * Purchases per saved product over the last `weeks` weeks (TEC-214 reads this):
 * distinct orders, quantity and the last order's date, keyed by the products
 * row's `id`. A product not bought in the window is absent.
 */
export async function purchasesPerProduct(weeks: number, now: Date = new Date()): Promise<Map<string, Bought>> {
  const today = now.toISOString().slice(0, 10);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - weeks * 7);
  const since = from.toISOString().slice(0, 10);
  const rows: { product_id: string | null; order_ref: string; ordered_on: string; quantity: number }[] = [];
  for (let a = 0; ; a += PAGE) {
    const { data, error } = await getServiceClient()
      .from("purchases")
      .select("product_id, order_ref, ordered_on, quantity")
      .not("product_id", "is", null)
      .gte("ordered_on", since)
      .lte("ordered_on", today)
      .order("ordered_on", { ascending: false })
      .order("id", { ascending: true })
      .range(a, a + PAGE - 1);
    if (error) throw new LookupError(`Couldn't read the purchases: ${error.message}`);
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return tally(rows, weeks, today);
}
