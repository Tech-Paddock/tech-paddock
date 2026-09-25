import { NextRequest, NextResponse } from "next/server";
import { getRecipe, toGroceryList } from "@/lib/recipes";
import { putOnMenu } from "@/lib/menu";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Put a recipe's ingredients on the shopping list — and the recipe on the menu.
 *
 * This is the half of Joel's original ask that had to wait for the book —
 * *"create a grocery list from recipes or random items I add"* — and it is why
 * `grocery_items.source` has an enum value called `recipe`. **This is its
 * writer**, and each line now carries the recipe's name (TEC-39 B).
 *
 * **It is also the only way onto "On the menu"** (TEC-39 C): adding a recipe
 * again restarts its seven days rather than listing it twice.
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

  let added: number;
  try {
    const recipe = await getRecipe(id);
    if (!recipe) return NextResponse.json({ error: "That recipe is not in the book." }, { status: 404 });
    added = await toGroceryList(recipe);
  } catch (e) {
    return errorResponse(e, "Couldn't add those to the list.");
  }

  // **The list is the errand; the menu is a record of it.** The lines are
  // already on the list by here, so a menu that could not be written is reported
  // beside a success rather than as a failure — which would invite a second tap
  // and a second copy of every ingredient.
  try {
    await putOnMenu(id);
    return NextResponse.json({ added, menu: true }, { status: 201 });
  } catch {
    return NextResponse.json({ added, menu: false }, { status: 201 });
  }
}
