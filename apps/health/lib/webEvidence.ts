/**
 * Whether a model actually read the page it cites.
 *
 * Pure and apart from `lib/anthropic.ts` so the rule is tested without an API
 * call. **A number is labelled "From the web" only when the URL it claims appears
 * in this run's own `web_search` / `web_fetch` results.** Before this, the label
 * was taken on the model's word — any URL-shaped string in its JSON made an
 * estimate look sourced, which is the one line on screen that says "trust this".
 */

/** A response content block, narrowed to what this module reads. */
export type ResultBlock = { type: string; content?: unknown };

/** Scheme, host case, a trailing slash and a fragment are not a different page. */
export function normalizeUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return null;
  }
}

/** Every page a run's server tools returned, normalised. */
export function urlsReadIn(content: ResultBlock[]): Set<string> {
  const read = new Set<string>();
  const add = (url: unknown) => {
    if (typeof url !== "string") return;
    const n = normalizeUrl(url);
    if (n) read.add(n);
  };
  for (const block of Array.isArray(content) ? content : []) {
    if (!block) continue;
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) add((r as { url?: unknown })?.url);
    }
    if (block.type === "web_fetch_tool_result" && block.content && typeof block.content === "object") {
      // An error result has `error_code` and no `url`, so it adds nothing.
      add((block.content as { url?: unknown }).url);
    }
  }
  return read;
}

/** The claimed URL when this run read it, otherwise null. */
export function earnedUrl(claimed: unknown, read: Set<string>): string | null {
  if (typeof claimed !== "string" || !claimed.trim()) return null;
  const n = normalizeUrl(claimed);
  return n && read.has(n) ? claimed.trim() : null;
}
