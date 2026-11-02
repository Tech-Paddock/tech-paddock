import { KrogerConfigError, KrogerError } from "./kroger";
import { ConflictError } from "./errors";
import type { CheckResult, CheckState } from "./checkLine";

/**
 * The live King Soopers check (TEC-211; owner, 2026-11-02: "so there is no
 * question if we are connected").
 *
 * **"Connected" used to mean only that a saved sign-in exists.** This proves it
 * still works: it borrows an access token the way every other call does
 * (`withAccessToken`, one refresh, the rotated refresh token resealed), and
 * says which of five things is true. It proves the sign-in. It cannot prove the
 * cart is right, because the Cart API cannot read the cart.
 *
 * **The result carries no token, ever**: `run` hands back nothing, and the
 * only text that leaves is a Kroger error already reduced to its code
 * (`lib/kroger.ts`). `tests/kroger.test.ts` reads the route's body for every
 * token. Pure: the route passes the token call in, so a test can stub it.
 */

/**
 * Run the check. `run` borrows a token (and drops it). A thrown error is read
 * as a state; anything this does not recognise (the database not answering)
 * is thrown again, so it is never mistaken for Kroger being down.
 */
export async function checkConnection(run: () => Promise<unknown>, now: () => Date = () => new Date()): Promise<CheckResult> {
  const result = (state: CheckState, detail: string | null = null, problems: string[] = []): CheckResult => ({
    state,
    checkedAt: now().toISOString(),
    detail,
    problems,
  });
  try {
    await run();
    return result("connected");
  } catch (e) {
    if (e instanceof KrogerConfigError) return result("not-set-up", e.message, e.problems);
    if (e instanceof ConflictError) return result("not-connected");
    // `reconnect` is Kroger refusing the stored sign-in (or this app unable to open it).
    if (e instanceof KrogerError) return e.reconnect ? result("expired", e.message) : result("unreachable", e.message);
    throw e;
  }
}
