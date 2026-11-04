import { NextRequest, NextResponse } from "next/server";
import { applyEdit, readEdit } from "@/lib/edit";
import { getRecipe, nameTakenByOther, normalizeName, updateRecipe, type Recipe } from "@/lib/recipes";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Edit a recipe in the book: every field (2026-09-26). `lib/edit.ts` has
 * the rules — an edit calls no model (TEC-223), and one that changes the
 * ingredients or servings clears the macros for the nightly job to redo.
 *
 * Body: `{ id, edit:{ name, servings, ingredients, method, meta } }`.
 * Answers `{ recipe, macrosCleared }`. **Not contract** — `/api/servings` is the only
 * route Health reads, and it reads the edited row the next time it asks.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });

  const read = readEdit(body.edit);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });

  try {
    const result = await applyEdit<Recipe>(
      {
        getRecipe,
        nameTakenByOther,
        normalizeName,
        update: updateRecipe,
      },
      id,
      read.edit
    );
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e, "Couldn't save that edit. Nothing was changed.");
  }
}
