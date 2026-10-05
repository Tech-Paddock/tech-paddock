import { NextRequest, NextResponse } from "next/server";
import { clearMenu, moveOnMenu, readMenu, takeOffMenu } from "@/lib/menu";
import { parseDay } from "@/lib/menuDay";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * On the menu (TEC-39 C). **No POST here**: adding a recipe's ingredients to the
 * list is the only way on, and that is `POST /api/recipes/grocery`.
 */

/** All of it, soonest day first. A failed read is a 503, never an empty menu. */
export async function GET() {
  try {
    return NextResponse.json({ menu: await readMenu() });
  } catch (e) {
    return errorResponse(e, "Couldn't read the menu.");
  }
}

/** Move one to another day: `{ recipe_id, day }`. */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.recipe_id === "string" ? body.recipe_id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });
  const day = parseDay(body.day);
  if (!day) return NextResponse.json({ error: "Which day?" }, { status: 400 });

  try {
    if (!(await moveOnMenu(id, day))) {
      return NextResponse.json({ error: "That recipe isn't on the menu." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't move that on the menu.");
  }
}

/**
 * ✕ — one off the menu, `{ recipe_id }`; or Clear all, `{ all: true }`. Either
 * way nothing else changes. **Clear all has to be asked for by name**, so a body
 * that lost its id is a 400 rather than an empty menu.
 */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  if (body.all === true) {
    try {
      await clearMenu();
      return NextResponse.json({ ok: true });
    } catch (e) {
      return errorResponse(e, "Couldn't clear the menu.");
    }
  }

  const id = typeof body.recipe_id === "string" ? body.recipe_id : "";
  if (!id) return NextResponse.json({ error: "Which recipe?" }, { status: 400 });

  try {
    await takeOffMenu(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't take that off the menu.");
  }
}
