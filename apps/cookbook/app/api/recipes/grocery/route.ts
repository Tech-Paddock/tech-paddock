import { NextRequest, NextResponse } from "next/server";
import { getRecipe, toGroceryList } from "@/lib/recipes";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Put a recipe's ingredients on the shopping list.
 *
 * This is the half of Joel's original ask that had to wait for the book —
 * *"create a grocery list from recipes or random items I add"* — and it is why
 * `grocery_items.source` has an enum value called `recipe`. In Health that value
 * shipped on 2026-09-19 with nothing able to write it, because the book was
 * parked. **This is its writer.**
 *
 * **No model call and no merging here.** The lines go on as written; Tidy on the
 * list is what reconciles "2 cloves garlic" against "1 tbsp minced garlic", and
 * it stays a deliberate tap rather than something that happens to your list
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
    return errorResponse(e, "Couldn't add those to the list.");
  }
}
