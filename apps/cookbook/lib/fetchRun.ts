/**
 * What an import's fetches actually did, as against what the model claimed.
 *
 * Pure and apart from `lib/anthropic.ts` so the rule has tests without an API
 * call — the same split as Coffee's `lib/searchRun.ts`, which this follows.
 *
 * **Why this exists (TEC-29 item 6).** A page that could not be read is refused
 * twice: the prompt asks for `read: false`, and the importer rejects a "read"
 * page that produced no ingredients. **A recipe invented from the link's slug has
 * ingredients and passes both** — which is the charter's own example of failure.
 * The third check does not ask the model anything: it looks at whether any fetch
 * returned a page at all.
 *
 * Web fetch does not raise. A failure arrives as an ordinary
 * `web_fetch_tool_result` block whose content is an error object carrying
 * `error_code`, in an otherwise normal HTTP 200 response.
 */

/** A response content block, narrowed to what this module reads. */
export type ResultBlock = { type: string; content?: unknown };

/** How many fetches returned a page, and why the others did not. */
export function fetchOutcomes(content: ResultBlock[]): { fetched: number; errors: string[] } {
  let fetched = 0;
  const errors: string[] = [];
  for (const block of Array.isArray(content) ? content : []) {
    if (!block || block.type !== "web_fetch_tool_result") continue;
    const inner = block.content;
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) continue;
    const code = (inner as { error_code?: unknown }).error_code;
    if (typeof code === "string" && code.trim()) errors.push(code.trim());
    else if ((inner as { type?: unknown }).type === "web_fetch_result") fetched++;
  }
  return { fetched, errors };
}

/**
 * Why this import must be refused even though the model says it read the page,
 * or null when a page really was fetched.
 */
export function unfetchedRead(content: ResultBlock[]): string | null {
  const { fetched, errors } = fetchOutcomes(content);
  if (fetched > 0) return null;
  return errors.length > 0
    ? `The page could not be fetched (${errors.join(", ")}), so nothing was read from it.`
    : "The page was never fetched, so nothing was read from it.";
}
