import { productIdFromUrl } from "./kingsoopers";
import { isUpc, searchTerm, type Product } from "./kroger";
import { ConflictError } from "./errors";

/**
 * Send to cart — what each line becomes, and what happened to it (TEC-90).
 *
 * **Pure, with Kroger and the database passed in**, so every rule here is
 * tested without either. The routes in `app/api/kroger/cart` supply them.
 *
 * - **A line tied to an exact product in Your brands goes in as-is.** Its link
 *   carries the product number.
 * - **Any other line shows Kroger's top match at the chosen store**, and Joel
 *   adds it or replaces it with an exact product page — which is then remembered
 *   in Your brands. **No model picks a product.**
 * - **Every open line reports added, skipped or failed**, so a partial send never
 *   reads as a whole one.
 * - **A line already sent is refused without an explicit "again"**: the Cart API
 *   only adds, so a silent repeat doubles the quantity.
 */

export type CartLine = {
  id: string;
  name: string;
  note: string | null;
  quantity: number;
  sent_at: string | null;
};

/** The preference that decides a line, reduced to what the cart cares about. */
export type Decision = {
  phrase: string;
  kind: "product" | "terms" | "plain";
  url: string | null;
  terms: string | null;
  /** The last refresh found Kroger no longer returns this product. It still goes in as-is; the review says so. */
  missing?: boolean;
} | null;

export type Plan =
  | { kind: "exact"; upc: string; url: string; phrase: string; missing: boolean }
  | { kind: "match"; product: Product }
  | { kind: "none"; reason: string };

export type ReviewLine = CartLine & { plan: Plan };

/** What one line becomes, before anyone taps anything. */
export async function planLine(
  line: CartLine,
  decide: (name: string) => Decision,
  search: (term: string) => Promise<Product | null>
): Promise<Plan> {
  const preference = decide(line.name);

  if (preference?.kind === "product" && preference.url) {
    const upc = productIdFromUrl(preference.url);
    if (upc) return { kind: "exact", upc, url: preference.url, phrase: preference.phrase, missing: !!preference.missing };
    // A remembered page with no product number in it falls through to a search
    // rather than being guessed at.
  }

  const words = preference?.kind === "terms" && preference.terms ? preference.terms : line.name;
  const term = searchTerm(words);
  if (!term) return { kind: "none", reason: "Too short for Kroger's search — paste the exact product." };

  try {
    const product = await search(term);
    return product ? { kind: "match", product } : { kind: "none", reason: "Kroger has no match at your store." };
  } catch (e) {
    return { kind: "none", reason: e instanceof Error ? e.message : "Kroger's search failed." };
  }
}

/**
 * Every open line's plan. **Four searches at a time** — a list of thirty would
 * otherwise be thirty requests at once against a daily limit.
 */
export async function reviewLines(
  lines: CartLine[],
  decide: (name: string) => Decision,
  search: (term: string) => Promise<Product | null>
): Promise<ReviewLine[]> {
  const out: ReviewLine[] = new Array(lines.length);
  let next = 0;
  async function worker() {
    while (next < lines.length) {
      const i = next++;
      out[i] = { ...lines[i], plan: await planLine(lines[i], decide, search) };
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, lines.length) }, worker));
  return out;
}

/** The lines already sent, oldest send first — what the warning shows. */
export function alreadySent(lines: CartLine[]): CartLine[] {
  return lines
    .filter((l) => l.sent_at !== null)
    .sort((a, b) => (a.sent_at as string).localeCompare(b.sent_at as string));
}

/** A line Joel chose: a product number (exact, or a tapped match) or a page that replaces the match. */
export type CartPick = { id: string; upc?: string; url?: string };

export type Outcome = {
  id: string;
  name: string;
  quantity: number;
  result: "added" | "skipped" | "failed";
  detail: string;
};

/**
 * Refused before anything is added: these lines went to the cart already.
 * **409, carrying the lines**, so the screen can show what was sent and when.
 */
export class RepeatSendError extends ConflictError {
  constructor(public lines: CartLine[]) {
    super(
      `Already sent: ${lines.map((l) => l.name).join(", ")}. The cart only adds, so sending these again doubles them.`
    );
    this.name = "RepeatSendError";
  }
}

/** Read a send request's picks; anything malformed is dropped, and that line then reports skipped. */
export function readPicks(raw: unknown): CartPick[] {
  if (!Array.isArray(raw)) return [];
  const picks: CartPick[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || seen.has(o.id)) continue;
    seen.add(o.id);
    const pick: CartPick = { id: o.id };
    if (typeof o.url === "string" && o.url.trim()) pick.url = o.url.trim();
    else if (typeof o.upc === "string" && o.upc) pick.upc = o.upc;
    picks.push(pick);
  }
  return picks;
}

/** The picked lines that already went to the cart — what a send without "again" refuses. */
export function repeatsIn(open: CartLine[], picks: CartPick[]): CartLine[] {
  const ids = new Set(picks.map((p) => p.id));
  return alreadySent(open.filter((l) => ids.has(l.id)));
}

export type SendDeps = {
  /** Put one product in the cart; throws with a sentence when Kroger refuses. */
  add: (upc: string, quantity: number) => Promise<void>;
  /** Remember a replacement page in Your brands, under the line's name. */
  remember: (phrase: string, url: string) => Promise<void>;
};

/**
 * Send the chosen lines. **Every open line gets an outcome**, chosen or not.
 *
 * The repeat check runs first and adds nothing when it refuses: a send that put
 * half the list in the cart and then stopped at a warning would be the partial
 * send this exists to prevent.
 */
export async function sendLines(
  input: { open: CartLine[]; picks: CartPick[]; again: boolean },
  deps: SendDeps
): Promise<Outcome[]> {
  const picked = new Map(input.picks.map((p) => [p.id, p]));

  if (!input.again) {
    const repeats = repeatsIn(input.open, input.picks);
    if (repeats.length > 0) throw new RepeatSendError(repeats);
  }

  const outcomes: Outcome[] = [];
  for (const line of input.open) {
    const base = { id: line.id, name: line.name, quantity: line.quantity };
    const pick = picked.get(line.id);
    if (!pick) {
      outcomes.push({ ...base, result: "skipped", detail: "Left out." });
      continue;
    }

    let upc: string | null = null;
    let remembered = "";
    if (pick.url) {
      upc = productIdFromUrl(pick.url);
      if (!upc) {
        outcomes.push({ ...base, result: "failed", detail: "That isn't a King Soopers product page with a product number." });
        continue;
      }
      try {
        await deps.remember(line.name, pick.url);
        remembered = " Remembered in Your brands.";
      } catch {
        remembered = " Couldn't remember it in Your brands.";
      }
    } else if (isUpc(pick.upc)) {
      upc = pick.upc;
    }

    if (!upc) {
      outcomes.push({ ...base, result: "skipped", detail: "No product to add." });
      continue;
    }

    try {
      await deps.add(upc, line.quantity);
      outcomes.push({ ...base, result: "added", detail: `Added ×${line.quantity}.${remembered}` });
    } catch (e) {
      const why = e instanceof Error ? e.message : "Kroger refused it.";
      outcomes.push({ ...base, result: "failed", detail: `${why}${remembered}` });
    }
  }
  return outcomes;
}

/** "3 added, 1 skipped, 1 failed" — the sentence that never lets a partial send read as whole. */
export function summarize(outcomes: Outcome[]): string {
  const n = (r: Outcome["result"]) => outcomes.filter((o) => o.result === r).length;
  return `${n("added")} added, ${n("skipped")} skipped, ${n("failed")} failed`;
}
