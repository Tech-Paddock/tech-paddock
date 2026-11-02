import { NextRequest, NextResponse } from "next/server";
import { getRecipe } from "@/lib/recipes";
import { revertToImported } from "@/lib/tidy";
import { deleteDraft, getOriginal, revertRecipe } from "@/lib/tidyStore";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Revert (TEC-201): `{ id }` puts a recipe's imported ingredients, method and
 * servings back and sets its macros to "not estimated yet". **It only reads
 * `imported_original`**, which the database refuses to change once set. No model
 * runs. A recipe with no import is a 400.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });

  try {
    const recipe = await revertToImported({ getRecipe, getOriginal, write: revertRecipe, deleteDraft }, id);
    return NextResponse.json({ recipe });
  } catch (e) {
    return errorResponse(e, "Couldn't put that recipe back.");
  }
}
