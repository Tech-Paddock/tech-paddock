import type { Recipe } from "@/lib/recipes";

/**
 * Reading the book from the server (TEC-273): the first read, a re-read after a
 * keep or a remove, and the Refresh button are all this one function.
 *
 * It answers with a list or with a reason, never with an empty list standing in
 * for a failure: **an unread book must never render as an empty one.** A reply
 * that is not a list of recipes is a failure, so the caller keeps whatever it
 * already shows.
 */
export type BookRead = { ok: true; recipes: Recipe[] } | { ok: false; error: string };

const FAILED = "Couldn't read the book.";

export async function readBook(fetchImpl: typeof fetch = fetch): Promise<BookRead> {
  try {
    const response = await fetchImpl("/api/recipes", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) return { ok: false, error: typeof body?.error === "string" ? body.error : FAILED };
    if (!Array.isArray(body?.recipes)) return { ok: false, error: FAILED };
    return { ok: true, recipes: body.recipes as Recipe[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message ? e.message : FAILED };
  }
}
