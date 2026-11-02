import { NextRequest, NextResponse } from "next/server";
import { estimateRecipeMacros } from "@/lib/anthropic";
import { applyEdit } from "@/lib/edit";
import { getRecipe, nameTakenByOther, normalizeName, updateRecipe, type Recipe } from "@/lib/recipes";
import { readMeta } from "@/lib/metadata";
import { statusOf } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Estimate the macros of a recipe that has none yet (TEC-200, TEC-201): the retry
 * after a kept Tidy whose estimate failed, and the way to price an imported
 * recipe that was never tidied. `{ id }` answers `{ recipe }`.
 *
 * The same path as an ingredient edit, with the text unchanged: one call, the
 * whole pot, `source = estimate`, the model named, and a failure writes nothing.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });

  try {
    const current = await getRecipe(id);
    if (!current) return NextResponse.json({ error: "That recipe is not in the book any more." }, { status: 404 });

    const result = await applyEdit<Recipe>(
      { getRecipe, nameTakenByOther, normalizeName, estimate: (recipe) => estimateRecipeMacros({ recipe }), update: updateRecipe },
      id,
      {
        name: current.name,
        servings: current.servings,
        ingredients: current.ingredients,
        method: current.method,
        meta: readMeta(current, { rating: true }),
      },
      { always: true }
    );
    return NextResponse.json({ recipe: result.recipe });
  } catch (e) {
    if (statusOf(e) !== 500) return errorResponse(e, "");
    return NextResponse.json(
      { error: e instanceof Error && e.message ? e.message : "Couldn't estimate that. Nothing was changed." },
      { status: 500 }
    );
  }
}
