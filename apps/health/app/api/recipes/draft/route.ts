import { NextRequest, NextResponse } from "next/server";
import { estimateRecipeMacros, generateRecipe, importRecipe, type RecipeFields } from "@/lib/anthropic";
import { type RecipeDraft } from "@/lib/recipes";
import { LookupError } from "@/lib/items";
import { MODELS, DEFAULT_MODEL, type ModelId } from "@/lib/models";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Three ways into the book, and none of them writes anything.
 *
 * - `manual` — you typed the recipe; the model only prices it.
 * - `generate` — you described what you wanted; the model writes it, then
 *   prices what it wrote.
 * - `import` — you pasted a URL; the model reads the page, then prices what it
 *   read.
 *
 * **All three end at the same approval**, which is `POST /api/recipes`. This
 * route is the draft; the draft is not the book.
 *
 * **The macros are always estimated here, never lifted.** Joel: *"Only retain
 * recipe. Then calculate macros and cals."* So even an imported recipe whose
 * page publishes a nutrition panel comes back `estimate`, and `source_url`
 * records where the *method* came from rather than where a number did.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const mode = typeof body.mode === "string" ? body.mode : "";
  const model: ModelId = typeof body.model === "string" && body.model in MODELS
    ? (body.model as ModelId)
    : DEFAULT_MODEL;

  try {
    let fields: RecipeFields;
    let origin: RecipeDraft["origin"];
    let sourceUrl: string | null = null;

    if (mode === "manual") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const servings = Number(body.servings);
      const ingredients = Array.isArray(body.ingredients)
        ? body.ingredients.map((i: unknown) => (typeof i === "string" ? i.trim() : "")).filter(Boolean)
        : [];

      if (!name) return NextResponse.json({ error: "Give it a name." }, { status: 400 });
      if (!Number.isInteger(servings) || servings < 1) {
        return NextResponse.json({ error: "Say how many servings it makes." }, { status: 400 });
      }
      if (ingredients.length === 0) {
        return NextResponse.json({ error: "List what goes in it — the macros come from that." }, { status: 400 });
      }

      fields = {
        name,
        servings,
        ingredients,
        method: typeof body.method === "string" ? body.method.trim() || null : null,
      };
      origin = "manual";
    } else if (mode === "generate") {
      const brief = typeof body.brief === "string" ? body.brief.trim() : "";
      if (!brief) return NextResponse.json({ error: "Say what you feel like." }, { status: 400 });
      if (brief.length > 2000) return NextResponse.json({ error: "That is a long brief." }, { status: 413 });

      fields = await generateRecipe({ brief, model });
      origin = "generated";
    } else if (mode === "import") {
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (!/^https?:\/\/\S+$/i.test(url)) {
        return NextResponse.json({ error: "That does not look like a link." }, { status: 400 });
      }

      const read = await importRecipe({ url, model });
      // **The guardrail, and it fails loudly rather than degrading.** A page
      // that could not be read is a refusal, not a starting point — a recipe
      // reconstructed from a URL slug is indistinguishable from one that was
      // really there until you have cooked it and logged its macros.
      if (!read.read || !read.fields) {
        return NextResponse.json(
          { error: `Nothing was imported. ${read.reason ?? "That page could not be read."}` },
          { status: 422 }
        );
      }

      fields = read.fields;
      origin = "imported";
      sourceUrl = url;
    } else {
      return NextResponse.json({ error: "Type it, ask for one, or paste a link." }, { status: 400 });
    }

    // An imported page that never said how many it serves comes back as 0. Four
    // is the assumption, and it is surfaced in the note rather than applied
    // silently, because servings is the divisor for every macro below it.
    const assumedServings = fields.servings < 1;
    const servings = assumedServings ? 4 : fields.servings;

    const estimate = await estimateRecipeMacros({
      recipe: { ...fields, servings },
      model,
    });

    const draft: RecipeDraft = {
      name: fields.name,
      servings,
      macros: estimate.macros,
      origin,
      source: "estimate",
      model,
      source_url: sourceUrl,
      ingredients: fields.ingredients,
      method: fields.method,
      note: [
        assumedServings ? "The page did not say how many it serves; 4 assumed — change it." : null,
        estimate.note,
      ]
        .filter(Boolean)
        .join(" ") || null,
    };

    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't draft that recipe." },
      { status: 500 }
    );
  }
}
