import { productIdFromUrl } from "./kingsoopers";
import { isUpc, KrogerError, searchTerm, type Product } from "./kroger";
import { ConflictError } from "./errors";
import { modalityWord, type Modality } from "./modality";
import { itemWords } from "./itemWords";
import { bagOf, readAs } from "./lineView";
import type { Candidate, Decision } from "./brands";

/**
 * Send to cart — what each line becomes, and what happened to it (TEC-90).
 *
 * **Pure, with Kroger and the database passed in**, so every rule here is
 * tested without either. The routes in `app/api/kroger/cart` supply them.
 *
 * Three sections, one list (TEC-135; `RULES.md`, *Send to cart*):
 * - **Going in** (`exact`): a line that matches one product in Your brands
 *   (by its code or its saved names), its name's default, or a saved product
 *   the line names. Its other options stay a tap away.
 * - **Pick one** (`settle`): several products and no default. The most-bought
 *   is first, and the list tab pre-picks it; a Make default tick on the send
 *   makes the pick the name's default.
 * - **Not saved yet** (`match` / `none`): Kroger's top match at the chosen
 *   store for the item alone, ticked to add, or replaced with a product page.
 * - **The official-name fallback is checked against Kroger** (TEC-135): a
 *   saved product found only by its Kroger name is offered only when Kroger's
 *   own search for the item returns its code too, so "8 oz spaghetti" never
 *   becomes a pasta sauce. When none passes, the line is Not saved yet with
 *   that search's top match.
 * - **Whichever goes in — a pick, the match or the replacement — is
 *   remembered**: the line's name is added to that product's names, or a new
 *   product row is made (TEC-128, TEC-131), only once its add succeeded, so a
 *   failed add saves nothing. **No model picks a product.**
 * - **Every open line reports added, skipped or failed**, so a partial send never
 *   reads as a whole one. A line is skipped only on *Not this trip*.
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

export type { Candidate, Decision } from "./brands";

export type Plan =
  | {
      kind: "exact";
      upc: string;
      url: string;
      phrase: string;
      missing: boolean;
      via: "code" | "name" | "description";
      option: Candidate;
      /** Why it goes in without a pick: the only product, the name's default, or named on the line (TEC-135). */
      chosen: "one" | "default" | "named";
      /** Every product the line could go in as, `option` first: what "tap to change" offers. */
      options: Candidate[];
      /** The saved name that matched, when one did: Make default sets this name's default. */
      matched: string | null;
    }
  | { kind: "settle"; phrase: string; via: "name" | "description"; options: Candidate[]; matched: string | null }
  | { kind: "match"; product: Product }
  | { kind: "none"; reason: string };

/**
 * How many of Kroger's results the official-name check reads (TEC-135). A
 * saved product found by its Kroger name must be among these for the item.
 */
export const CHECK_RESULTS = 10;

/** Is this saved product among Kroger's results? By code, either of Kroger's two fields. */
function returned(candidate: Candidate, results: Product[]): boolean {
  return results.some((p) => p.productId === candidate.upc || p.upc === candidate.upc);
}

export type ReviewLine = CartLine & { plan: Plan };

/**
 * What a line is searched as when no saved product decides it: **the item
 * alone** (TEC-131; `lib/itemWords.ts`), "6 cloves of garlic" as "garlic
 * cloves". When that leaves too little, the line as typed.
 */
export function lineTerm(name: string, note: string | null = null): string | null {
  // Bulk produce is searched as its bag (TEC-190): "5 onions" as "onions 3 lb bag".
  const bag = bagOf({ name, note });
  if (bag) return searchTerm(bag.phrase);
  return searchTerm(itemWords(name)) ?? searchTerm(name);
}

function goingIn(
  options: Candidate[],
  decision: Extract<Decision, { kind: "products" }>,
  chosen: "one" | "default" | "named"
): Plan {
  const [first] = options;
  return {
    kind: "exact",
    upc: first.upc,
    url: first.url,
    phrase: first.names[0] ?? decision.name,
    missing: first.missing,
    via: decision.via,
    option: first,
    chosen,
    options,
    matched: decision.matched ?? null,
  };
}

/**
 * What one line becomes, before anyone taps anything (TEC-131, TEC-135): one
 * saved product, a default or a named product goes in (`exact`), several are
 * *Pick one*, anything else is Kroger's top match for the item alone, or for a
 * phrase's search words. `search` returns Kroger's results in its order (at
 * most `CHECK_RESULTS`); only the official-name check reads past the first.
 */
export async function planLine(
  line: CartLine,
  decide: (name: string, note?: string | null) => Decision,
  search: (term: string) => Promise<Product[]>
): Promise<Plan> {
  const decision = decide(line.name, line.note);

  if (decision?.kind === "products" && decision.via !== "description") {
    const options = decision.candidates;
    if (options.length === 1) return goingIn(options, decision, "one");
    if (options.length > 1 && decision.chosen) return goingIn(options, decision, decision.chosen);
    if (options.length > 1) return { kind: "settle", phrase: decision.name, via: "name", options, matched: decision.matched ?? null };
  }

  const term = decision?.kind === "terms" ? searchTerm(decision.terms) : lineTerm(line.name, line.note);
  if (!term) return { kind: "none", reason: "Too short for Kroger's search — paste the exact product." };

  let results: Product[];
  try {
    results = await search(term);
  } catch (e) {
    return { kind: "none", reason: e instanceof Error ? e.message : "Kroger's search failed." };
  }

  // **The official-name fallback, checked** (TEC-135; RULES.md): a saved
  // product found only by its Kroger name is offered only when Kroger's own
  // search for the item returns it too.
  if (decision?.kind === "products" && decision.via === "description") {
    const passed = decision.candidates.filter((c) => returned(c, results));
    if (passed.length === 1) return goingIn(passed, decision, "one");
    if (passed.length > 1) return { kind: "settle", phrase: decision.name, via: "description", options: passed, matched: null };
  }

  const [top] = results;
  return top ? { kind: "match", product: top } : { kind: "none", reason: "Kroger has no match at your store." };
}

/**
 * Every open line's plan. **Four searches at a time** — a list of thirty would
 * otherwise be thirty requests at once against a daily limit.
 */
export async function reviewLines(
  lines: CartLine[],
  decide: (name: string, note?: string | null) => Decision,
  search: (term: string) => Promise<Product[]>
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
 * sent only for a match, a Pick one pick or a changed Going in line, never for
 * the product a line went in as untouched: it is what gets remembered. `size`
 * is the size Kroger showed for the match, kept as the size first bought when
 * the product is new to Your brands. **`makeDefault`** (TEC-135) is the Make
 * default tick: once the add went in, the product becomes the default for the
 * name that matched the line.
 */
export type CartPick = { id: string; upc?: string; url?: string; match?: string; size?: string; makeDefault?: true };

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
      if (typeof o.match === "string" && o.match.trim()) {
        pick.match = o.match.trim();
        if (typeof o.size === "string" && o.size.trim()) pick.size = o.size.trim().slice(0, 60);
      }
      if (o.makeDefault === true) pick.makeDefault = true;
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
  /**
   * Remember what went in — a replacement page, the tapped match's page or a
   * Pick one pick — in Your brands: the line's name on that product, or a
   * new product row (TEC-131).
   */
  remember: (name: string, url: string, upc: string, size: string | null) => Promise<void>;
  /**
   * **Make default** (TEC-135): this product becomes the default for the name
   * that matched this line. Called only after the add went in; throws with a
   * sentence when it can't.
   */
  makeDefault?: (line: CartLine, upc: string) => Promise<void>;
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
      // **Only on Not this trip** (RULES.md): the list tab sends every other line.
      outcomes.push({ ...base, result: "skipped", detail: "Not this trip — still on your list." });
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
    const remembered = page ? await rememberPage(deps, readAs(line), page, upc, pick.url ? null : (pick.size ?? null)) : "";
    const defaulted = pick.makeDefault ? await defaultIt(deps, line, upc) : "";
    outcomes.push({ ...sent, result: "added", ...added, detail: `${added.detail}${remembered}${defaulted}` });
  }
  return outcomes;
}

/**
 * Save what went in to Your brands, and say how that went, as a sentence to
 * append to the line. **The page must carry the product number that went in**:
 * a remembered page is read back as that number next time (`planLine`), so a
 * page naming a different one would send a different product.
 */
async function rememberPage(deps: SendDeps, name: string, page: string, upc: string, size: string | null): Promise<string> {
  if (productIdFromUrl(page) !== upc) return " Not remembered in Your brands: its page names a different product.";
  try {
    await deps.remember(name, page, upc, size);
    return " Remembered in Your brands.";
  } catch (e) {
    const why = e instanceof Error && e.message ? ` (${e.message.replace(/\.$/, "")})` : "";
    return ` Couldn't remember it in Your brands${why} — save it there by hand.`;
  }
}

/** Make it the default, and say how that went. The product is in the cart either way. */
async function defaultIt(deps: SendDeps, line: CartLine, upc: string): Promise<string> {
  if (!deps.makeDefault) return "";
  try {
    await deps.makeDefault(line, upc);
    return " Now your default.";
  } catch (e) {
    const why = e instanceof Error && e.message ? ` (${e.message.replace(/\.$/, "")})` : "";
    return ` Couldn't make it the default${why} — do it in Your brands.`;
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
