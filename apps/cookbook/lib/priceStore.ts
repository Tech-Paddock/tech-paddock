import { getServiceClient } from "./supabase";
import { LookupError } from "./errors";
import type { NightRow, WeekRow } from "./priceWeeks";

/**
 * `cookbook.price_nights` and `cookbook.price_weeks` (TEC-132; reasoning in
 * their migrations). Reads and writes only; the rules are `lib/priceWeeks.ts`
 * and `lib/priceRun.ts`. **Both tables are insert only**: a conflict is
 * ignored, never updated, so a rerun on the same night, or the same Monday,
 * changes nothing. A failed read throws rather than returning []: "no prices"
 * and "could not look" are opposite facts.
 */

const NIGHT_COLUMNS = "product_id, location_id, night, regular, sale, in_stock, aisle";
const WEEK_COLUMNS = "product_id, location_id, week_start, low, high, mean, regular_mean, nights_on_sale, nights_seen";

/** PostgREST caps a response; ask for pages until one comes back short. */
const PAGE = 1000;

async function readAll(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new LookupError(`Couldn't read ${what}: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// numeric can come back as a string from PostgREST.
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function hydrateNight(r: Record<string, unknown>): NightRow {
  return {
    product_id: String(r.product_id),
    location_id: String(r.location_id),
    night: String(r.night),
    regular: num(r.regular),
    sale: num(r.sale),
    in_stock: typeof r.in_stock === "boolean" ? r.in_stock : null,
    aisle: typeof r.aisle === "string" && r.aisle ? r.aisle : null,
  };
}

function hydrateWeek(r: Record<string, unknown>): WeekRow {
  return {
    product_id: String(r.product_id),
    location_id: String(r.location_id),
    week_start: String(r.week_start),
    low: Number(r.low),
    high: Number(r.high),
    mean: Number(r.mean),
    regular_mean: num(r.regular_mean),
    nights_on_sale: Number(r.nights_on_sale) || 0,
    nights_seen: Number(r.nights_seen) || 0,
  };
}

/**
 * Append a night's rows. **`on conflict do nothing`**: a product already
 * recorded for that store and night keeps its first reading. Returns how many
 * rows were actually written, so a rerun reports 0.
 */
export async function insertNights(rows: NightRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await getServiceClient()
    .from("price_nights")
    .upsert(rows, { onConflict: "product_id,location_id,night", ignoreDuplicates: true })
    .select("product_id");
  if (error) throw new LookupError(`Couldn't save tonight's prices: ${error.message}`);
  return (data ?? []).length;
}

/** Append a week's roll-up rows, ignoring any already there. Returns how many were written. */
export async function insertWeeks(rows: WeekRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await getServiceClient()
    .from("price_weeks")
    .upsert(rows, { onConflict: "product_id,location_id,week_start", ignoreDuplicates: true })
    .select("product_id");
  if (error) throw new LookupError(`Couldn't save the week's roll-up: ${error.message}`);
  return (data ?? []).length;
}

/** Every store's nights from `from` to `to`, both dates inclusive. */
export async function readNightsBetween(from: string, to: string): Promise<NightRow[]> {
  const rows = await readAll("the nightly prices", (a, b) =>
    getServiceClient()
      .from("price_nights")
      .select(NIGHT_COLUMNS)
      .gte("night", from)
      .lte("night", to)
      .order("night", { ascending: true })
      .order("product_id", { ascending: true })
      .range(a, b)
  );
  return rows.map(hydrateNight);
}

/** One store's weeks from `from` on. */
export async function readWeeksSince(locationId: string, from: string): Promise<WeekRow[]> {
  const rows = await readAll("the weekly prices", (a, b) =>
    getServiceClient()
      .from("price_weeks")
      .select(WEEK_COLUMNS)
      .eq("location_id", locationId)
      .gte("week_start", from)
      .order("week_start", { ascending: true })
      .order("product_id", { ascending: true })
      .range(a, b)
  );
  return rows.map(hydrateWeek);
}

/** The Mondays from `from` on that have at least one roll-up row, at any store. */
export async function readRolledWeeks(from: string): Promise<Set<string>> {
  const rows = await readAll("the weekly prices", (a, b) =>
    getServiceClient().from("price_weeks").select("week_start").gte("week_start", from).order("week_start", { ascending: true }).range(a, b)
  );
  return new Set(rows.map((r) => String(r.week_start)));
}

/**
 * When the nightly check first and last recorded anything at this store (TEC-190):
 * the Deals tab says when it last ran. Null before the first night. `recordedAt`
 * is when the last night's first row was written.
 */
export async function readNightSpan(locationId: string): Promise<{ first: string; last: string; recordedAt: string | null } | null> {
  const edge = async (ascending: boolean) => {
    const { data, error } = await getServiceClient()
      .from("price_nights")
      .select("night, recorded_at")
      .eq("location_id", locationId)
      .order("night", { ascending })
      .order("recorded_at", { ascending })
      .limit(1);
    if (error) throw new LookupError(`Couldn't read when prices were last checked: ${error.message}`);
    return (data ?? [])[0] as { night: string; recorded_at: string | null } | undefined;
  };
  const [first, last] = await Promise.all([edge(true), edge(false)]);
  if (!first || !last) return null;
  return { first: String(first.night), last: String(last.night), recordedAt: typeof last.recorded_at === "string" ? last.recorded_at : null };
}

/** One store's nights from `from` on (the Deals tab reads the last few). */
export async function readNightsSince(locationId: string, from: string): Promise<NightRow[]> {
  const rows = await readAll("the nightly prices", (a, b) =>
    getServiceClient()
      .from("price_nights")
      .select(NIGHT_COLUMNS)
      .eq("location_id", locationId)
      .gte("night", from)
      .order("night", { ascending: true })
      .order("product_id", { ascending: true })
      .range(a, b)
  );
  return rows.map(hydrateNight);
}
