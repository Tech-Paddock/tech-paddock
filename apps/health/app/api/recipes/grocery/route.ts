import { NextRequest, NextResponse } from "next/server";
import { getRecipe, toGroceryList } from "@/lib/recipes";
import { LookupError } from "@/lib/items";

export const dynamic = "force-dynamic";

/**
 * Put a recipe's ingredients on the grocery list.
 *
 * This is the half of Joel's original ask that had to wait for the book —
 * *"create a grocery list from recipes or random items I add"* — and it is why
 * `grocery_items.source` has carried a `recipe` value with no writer since
 * `20260919220112`.
 *
 * **No model call and no merging here.** The lines go on as written; `Tidy` on
 * the list is what reconciles "2 cloves garlic" against "1 tbsp minced garlic",
 * and it stays a deliberate tap rather than something that happens to your list
 * because you added a recipe to it.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });

  try {
    const recipe = await getRecipe(id);
    if (!recipe) return NextResponse.json({ error: "That recipe is not in the book." }, { status: 404 });

    const added = await toGroceryList(recipe);
    return NextResponse.json({ added }, { status: 201 });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't add those to the list." }, { status: 500 });
  }
}
