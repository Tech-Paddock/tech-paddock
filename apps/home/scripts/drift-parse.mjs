/**
 * Reads `scripts/drift-check.mjs --json` output into the shape The Garage
 * renders, or into the reason it cannot. Its own module so it is tested without
 * spawning the check; `collect-drift.mjs` does the spawning.
 *
 * The JSON shape is the technical director's — `{checks:[{name,state,detail}]}`.
 */

const STATES = new Set(["ok", "warn", "fail"]);

export const unmeasured = (reason) => ({
  complete: false,
  reason,
  checks: [],
  counts: { ok: 0, warn: 0, fail: 0 },
});

export function parseDrift(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return unmeasured("The drift check produced output that is not JSON.");
  }

  if (!Array.isArray(parsed?.checks)) {
    return unmeasured("The drift check returned no `checks` array — its output shape has changed.");
  }

  /**
   * One malformed entry makes the whole thing unreadable rather than silently
   * dropping that row. A panel showing four checks out of five, with nothing
   * saying so, is the exact failure this page exists to not commit.
   */
  const checks = [];
  for (const c of parsed.checks) {
    if (!c || typeof c.name !== "string" || !STATES.has(c.state)) {
      return unmeasured("The drift check returned a check this page cannot read — its contract has changed.");
    }
    checks.push({ name: c.name, state: c.state, detail: typeof c.detail === "string" ? c.detail : "" });
  }

  /**
   * Counted from the rows that are actually rendered rather than taken from the
   * script's own `counts`, so the numbers at the top of the panel can never
   * disagree with the rows underneath them.
   */
  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const c of checks) counts[c.state]++;

  return { complete: true, reason: "", checks, counts };
}
