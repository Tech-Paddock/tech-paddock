import { NextRequest, NextResponse } from "next/server";
import { estimateRecipeMacros, generateRecipe, importRecipe, readRecipeFile, type RecipeFields } from "@/lib/anthropic";
import { validateRecipeFile } from "@/lib/upload";
import { MAX_STEER, readTurnedDown } from "@/lib/reroll";
import { nameTaken, type RecipeDraft } from "@/lib/recipes";
import { statusOf } from "@/lib/errors";
import { errorResponse } from "@/lib/respond";
import { MODELS, DEFAULT_MODEL, type ModelId } from "@/lib/models";
import { EMPTY_META, readMeta } from "@/lib/metadata";

export const dynamic = "force-dynamic";
// Reading a page and then pricing it is two model calls, one of them with a
// server tool. The Vercel default would cut the second one off mid-thought.
export const maxDuration = 120;

/**
 * Four ways into the book, and **none of them writes anything.**
 *
 * - `manual` — you typed the recipe; the model only prices it.
 * - `generate` — you described what you wanted; the model writes it, then prices
 *   what it wrote.
 * - `import` — you pasted a link; the model reads the page, then prices what it
 *   read.
 * - `file` — you uploaded a photo or a PDF; the model reads it, then prices what
 *   it read. Added 2026-09-22. It lands as `imported` with no `source_url`,
 *   because there is nowhere to point back to, and the file itself is not kept.
 *
 * All four end at the same approval, `POST /api/recipes`. **This route is the
 * draft, and the draft is not the book.**
 *
 * **The macros are always ours.** Even an imported recipe whose page publishes a
 * nutrition panel comes back `estimate` — Joel: *"Only retain recipe. Then
 * calculate macros and cals."* — and `source_url` records where the method came
 * from rather than where a number did. That is a cost named once, and it buys one
 * rule instead of two and a book whose numbers are comparable with each other.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const mode = typeof body.mode === "string" ? body.mode : "";
  const model: ModelId =
    typeof body.model === "string" && body.model in MODELS ? (body.model as ModelId) : DEFAULT_MODEL;

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
        return NextResponse.json(
          { error: "List what goes in it — the macros come from that." },
          { status: 400 }
        );
      }

      // Before the pricing call, not after it: a typed recipe saves straight away,
      // so a name already in the book would pay for a model call and then be
      // refused at the insert.
      if (await nameTaken(name)) {
        return NextResponse.json(
          { error: `"${name}" is already in the book. Rename it, or remove the one that is in there.` },
          { status: 409 }
        );
      }

      fields = {
        name,
        servings,
        ingredients,
        method: typeof body.method === "string" ? body.method.trim() || null : null,
        // You typed these, rating included: the typed path is yours end to end.
        meta: readMeta(body.meta, { rating: true }),
      };
      origin = "manual";
    } else if (mode === "generate") {
      const brief = typeof body.brief === "string" ? body.brief.trim() : "";
      if (!brief) return NextResponse.json({ error: "Say what you feel like." }, { status: 400 });
      if (brief.length > 2000) return NextResponse.json({ error: "That is a long brief." }, { status: 413 });

      // "Something else" (TEC-39 D): the same brief, plus every draft turned
      // down this session and an optional reason. Both are the browser's state
      // and are re-shaped here, never trusted as sent.
      const avoid = readTurnedDown(body.turned_down);
      if ("error" in avoid) return NextResponse.json({ error: avoid.error }, { status: 400 });
      const steer = typeof body.steer === "string" ? body.steer.trim() : "";
      if (steer.length > MAX_STEER) return NextResponse.json({ error: "That reason is long." }, { status: 413 });

      fields = await generateRecipe({ brief, model, turnedDown: avoid.turnedDown, steer });
      origin = "generated";
    } else if (mode === "import") {
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (!/^https?:\/\/\S+$/i.test(url)) {
        return NextResponse.json({ error: "That does not look like a link." }, { status: 400 });
      }

      const read = await importRecipe({ url, model });
      // **The guardrail, failing loudly rather than degrading.** A page that
      // could not be read is a refusal, not a starting point — a recipe
      // reconstructed from a URL slug is indistinguishable from one that was
      // really there until you have cooked it.
      if (!read.read || !read.fields) {
        return NextResponse.json(
          { error: `Nothing was imported. ${read.reason ?? "That page could not be read."}` },
          { status: 422 }
        );
      }

      fields = read.fields;
      origin = "imported";
      sourceUrl = url;
    } else if (mode === "file") {
      const checked = validateRecipeFile(body.file);
      if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

      const read = await readRecipeFile({ file: checked.file, model });
      // The same loud refusal as a page that could not be read.
      if (!read.read || !read.fields) {
        return NextResponse.json(
          { error: `Nothing was imported. ${read.reason ?? "That file could not be read."}` },
          { status: 422 }
        );
      }

      fields = read.fields;
      origin = "imported";
    } else {
      return NextResponse.json(
        { error: "Type it, ask for one, paste a link, or choose a file." },
        { status: 400 }
      );
    }

    // An imported page that never said how many it serves comes back as 0. Four
    // is the assumption, and it is **surfaced in the note rather than applied
    // silently**, because servings is the divisor for every macro under it.
    const assumedServings = fields.servings < 1;
    const servings = assumedServings ? 4 : fields.servings;

    const estimate = await estimateRecipeMacros({ recipe: { ...fields, servings }, model });

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
      // Off a model, `readRecipeFields` already read these with no rating. The
      // spread makes that explicit here too: only the typed path keeps one.
      meta: { ...(fields.meta ?? EMPTY_META), ...(mode === "manual" ? {} : { rating: null }) },
      note:
        [
          assumedServings ? `${mode === "file" ? "The file" : "The page"} did not say how many it serves; 4 assumed — change it.` : null,
          estimate.note,
        ]
          .filter(Boolean)
          .join(" ") || null,
    };

    return NextResponse.json({ draft });
  } catch (e) {
    // A model that answered with nothing usable throws a plain Error, and its own
    // sentence says more than a fallback would. Typed failures map as they do
    // everywhere else (lib/errors.ts).
    if (statusOf(e) !== 500) return errorResponse(e, "");
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't draft that recipe." },
      { status: 500 }
    );
  }
}
