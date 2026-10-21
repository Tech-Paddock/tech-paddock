import { productIdFromUrl } from "./kingsoopers";
import { isUpc, KrogerError, searchTerm, type Product } from "./kroger";
import { ConflictError } from "./errors";
import { modalityWord, type Modality } from "./modality";

/**
 * Send to cart — what each line becomes, and what happened to it (TEC-90).
 *
 * **Pure, with Kroger and the database passed in**, so every rule here is
 * tested without either. The routes in `app/api/kroger/cart` supply them.
 *
 * - **A line tied to an exact product in Your brands goes in as-is.** Its link
 *   carries the product number.
 * - **Any other line shows Kroger's top match at the chosen store**, and the user
 *   adds it or replaces it with an exact product page. **Whichever goes in, the
 *   match or the replacement, is remembered in Your brands** as an exact product
 *   under the line's name (TEC-128) — only once its add succeeded, so a failed
 *   add saves nothing. **No model picks a product.**
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

/**
 * A line the user chose: a product number (exact, or a tapped match) or a page
 * that replaces the match. **`match` is the tapped top match's page** (TEC-128),
 * sent only for a match, never for an exact brand: it is what gets remembered.
 */
export type CartPick = { id: string; upc?: string; url?: string; match?: string };

export type Outcome = {
  id: string;
  name: string;
  quantity: number;
  result: "added" | "skipped" | "failed";
  detail: string;
  /** Added, but without the Pickup/Delivery choice, because Kroger refused it (TEC-121). */
  withoutModality?: true;
  /** The product that went in, on an added line: what the send records so Take back can remove it (TEC-127). */
  upc?: string;
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
    else if (typeof o.upc === "string" && o.upc) {
      pick.upc = o.upc;
      if (typeof o.match === "string" && o.match.trim()) pick.match = o.match.trim();
    }
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
  /** Put one product in the cart, with the Pickup/Delivery choice when given; throws with a sentence when Kroger refuses. */
  add: (upc: string, quantity: number, modality: Modality | null) => Promise<void>;
  /** Remember what went in — a replacement page or the tapped match's page — in Your brands, under the line's name. */
  remember: (phrase: string, url: string) => Promise<void>;
};

/**
 * Send the chosen lines. **Every open line gets an outcome**, chosen or not.
 *
 * The repeat check runs first and adds nothing when it refuses: a send that put
 * half the list in the cart and then stopped at a warning would be the partial
 * send this exists to prevent.
 *
 * **Pickup or Delivery (TEC-121)** goes with each line. Kroger's cart may not
 * take the field (unconfirmed until the first production Send), so a line
 * refused as a bad request is **retried once without it**. If that goes in,
 * the field was the problem: the rest of the send goes without it, and every
 * line that did is marked so `modalityWarning` can say so.
 */
export async function sendLines(
  input: { open: CartLine[]; picks: CartPick[]; again: boolean; modality?: Modality | null },
  deps: SendDeps
): Promise<Outcome[]> {
  const picked = new Map(input.picks.map((p) => [p.id, p]));
  let modality = input.modality ?? null;
  let dropped = false;

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
    if (pick.url) {
      upc = productIdFromUrl(pick.url);
      if (!upc) {
        outcomes.push({ ...base, result: "failed", detail: "That isn't a King Soopers product page with a product number." });
        continue;
      }
    } else if (isUpc(pick.upc)) {
      upc = pick.upc;
    }

    if (!upc) {
      outcomes.push({ ...base, result: "skipped", detail: "No product to add." });
      continue;
    }

    // The page to remember: the replacement, else the tapped match. An exact
    // brand sends neither, so it is never re-saved.
    const page = pick.url ?? pick.match ?? null;
    const sent = { ...base, upc };

    let added: { detail: string; withoutModality?: true } | null = null;
    try {
      await deps.add(upc, line.quantity, modality);
      added = dropped
        ? { detail: `Added ×${line.quantity}, without Pickup/Delivery (Kroger refused it on an earlier line).`, withoutModality: true }
        : { detail: `Added ×${line.quantity}.` };
    } catch (e) {
      let failure = e;
      if (modality && refusedAsBadRequest(e)) {
        try {
          await deps.add(upc, line.quantity, null);
          added = { detail: `Added ×${line.quantity}, without ${modalityWord(modality)} — Kroger refused the choice.`, withoutModality: true };
          modality = null;
          dropped = true;
        } catch (retry) {
          failure = retry;
        }
      }
      if (!added) {
        // **A failed add saves nothing** in Your brands (TEC-128).
        const why = failure instanceof Error ? failure.message : "Kroger refused it.";
        outcomes.push({ ...base, result: "failed", detail: why });
        continue;
      }
    }

    // **Only after the add went in.** A failed save is said on the line and
    // never undoes or hides the add: the product is in the cart either way.
    const remembered = page ? await rememberPage(deps, line.name, page, upc) : "";
    outcomes.push({ ...sent, result: "added", ...added, detail: `${added.detail}${remembered}` });
  }
  return outcomes;
}

/**
 * Save what went in to Your brands, and say how that went, as a sentence to
 * append to the line. **The page must carry the product number that went in**:
 * a remembered page is read back as that number next time (`planLine`), so a
 * page naming a different one would send a different product.
 */
async function rememberPage(deps: SendDeps, name: string, page: string, upc: string): Promise<string> {
  if (productIdFromUrl(page) !== upc) return " Not remembered in Your brands: its page names a different product.";
  try {
    await deps.remember(name, page);
    return " Remembered in Your brands.";
  } catch (e) {
    const why = e instanceof Error && e.message ? ` (${e.message.replace(/\.$/, "")})` : "";
    return ` Couldn't remember it in Your brands${why} — save it there by hand.`;
  }
}

/** A refusal that could be the request's shape — the only kind the modality retry is for. Not sign-in, not Kroger down. */
function refusedAsBadRequest(e: unknown): boolean {
  return e instanceof KrogerError && (e.status === 400 || e.status === 422);
}

/**
 * The send-level warning when Kroger refused Pickup/Delivery, or null.
 * **Never silent**: the lines are in the cart, and the mode has to be chosen
 * at checkout instead.
 */
export function modalityWarning(outcomes: Outcome[], modality: Modality | null): string | null {
  const n = outcomes.filter((o) => o.withoutModality).length;
  if (n === 0 || !modality) return null;
  const word = modalityWord(modality);
  return `Kroger refused the ${word} choice, so ${n} line${n === 1 ? "" : "s"} went in without it — choose ${word} at checkout.`;
}

/**
 * What a send put in the cart, as ledger rows (TEC-127): each added line's
 * product, its quantity, and the mode it actually went with — none when Kroger
 * refused the choice. Take back sends exactly this back, negated.
 */
export function sentRows(
  outcomes: Outcome[],
  modality: Modality | null
): { item_id: string; name: string; kind: "sent"; upc: string; quantity: number; modality: Modality | null }[] {
  return outcomes
    .filter((o): o is Outcome & { upc: string } => o.result === "added" && typeof o.upc === "string")
    .map((o) => ({ item_id: o.id, name: o.name, kind: "sent", upc: o.upc, quantity: o.quantity, modality: o.withoutModality ? null : modality }));
}

/** "3 added, 1 skipped, 1 failed" — the sentence that never lets a partial send read as whole. */
export function summarize(outcomes: Outcome[]): string {
  const n = (r: Outcome["result"]) => outcomes.filter((o) => o.result === r).length;
  return `${n("added")} added, ${n("skipped")} skipped, ${n("failed")} failed`;
}
