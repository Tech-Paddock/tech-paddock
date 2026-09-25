import { NextRequest, NextResponse } from "next/server";
import { readMenu, takeOffMenu } from "@/lib/menu";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * On the menu (TEC-39 C). **No POST here**: adding a recipe's ingredients to the
 * list is the only way on, and that is `POST /api/recipes/grocery`.
 */

/** The last seven days of it. A failed read is a 503, never an empty week. */
export async function GET() {
  try {
    return NextResponse.json({ menu: await readMenu() });
  } catch (e) {
    return errorResponse(e, "Couldn't read the menu.");
  }
}

/** ✕ — off the menu, and nothing else. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.recipe_id === "string" ? body.recipe_id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });

  try {
    await takeOffMenu(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't take that off the menu.");
  }
}
