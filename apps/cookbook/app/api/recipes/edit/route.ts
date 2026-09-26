import { NextRequest, NextResponse } from "next/server";
import { estimateRecipeMacros } from "@/lib/anthropic";
import { applyEdit, readEdit } from "@/lib/edit";
import { getRecipe, nameTakenByOther, normalizeName, updateRecipe, type Recipe } from "@/lib/recipes";
import { statusOf } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";
import { MODELS, DEFAULT_MODEL, type ModelId } from "@/lib/models";

export const dynamic = "force-dynamic";
// An edit that changes the ingredients makes one pricing call before it writes.
export const maxDuration = 60;

/**
 * Edit a recipe in the book: every field (Joel, 2026-09-26). `lib/edit.ts` has
 * the rules — what re-prices, and why a failed re-price writes nothing.
 *
 * Body: `{ id, model?, edit: { name, servings, ingredients, method, meta } }`.
 * Answers `{ recipe, repriced }`. **Not contract** — `/api/servings` is the only
 * route Health reads, and it reads the edited row the next time it asks.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });

  const read = readEdit(body.edit);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });

  const model: ModelId =
    typeof body.model === "string" && body.model in MODELS ? (body.model as ModelId) : DEFAULT_MODEL;

  try {
    const result = await applyEdit<Recipe>(
      {
        getRecipe,
        nameTakenByOther,
        normalizeName,
        estimate: (recipe) => estimateRecipeMacros({ recipe, model }),
        update: updateRecipe,
      },
      id,
      read.edit,
      model
    );
    return NextResponse.json(result);
  } catch (e) {
    // A model that failed throws a plain Error whose sentence ("ran out of room",
    // "did not return usable macros") says more than a fallback. It is still a
    // 500, never a 200, and nothing was written; the screen says "not saved".
    if (statusOf(e) !== 500) return errorResponse(e, "");
    return NextResponse.json(
      { error: e instanceof Error && e.message ? e.message : "Couldn't re-price that. Nothing was changed." },
      { status: 500 }
    );
  }
}
