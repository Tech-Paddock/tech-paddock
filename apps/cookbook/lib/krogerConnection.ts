import { configProblems, exchangeCode, krogerConfig, KrogerError, refresh } from "./kroger";
import { open, seal, stateIsValid } from "./krogerCrypto";
import { readConnectionRow, writeRefreshToken } from "./krogerStore";
import { ConflictError } from "./errors";

/**
 * The one King Soopers connection: what the list tab is told about it, how a
 * sign-in arrives, and how a request borrows an access token.
 *
 * **Nothing returned from here carries a token.** `withAccessToken` hands the
 * access token to a callback and returns only what that callback returns; the
 * routes never hold one long enough to put it in a response, and
 * `tests/kroger.test.ts` reads every route's body for both tokens.
 */

export type ConnectionStatus = {
  /** False when an environment variable is missing; `problems` says which, in words. */
  configured: boolean;
  problems: string[];
  connected: boolean;
  store: ChosenStore | null;
  /** When the last refresh finished; the list tab starts one when this is over a week old. */
  refreshedAt: string | null;
};

export type ChosenStore = { locationId: string; name: string };

function storeOf(row: { location_id: string | null; store_name: string | null }): ChosenStore | null {
  return row.location_id ? { locationId: row.location_id, name: row.store_name ?? row.location_id } : null;
}

export async function connectionStatus(): Promise<ConnectionStatus> {
  const problems = configProblems();
  const row = await readConnectionRow();
  return {
    configured: problems.length === 0,
    problems,
    connected: row !== null,
    store: row ? storeOf(row) : null,
    refreshedAt: row?.refreshed_at ?? null,
  };
}

/**
 * Run `use` with a fresh access token, and the chosen store if there is one.
 *
 * **One refresh per request**, and the access token is never stored: it lives
 * for this call only. When Kroger hands back a new refresh token it is sealed
 * and saved before `use` runs, because the old one may already be spent.
 */
export async function withAccessToken<T>(
  use: (accessToken: string, store: ChosenStore | null) => Promise<T>
): Promise<T> {
  const config = krogerConfig();
  const row = await readConnectionRow();
  if (!row) throw new ConflictError("Connect King Soopers first.");

  let stored: string;
  try {
    stored = open(row.refresh_token_sealed, config.key);
  } catch (e) {
    throw new KrogerError(e instanceof Error ? e.message : "The stored Kroger token is unreadable.", 0, true);
  }

  const tokens = await refresh(config, stored);
  if (tokens.refreshToken && tokens.refreshToken !== stored) {
    await writeRefreshToken(seal(tokens.refreshToken, config.key), false);
  }
  return use(tokens.accessToken, storeOf(row));
}

/**
 * Where the callback sends the browser, as one word the list tab turns into a
 * sentence. Never a token, never Kroger's raw error.
 */
export type CallbackOutcome = "connected" | "declined" | "bad-state" | "failed" | "unconfigured";

/**
 * Kroger's redirect back, checked and completed.
 *
 * **The state is checked before anything else is touched**: a callback whose
 * state does not match the cookie this browser was given — and this app's
 * signature on it — writes nothing and calls nobody. That is the CSRF guard: it
 * stops someone else's Kroger sign-in being attached to Joel's Cookbook by a
 * link.
 */
export async function completeCallback(input: {
  code: string | null;
  state: string | null;
  cookieState: string | null;
  error: string | null;
}): Promise<CallbackOutcome> {
  let config;
  try {
    config = krogerConfig();
  } catch {
    return "unconfigured";
  }

  if (!stateIsValid(input.state, input.cookieState, config.key)) return "bad-state";
  if (input.error) return "declined";
  if (!input.code) return "failed";

  try {
    const tokens = await exchangeCode(config, input.code);
    // Without a refresh token there is nothing to keep, and a connection that
    // works for thirty minutes is worse than one that says it did not connect.
    if (!tokens.refreshToken) return "failed";
    await writeRefreshToken(seal(tokens.refreshToken, config.key), true);
    return "connected";
  } catch {
    // Deliberately not logged: the error may have been built around a response
    // to a request that carried the code and the client secret.
    return "failed";
  }
}
