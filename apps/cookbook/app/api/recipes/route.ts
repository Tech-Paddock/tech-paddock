import { NextRequest, NextResponse } from "next/server";
import { listRecipes, saveRecipe, deleteRecipe, type RecipeDraft, type RecipeOrigin } from "@/lib/recipes";
import { LookupError } from "@/lib/errors";
import { parseMacros } from "@/lib/macros";
import { MODELS, type ModelId } from "@/lib/models";

export const dynamic = "force-dynamic";

const ORIGINS: RecipeOrigin[] = ["manual", "generated", "imported"];

/** Two values, matching `cookbook.macro_source`. There is no `web` — see lib/macros.ts. */
const SOURCES = ["hand", "estimate"] as const;

/** The book. A failed read is a 503, never an empty shelf. */
export async function GET() {
  try {
    return NextResponse.json({ recipes: await listRecipes() });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't read the book." }, { status: 500 });
  }
}

/**
 * Keep a draft. **The only route that writes a recipe.**
 *
 * Re-validated here rather than trusted, because the browser has had the draft in
 * its hands and a draft is where every number in the book comes from. The
 * database has the same rules as constraints; this layer exists so a bad draft is
 * a sentence you can read rather than a constraint violation.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const raw = body?.draft as Record<string, unknown> | undefined;

  if (!raw) return NextResponse.json({ error: "That draft has nothing in it." }, { status: 400 });

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const macros = parseMacros(raw.macros);
  const servings = Number(raw.servings);

  if (!name) return NextResponse.json({ error: "The recipe needs a name." }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: "That name is too long." }, { status: 413 });
  if (!macros) return NextResponse.json({ error: "That recipe has no usable numbers." }, { status: 400 });
  if (!Number.isInteger(servings) || servings < 1) {
    return NextResponse.json({ error: "Say how many servings it makes." }, { status: 400 });
  }

  const source = typeof raw.source === "string" && (SOURCES as readonly string[]).includes(raw.source)
    ? (raw.source as RecipeDraft["source"])
    : "estimate";
  const model = typeof raw.model === "string" && raw.model in MODELS ? (raw.model as ModelId) : null;

  const draft: RecipeDraft = {
    name,
    servings,
    macros,
    origin: ORIGINS.includes(raw.origin as RecipeOrigin) ? (raw.origin as RecipeOrigin) : "manual",
    source,
    // A model-produced number must name a real model, not whatever string the
    // browser sent. The database enforces the pairing; this keeps it a 400 you
    // can read.
    model: source === "hand" ? null : model,
    // A URL records where the METHOD came from. It is never where a number came
    // from, which is why nothing here tries to infer a source from it.
    source_url: typeof raw.source_url === "string" && raw.source_url.startsWith("http") ? raw.source_url : null,
    ingredients: Array.isArray(raw.ingredients)
      ? raw.ingredients.map((i) => (typeof i === "string" ? i.trim() : "")).filter(Boolean)
      : [],
    method: typeof raw.method === "string" ? raw.method : null,
    note: typeof raw.note === "string" ? raw.note : null,
  };

  if (draft.source !== "hand" && !draft.model) {
    return NextResponse.json(
      { error: "That draft says a model produced its numbers but does not name one." },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ recipe: await saveRecipe(draft) }, { status: 201 });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't save that recipe." }, { status: 500 });
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
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't remove that recipe." }, { status: 500 });
  }
}
