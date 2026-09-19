import { NextRequest, NextResponse } from "next/server";
import { getRecipe } from "@/lib/recipes";
import { resolveItem, saveEntry } from "@/lib/log";
import { LookupError } from "@/lib/items";
import { isMeal } from "@/lib/meals";

export const dynamic = "force-dynamic";

/**
 * Log N servings of a recipe. **No model call, by construction.**
 *
 * Joel: *"macro tracker should only be reading from database."* This route
 * keeps that literally rather than by intention. `resolveItem` is the same
 * lookup the dictation path uses, and because a recipe owns its item, it
 * resolves at tier 1 — your own table — and never reaches the estimate. The
 * one way it could call a model is if the item had gone missing, and that is
 * refused below rather than quietly priced.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const servings = Number(body.servings);
  const eatenOn = typeof body.eaten_on === "string" ? body.eaten_on : "";

  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });
  if (!Number.isFinite(servings) || servings <= 0) {
    return NextResponse.json({ error: "How many servings?" }, { status: 400 });
  }
  if (!isMeal(body.meal)) return NextResponse.json({ error: "Pick a meal." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eatenOn)) {
    return NextResponse.json({ error: "That date is not a date." }, { status: 400 });
  }

  try {
    const recipe = await getRecipe(id);
    if (!recipe) return NextResponse.json({ error: "That recipe is not in the book." }, { status: 404 });

    const line = await resolveItem({ name: recipe.name, quantity: servings, onDate: eatenOn });

    // `known: false` would mean the recipe's own item did not answer, which is a
    // broken link rather than a new food. Estimating over it would put a model's
    // guess in the log under a recipe's name.
    if (!line.known || line.error) {
      return NextResponse.json(
        { error: line.error ?? `"${recipe.name}" has lost the food behind it.` },
        { status: 409 }
      );
    }

    const saved = await saveEntry({
      dictated_text: `${servings} serving${servings === 1 ? "" : "s"} of ${recipe.name}`,
      meal: body.meal,
      eaten_on: eatenOn,
      items: [line],
    });

    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't log that." }, { status: 500 });
  }
}
