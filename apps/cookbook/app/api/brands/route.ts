import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/respond";
import { readProductDraft } from "@/lib/brands";
import { readProducts, removeProduct, saveProduct } from "@/lib/productStore";
import { readDraft, readPreferences, removePreference, savePreference } from "@/lib/preferences";

export const dynamic = "force-dynamic";

/**
 * Your brands (TEC-131): one row per product code, plus the search-word
 * phrases. **No model call on any verb here.** A batch goes through
 * `/api/brands/preview` (writes nothing) and `/api/brands/import` (the ticked
 * rows); Export is `/api/brands/export`; a successor is taken on
 * `/api/brands/successor`.
 */

export async function GET() {
  try {
    const [products, words] = await Promise.all([readProducts(), readPreferences()]);
    return NextResponse.json({ products, words });
  } catch (e) {
    return errorResponse(e, "Couldn't read your brands.");
  }
}

/**
 * One product from the editor — `id` when it edits that row, whose names are
 * then the whole list — or one set of search words (`kind: "terms"`).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  try {
    if (body.kind === "terms") {
      const read = readDraft(body);
      if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
      return NextResponse.json({ words: await savePreference(read.row) });
    }
    const read = readProductDraft(body);
    if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
    // The editor never sets a count; a batch does.
    delete read.draft.count;
    const id = typeof body.id === "string" && body.id ? body.id : undefined;
    return NextResponse.json({ product: await saveProduct(read.draft, { id }) });
  } catch (e) {
    return errorResponse(e, "Couldn't save that.");
  }
}

/** Forget one product, or one set of search words. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Which one?" }, { status: 400 });
  }
  try {
    if (body.kind === "terms") await removePreference(body.id);
    else await removeProduct(body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't forget that one.");
  }
}
