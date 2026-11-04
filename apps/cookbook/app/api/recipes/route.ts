import { NextRequest, NextResponse } from "next/server";
import { listRecipes, saveRecipe, deleteRecipe, setRating, type RecipeDraft, type RecipeOrigin } from "@/lib/recipes";
import { readMeta } from "@/lib/metadata";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

const ORIGINS: RecipeOrigin[] = ["manual", "generated", "imported"];

/** The book. A failed read is a 503, never an empty shelf. */
export async function GET() {
  try {
    return NextResponse.json({ recipes: await listRecipes() });
  } catch (e) {
    return errorResponse(e, "Couldn't read the book.");
  }
}

/**
 * Keep a draft. **The only route that keeps a draft** (an ingredient edit writes
 * through `/api/recipes/edit`, and a rating through PATCH).
 *
 * Re-validated here rather than trusted, because the browser has had the draft in
 * its hands. **A kept recipe has no macros** (TEC-223): any `macros`, `source` or
 * `model` the body carries (a draft made before this change) is ignored, and the
 * nightly Cowork job fills the macros in. The database has the same rules as
 * constraints; this layer exists so a bad draft is a sentence you can read rather
 * than a constraint violation.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const raw = body?.draft as Record<string, unknown> | undefined;

  if (!raw) return NextResponse.json({ error: "That draft has nothing in it." }, { status: 400 });

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const servings = Number(raw.servings);

  if (!name) return NextResponse.json({ error: "The recipe needs a name." }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: "That name is too long." }, { status: 413 });
  if (!Number.isInteger(servings) || servings < 1) {
    return NextResponse.json({ error: "Say how many servings it makes." }, { status: 400 });
  }

  const draft: RecipeDraft = {
    name,
    servings,
    macros: null,
    origin: ORIGINS.includes(raw.origin as RecipeOrigin) ? (raw.origin as RecipeOrigin) : "manual",
    source: null,
    model: null,
    // A URL records where the METHOD came from. It is never where a number came
    // from, which is why nothing here tries to infer a source from it.
    source_url: typeof raw.source_url === "string" && raw.source_url.startsWith("http") ? raw.source_url : null,
    // Whether the way in applied the house style (TEC-201); the draft says so, the mark is
    // `house_style_at`. A browser claiming it only changes how the book labels the recipe.
    styled: raw.styled === true,
    ingredients: Array.isArray(raw.ingredients)
      ? raw.ingredients.map((i) => (typeof i === "string" ? i.trim() : "")).filter(Boolean)
      : [],
    method: typeof raw.method === "string" ? raw.method : null,
    note: typeof raw.note === "string" ? raw.note : null,
    // Re-read, never trusted as sent: a free-of claim or a macro tag the browser
    // somehow carries is dropped here too. The rating is read because the user may
    // set one on the draft before Keep it; no model path produces one.
    meta: readMeta(raw.meta, { rating: true }),
  };

  try {
    return NextResponse.json({ recipe: await saveRecipe(draft) }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Couldn't save that recipe.");
  }
}

/**
 * Rate a recipe, or clear its rating with `null` (TEC-52). **The only field this
 * route changes** — see `setRating`. Anything else in the body is ignored.
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });
  if (!("rating" in body)) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  try {
    return NextResponse.json({ recipe: await setRating(id, body.rating) });
  } catch (e) {
    return errorResponse(e, "Couldn't rate that recipe.");
  }
}

/** Take a recipe out of the book. Nothing else goes with it — see `deleteRecipe`. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });

  try {
    await deleteRecipe(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't remove that recipe.");
  }
}
