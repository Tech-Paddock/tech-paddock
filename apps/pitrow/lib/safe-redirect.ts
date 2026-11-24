/* Stamped from packages/shared/lib/safe-redirect.ts — do not edit this copy.
 * Edit the canonical file, then run: node scripts/stamp-shared.mjs
 * drift fails a copy that disagrees, and CI runs drift. */
/**
 * Where to go after a successful login.
 *
 * The login page reads `?from=` and navigates there, and that value comes from
 * whoever wrote the link. Handed to `router.push` as it was, it was an open
 * redirect (`//evil.example`, `https://…`) and worse: Next's router hands any
 * cross-origin URL to `location.assign`, so `javascript:…` ran as script on the
 * real origin with the password still in the input. So only a path on this
 * origin is followed, and everything else goes to `/`.
 *
 * Pure and dependency-free, because it runs in the browser: the login pages are
 * client components.
 *
 * - It must look like a path: one leading `/`, and not `//` or `/\`, which
 *   browsers resolve as protocol-relative, off-site URLs.
 * - It must still be on `origin` once the URL parser has had its say, which
 *   catches what the prefix test cannot (tabs and newlines are stripped
 *   during parsing, so `/\t/evil.example` becomes `//evil.example`).
 * - It must not be the login page, or success would land back on the form.
 *
 * Returns pathname + search + hash, never a full URL.
 */
export function safeRedirectTarget(from: string | null | undefined, origin: string): string {
  if (typeof from !== "string" || !from.startsWith("/")) return "/";
  if (from.startsWith("//") || from.startsWith("/\\")) return "/";

  let url: URL;
  let base: string;
  try {
    base = new URL(origin).origin;
    url = new URL(from, base);
  } catch {
    return "/";
  }

  if (url.origin !== base) return "/";
  if (url.pathname === "/login" || url.pathname === "/login/") return "/";

  return url.pathname + url.search + url.hash;
}
