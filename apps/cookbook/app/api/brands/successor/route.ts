import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/respond";
import { replaceWithSuccessor } from "@/lib/productStore";

export const dynamic = "force-dynamic";

/**
 * Take the successor a refresh offered for a product Kroger stopped returning
 * (TEC-131). **Only ever on the user's tap**; the names, count and size first
 * bought stay. No Kroger call: the next refresh checks the new code.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Which one?" }, { status: 400 });
  }
  try {
    return NextResponse.json({ product: await replaceWithSuccessor(body.id) });
  } catch (e) {
    return errorResponse(e, "Couldn't replace it.");
  }
}
