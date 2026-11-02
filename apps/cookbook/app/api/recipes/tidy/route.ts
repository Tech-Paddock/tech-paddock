import { NextRequest, NextResponse } from "next/server";
import { styleRecipe } from "@/lib/anthropic";
import { getRecipe, listRecipes } from "@/lib/recipes";
import { draftView, makeDraft } from "@/lib/tidy";
import { deleteDrafts, getOriginal, getOriginals, listDrafts, saveDraft } from "@/lib/tidyStore";
import { statusOf } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";
// One recipe, one model call at medium effort (TEC-133).
export const maxDuration = 120;

/**
 * Tidy (TEC-201). **Drafts only: nothing here changes a recipe.** The browser
 * makes them one recipe at a time with a progress count, so no request runs
 * long; keeping is `/api/recipes/tidy/keep`.
 *
 * GET answers `{ drafts, todo }`: every draft beside what Tidy read for it, and
 * the recipes that are not in the house style yet and have no draft.
 */
export async function GET() {
  try {
    const [recipes, drafts] = await Promise.all([listRecipes(), listDrafts()]);
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const live = drafts.filter((d) => byId.has(d.recipe_id));
    const originals = await getOriginals(live.map((d) => d.recipe_id));
    const drafted = new Set(drafts.map((d) => d.recipe_id));
    return NextResponse.json({
      drafts: live.map((d) => draftView(d, byId.get(d.recipe_id)!, originals.get(d.recipe_id))),
      todo: recipes.filter((r) => !r.house_style_at && !drafted.has(r.id)).map((r) => ({ id: r.id, name: r.name })),
    });
  } catch (e) {
    return errorResponse(e, "Couldn't read the tidy drafts.");
  }
}

/** Make (or replace) the draft for one recipe: `{ id }` answers `{ draft }`. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });

  try {
    const draft = await makeDraft({ getRecipe, getOriginal, style: styleRecipe, saveDraft }, id);
    const recipe = await getRecipe(id);
    if (!recipe) return NextResponse.json({ error: "That recipe is not in the book any more." }, { status: 404 });
    return NextResponse.json({ draft: draftView(draft, recipe, await getOriginal(id)) });
  } catch (e) {
    // A model that failed or changed the recipe throws a plain Error whose sentence says why.
    if (statusOf(e) !== 500) return errorResponse(e, "");
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't tidy that recipe." }, { status: 500 });
  }
}

/** Throw drafts away: `{ ids }`. A draft is only a proposal, so no recipe changes. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((i: unknown): i is string => typeof i === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Which drafts?" }, { status: 400 });

  try {
    await deleteDrafts(ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't discard those drafts.");
  }
}
