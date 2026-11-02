import { NextRequest, NextResponse } from "next/server";
import { estimateRecipeMacros } from "@/lib/anthropic";
import { getRecipe, nameTakenByOther, normalizeName, updateRecipe, type Recipe } from "@/lib/recipes";
import { keepDraft } from "@/lib/tidy";
import { deleteDraft, getDraft } from "@/lib/tidyStore";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";
// Keeping prices the recipe: one model call at medium effort, as an edit does (TEC-133).
export const maxDuration = 120;

/**
 * Keep one tidy draft: `{ id, servings? }` answers `{ recipe, estimated }`.
 * **The browser calls this once per recipe**, so "Keep all" is a loop with a
 * progress count and no request runs long. `servings` is read only for a draft
 * whose servings were a guess (`lib/tidy.ts`).
 *
 * The write is the ingredient-edit path: the whole pot, `source = estimate`, the
 * model named. If the estimate fails the tidy is still kept and `estimated` is
 * false: the recipe says "Macros not estimated yet", with a retry.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });

  try {
    const result = await keepDraft<Recipe>(
      {
        getRecipe,
        getDraft,
        deleteDraft,
        nameTakenByOther,
        normalizeName,
        estimate: (recipe) => estimateRecipeMacros({ recipe }),
        update: updateRecipe,
      },
      id,
      { servings: body.servings }
    );
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e, "Couldn't keep that tidy.");
  }
}
