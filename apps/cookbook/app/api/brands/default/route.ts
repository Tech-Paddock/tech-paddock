import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/respond";
import { readNames } from "@/lib/brands";
import { readProducts, setDefault } from "@/lib/productStore";
import { ConflictError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * **Make default** from Your brands (TEC-135; `RULES.md`, *Storage*): the
 * product `id` becomes the one default for each of `names`, and every other
 * product gives those names up. Send's Make default tick takes the same path
 * (`setDefault`) after its add. **No model call.**
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const names = readNames(body.names);
  if (typeof body.id !== "string" || !body.id) return NextResponse.json({ error: "Which product?" }, { status: 400 });
  if (!Array.isArray(names)) return NextResponse.json({ error: "Which name is it the default for?" }, { status: 400 });
  try {
    const all = await readProducts();
    const product = all.find((p) => p.id === body.id);
    if (!product) throw new ConflictError("That product is no longer in Your brands.");
    await setDefault(names, product.product_id, all);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't make it the default.");
  }
}
