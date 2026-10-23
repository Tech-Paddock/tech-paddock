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

/**
 * Where checkout happens (2026-10-20). **A constant, never the database**:
 * the Cart API only adds and cannot check out, so the list tab and the send
 * results link here, in a new tab, and that link does nothing else.
 */
export const CHECKOUT_URL = "https://www.kingsoopers.com/cart";

/**
 * King Soopers' digital coupons, searched for an item (TEC-121). **A constant
 * and a link, never a request**: Kroger's public API has no coupons (every
 * coupon route is a 404) and kingsoopers.com is bot-protected, so the deal
 * scan never reads coupons; it offers this link beside each sale instead.
 *
 * **The query parameter is unconfirmed**: no session here can load the page.
 * A wrong parameter still lands on the coupons page, unsearched.
 */
export const COUPONS_SEARCH_URL = "https://www.kingsoopers.com/savings/cl/coupons/";

export function couponsUrl(item: string): string {
  const words = item.trim().replace(/\s+/g, " ");
  return words ? `${COUPONS_SEARCH_URL}?query=${encodeURIComponent(words)}` : COUPONS_SEARCH_URL;
}

/**
 * The product number a King Soopers product page carries, or null.
 *
 * **What Send to cart puts in the cart for a line tied to an exact product**
 * (TEC-90): a product page reads `/p/<slug>/<digits>`, and those digits are the
 * product ID Kroger's Cart API takes as `upc`. Taken from King Soopers' own
 * URLs, not loaded — the same provenance as `isKingSoopersProduct` — so a page
 * whose address ends some other way is treated as a line with no exact product
 * and gets Kroger's top match instead of a guess.
 */
/**
 * A product page address built from a product code (TEC-131): `/p/<slug>/<code>`,
 * the shape King Soopers' own pages use and the one `productIdFromUrl` reads
 * back. Used for a code with no page yet (a pasted batch, a line that is a
 * code); the refresh replaces it with Kroger's own page.
 */
export function pageFor(productId: string, description: string): string {
  const slug =
    description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "product";
  return `https://www.kingsoopers.com/p/${slug}/${productId}`;
}

export function productIdFromUrl(text: string): string | null {
  if (!isKingSoopersProduct(text)) return null;
  const segments = new URL(text.trim()).pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  return /^\d{8,14}$/.test(last) ? last : null;
}
