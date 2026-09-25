/**
 * Is this a King Soopers product page? What the brand editor's **Paste** button
 * accepts (TEC-39): the clipboard holds whatever you last copied, and a search
 * page or a different shop pasted as "this exact product" is a dead end in the
 * aisle.
 *
 * **Shape only.** No session in this repo can reach kingsoopers.com, so whether
 * the page exists is never checked. Product pages live under `/p/`, taken from
 * King Soopers' own URLs. A file of its own, with no imports, because the browser
 * runs it and must not pull the database client in with it.
 */
export function isKingSoopersProduct(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    (url.hostname === "www.kingsoopers.com" || url.hostname === "kingsoopers.com") &&
    /^\/p\/[^/]/.test(url.pathname)
  );
}
