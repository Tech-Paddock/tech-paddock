/**
 * What a search run actually did, as against what it concluded — every step
 * from an API response to the outcome stored on the bag.
 *
 * Pure and apart from `lib/anthropic.ts` for the same reason `lib/guide.ts`
 * is: this is the rule, the SDK call is the plumbing, and a rule that can only
 * be exercised by making a real API call is a rule with no tests. The one this
 * module holds is the app's oldest — **an empty result and an unread result
 * must not render the same** — applied to the search itself rather than to
 * what the search returned.
 */

import { anchorOnRoaster, validateGuide, webHost, type Guide, type RawGuide } from "./guide";

/** A response content block, narrowed to what this module reads. */
export type ResultBlock = {
  type: string;
  content?: unknown;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
};

/** One API response, narrowed the same way. */
export type SearchResponse = { stop_reason: string | null; content: ResultBlock[] };

/** A search that could not answer. Thrown, so the route records why on the row. */
export class SearchFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchFailed";
  }
}

// ---------------------------------------------------------------------------
// One turn
// ---------------------------------------------------------------------------

export type Turn = { resume: true } | { resume: false; text: string };

/**
 * Read one response: keep going, or here is the answer.
 *
 * **Only `end_turn` is an answer.** Until 2026-09-25 anything that was not
 * `pause_turn` was read as one, so a reply cut off at `max_tokens` or a
 * `refusal` parsed to nothing and was written down as a confident "this
 * roaster publishes no recipe". Both are a search that did not finish, and
 * they now say so.
 *
 * **The text blocks are joined with nothing between them.** Web search splits
 * an answer into several text blocks at citation boundaries, and a boundary
 * can fall inside a JSON string; joining with a newline put a raw newline in
 * the middle of that string, `JSON.parse` refused it, and the run recorded
 * `none`. The blocks are one answer cut into pieces, so they go back together
 * exactly as they were cut.
 */
export function readTurn(response: SearchResponse): Turn {
  switch (response.stop_reason) {
    case "pause_turn":
      return { resume: true };
    case "end_turn":
      return {
        resume: false,
        text: (Array.isArray(response.content) ? response.content : [])
          .filter((b) => b && b.type === "text")
          .map((b) => b.text ?? "")
          .join(""),
      };
    case "max_tokens":
      throw new SearchFailed("The search ran out of room before it finished answering, so nothing was recorded about this coffee.");
    case "refusal":
      throw new SearchFailed("The model declined to answer this search, so nothing was recorded about this coffee.");
    default:
      throw new SearchFailed(
        `The search stopped for an unexpected reason (${response.stop_reason ?? "none given"}), so nothing was recorded about this coffee.`
      );
  }
}

/** The model is asked for bare JSON but answers after a search narrative often enough to matter. */
export function parseGuideJson(text: string): RawGuide {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1), text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate.trim());
      if (parsed && typeof parsed === "object") return parsed as RawGuide;
    } catch {
      // Try the next shape.
    }
  }
  return {};
}

// ---------------------------------------------------------------------------
// What the tools did
// ---------------------------------------------------------------------------

const TOOL_RESULTS = new Set(["web_search_tool_result", "web_fetch_tool_result"]);

export type ToolFailure = {
  tool: "web_search" | "web_fetch";
  code: string;
  /** For a fetch, the URL it was asked for — read off the matching tool call. */
  url: string | null;
};

/**
 * The server tools that failed rather than found nothing.
 *
 * Web search and web fetch do not raise. A failure arrives as an ordinary
 * `web_search_tool_result` / `web_fetch_tool_result` block whose content is an
 * error object instead of a result, in a response that is otherwise a normal
 * HTTP 200. The success shapes differ between the two tools (search returns a
 * list, fetch returns an object), so the test is the presence of
 * `error_code`, not the shape of the content.
 */
export function toolFailuresIn(content: ResultBlock[]): ToolFailure[] {
  const blocks = Array.isArray(content) ? content : [];
  const asked = new Map<string, string>();
  for (const block of blocks) {
    if (block?.type !== "server_tool_use" || typeof block.id !== "string") continue;
    const url = (block.input as { url?: unknown } | undefined)?.url;
    if (typeof url === "string") asked.set(block.id, url);
  }

  const failures: ToolFailure[] = [];
  for (const block of blocks) {
    if (!block || !TOOL_RESULTS.has(block.type)) continue;
    const inner = block.content;
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) continue;
    const code = (inner as { error_code?: unknown }).error_code;
    if (typeof code !== "string" || !code.trim()) continue;
    failures.push({
      tool: block.type === "web_fetch_tool_result" ? "web_fetch" : "web_search",
      code: code.trim(),
      url: (block.tool_use_id && asked.get(block.tool_use_id)) || null,
    });
  }
  return failures;
}

/** The same failures as `tool: code` strings, which is how the row reports them. */
export function toolErrorsIn(content: ResultBlock[]): string[] {
  return toolFailuresIn(content).map((f) => `${f.tool}: ${f.code}`);
}

/**
 * Every page this run really reached: each document the fetch tool returned
 * and each result the search tool listed.
 *
 * Read off the tool result blocks — what the server did — and never off the
 * model's answer, which is what `validateGuide` checks it against. "The
 * roaster's own site" used to be anchored on the product URL the model
 * *reported*; this is what the run can show it went to.
 */
export function reachedUrlsIn(content: ResultBlock[]): string[] {
  const urls: string[] = [];
  for (const block of Array.isArray(content) ? content : []) {
    if (!block) continue;
    if (block.type === "web_fetch_tool_result") {
      const inner = block.content as { type?: unknown; url?: unknown } | null | undefined;
      if (inner && inner.type === "web_fetch_result" && typeof inner.url === "string") urls.push(inner.url);
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const hit of block.content as { url?: unknown }[]) {
        if (hit && typeof hit.url === "string") urls.push(hit.url);
      }
    }
  }
  return urls;
}

/**
 * Failures of the service rather than of the model's own choices.
 *
 * **Only these disqualify a `none`.** Until 2026-09-25 any tool error did, so
 * a model that spent its search quota (`max_uses_exceeded`), asked for a page
 * it had not seen (`url_not_in_prior_context`) or fetched a product page the
 * roaster has since moved (`url_not_accessible`) could never record "no
 * recipe" — the bag stayed `not_searched` and the suggestion refused it
 * forever. Those are the run's own doing, and it had the chance to recover
 * from them; a rate limit or an outage is not, and it did not.
 *
 * **A code not listed here counts as the service's**, so a new error the API
 * grows is treated as "could not look" rather than quietly believed.
 */
const MODEL_LEVEL = new Set([
  "invalid_tool_input",
  "invalid_input",
  "max_uses_exceeded",
  "query_too_long",
  "request_too_large",
  "url_too_long",
  "url_not_allowed",
  "url_not_in_prior_context",
  "url_not_accessible",
  "unsupported_content_type",
]);

export function isInfrastructureFailure(failure: ToolFailure): boolean {
  return !MODEL_LEVEL.has(failure.code);
}

function describe(failures: ToolFailure[]): string {
  return failures.map((f) => `${f.tool}: ${f.code}${f.url ? ` (${f.url})` : ""}`).join("; ");
}

/**
 * Why this run's `none` cannot be believed, or null when it can.
 *
 * **A run that found something is never unearned**, whatever failed along the
 * way: it plainly did not stop it, and the quotes are their own evidence.
 */
export function unearnedNone(status: string, failures: ToolFailure[]): string | null {
  if (status !== "none") return null;
  const blocking = failures.filter(isInfrastructureFailure);
  if (blocking.length === 0) return null;
  return `The search could not complete, so nothing was recorded about this coffee — ${describe(blocking)}.`;
}

// ---------------------------------------------------------------------------
// The whole run
// ---------------------------------------------------------------------------

export type SearchOutcome = {
  guide: Guide;
  /**
   * Said beside a `none` the run did record although a tool failed along the
   * way. The answer stands; this is what it stood despite.
   */
  warning: string | null;
};

/**
 * From the final answer and every block the run produced, to what the bag
 * records. Throws `SearchFailed` when the run cannot answer.
 */
export function concludeSearch(text: string, blocks: ResultBlock[], roaster: string): SearchOutcome {
  const failures = toolFailuresIn(blocks);
  const reached = reachedUrlsIn(blocks);
  const reachedHosts = reached.map(webHost).filter((h): h is string => !!h);

  // The product page gets its own roaster-site check (TEC-68): it is what
  // every other check is anchored on, so a retailer's page named here would
  // otherwise pass as the roaster's site, and its gallery would be read.
  const anchored = anchorOnRoaster(validateGuide(parseGuideJson(text), reachedHosts), roaster);
  let guide = anchored.guide;

  const unearned = unearnedNone(guide.status, failures);
  if (unearned) throw new SearchFailed(unearned);

  // A product page that would not load, and that nothing in this run did
  // load, is a link to nowhere: the roaster moved or removed it. It is
  // cleared rather than handed to the next search as a known page, and
  // rather than left under "Beans ↗". Not on tier 1, whose product page is
  // the page the guide was read on.
  const stale =
    guide.product_url &&
    guide.status !== "coffee_specific" &&
    !reached.includes(guide.product_url) &&
    failures.some((f) => f.tool === "web_fetch" && f.url?.trim() === guide.product_url);
  if (stale) guide = { ...guide, product_url: null };

  const trouble =
    guide.status === "none" && failures.length > 0
      ? `Recorded as no recipe, though the search hit trouble on the way — ${describe(failures)}.` +
        (stale ? " The product page no longer loads, so its link was cleared." : "")
      : null;
  // Said even when nothing was found on it: a retailer's link that vanished
  // without a word would read as a bag that never had one.
  const offSite = anchored.refusal
    ? `The product page was not kept and its images were not read: ${anchored.refusal}.`
    : null;
  const warning = [trouble, offSite].filter(Boolean).join(" ") || null;

  return { guide, warning };
}
