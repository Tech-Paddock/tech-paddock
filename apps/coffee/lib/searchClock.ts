/**
 * How long a search may run, and when a page stops believing one is running.
 *
 * Pure, and imported by the route and the page both, so the two cannot
 * disagree about it.
 *
 * **The search stops itself before Vercel stops it.** `app/api/search` has
 * `maxDuration = 300`. A function killed at that limit never reaches its
 * error handler, so `guide_search_started_at` stayed set, no error was
 * written, and the bag read "searching" forever. Giving the search its own
 * budget, thirty seconds inside the platform's, leaves the handler time to
 * write down why it stopped.
 *
 * **The page gives up at the platform's limit, not at the budget.** A search
 * that stops at the budget still has to write its answer, and a page that
 * called it failed at 270 seconds would race that write. Past 300 seconds
 * nothing is left running that could write anything, so a stamp that old is
 * a search that died without saying so.
 */

/** What `searchBrewGuide` gives itself, end to end, across every resumed turn. */
export const SEARCH_BUDGET_MS = 270_000;

/** `maxDuration` on the search route, in ms. That value must stay a literal there. */
export const SEARCH_STALE_MS = 300_000;

/** How long a page waits for the route to stamp the row before saying it never started. */
export const SEARCH_START_GRACE_MS = 20_000;

/** A search stamp that nothing can still be working under. */
export function searchIsStale(startedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!startedAt) return false;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return true;
  return now - started > SEARCH_STALE_MS;
}

/** A search stamp that something may still be working under. */
export function searchIsRunning(startedAt: string | null | undefined, now: number = Date.now()): boolean {
  return !!startedAt && !searchIsStale(startedAt, now);
}

export const STALE_SEARCH_MESSAGE =
  "The search ran out of time without recording an answer. Nothing on this bag changed — try it again.";
