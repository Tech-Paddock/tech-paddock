import { NextResponse } from "next/server";
import { listRecipes, toServingRows } from "@/lib/recipes";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * **The Health↔Cookbook read contract — its one home is `RULES.md`** (TEC-11,
 * built as TEC-24). Every recipe in the book, per serving:
 * `{ recipes: [{ id, name, servings, per_serving: { kcal, protein_g, carbs_g, fat_g } }] }`.
 *
 * - **Cookbook does the division** (`toServingRows`); Health never learns that the
 *   table stores the whole pot.
 * - **Authentication is the session.** Health's server forwards the caller's
 *   `paddock_session` cookie; `middleware.ts` already admits any valid session, so
 *   there is no carve-out here and none should be added.
 * - **Down is never "not found".** A failed read is a 503 — and since TEC-29 item 7,
 *   503 means only that — never a 200 with an empty list, which Health would read as
 *   "no such recipe".
 * - **Additive only.** A new field is free; renaming or removing one is a contract
 *   change, and the technical director's.
 *
 * Nothing else under `/api` is contract.
 */
export async function GET() {
  try {
    const recipes = toServingRows(await listRecipes());
    return NextResponse.json({ recipes }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "Couldn't read the book.");
  }
}
