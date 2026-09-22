/**
 * What a search run actually did, as against what it concluded.
 *
 * Pure and apart from `lib/anthropic.ts` for the same reason `lib/guide.ts`
 * is: this is the rule, the SDK call is the plumbing, and a rule that can only
 * be exercised by making a real API call is a rule with no tests. The one this
 * module holds is the app's oldest — **an empty result and an unread result
 * must not render the same** — applied to the search itself rather than to
 * what the search returned.
 */

/** A response content block, narrowed to what this module reads. */
export type ResultBlock = { type: string; content?: unknown };

/**
 * The server tools that failed rather than found nothing.
 *
 * Web search and web fetch do not raise. A failure arrives as an ordinary
 * `web_search_tool_result` / `web_fetch_tool_result` block whose content is an
 * error object instead of a result, in a response that is otherwise a normal
 * HTTP 200. Reading only the text blocks — as this app did until 2026-09-22 —
 * never sees them, so "I could not read anything" arrives as a tier-3 `none`
 * and is written to the row as a fact about the roaster.
 *
 * The success shapes differ between the two tools (search returns a list, fetch
 * returns an object), so the test is the presence of `error_code`, not the
 * shape of the content.
 */
export function toolErrorsIn(content: ResultBlock[]): string[] {
  const errors: string[] = [];
  for (const block of Array.isArray(content) ? content : []) {
    if (!block || (block.type !== "web_search_tool_result" && block.type !== "web_fetch_tool_result")) continue;
    const inner = block.content;
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) continue;
    const code = (inner as { error_code?: unknown }).error_code;
    if (typeof code === "string" && code.trim()) {
      errors.push(`${block.type.replace("_tool_result", "")}: ${code.trim()}`);
    }
  }
  return errors;
}

/**
 * Why this run's `none` cannot be believed, or null when it can.
 *
 * A tier-3 `none` is a real answer and worth recording — but only when nothing
 * got in the way of finding out. If a page could not be fetched or the search
 * quota ran out, "the roaster published nothing" is a claim the run did not
 * earn, and storing it buries the failure under an answer that looks
 * legitimate and is indistinguishable from one later.
 *
 * **A run that found something is never unearned**, whatever failed along the
 * way: it plainly did not stop it, and the quotes are their own evidence.
 */
export function unearnedNone(status: string, toolErrors: string[]): string | null {
  if (status !== "none" || toolErrors.length === 0) return null;
  return `The search could not complete, so nothing was recorded about this coffee — ${toolErrors.join("; ")}.`;
}
