import { NextRequest, NextResponse } from "next/server";
import { readList, addItems, setChecked, removeItems } from "@/lib/grocery";
import { LookupError } from "@/lib/items";

export const dynamic = "force-dynamic";

/** The list. A failed read is a 503, never an empty list. */
export async function GET() {
  try {
    return NextResponse.json({ items: await readList() });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't read the list." }, { status: 500 });
  }
}

/** Add one line, or several. No model call — this is typing. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const raw = Array.isArray(body.items) ? body.items : [body];

  const lines = raw
    .map((l: { name?: unknown; note?: unknown }) => ({
      name: typeof l?.name === "string" ? l.name : "",
      note: typeof l?.note === "string" ? l.note : null,
    }))
    .filter((l: { name: string }) => l.name.trim().length > 0);

  if (lines.length === 0) {
    return NextResponse.json({ error: "Name something to add." }, { status: 400 });
  }
  if (lines.some((l: { name: string }) => l.name.length > 200)) {
    return NextResponse.json({ error: "That is longer than a grocery line." }, { status: 413 });
  }

  try {
    return NextResponse.json({ items: await addItems(lines) }, { status: 201 });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't add that." }, { status: 500 });
  }
}

/** Tick off, or un-tick. */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which line?" }, { status: 400 });
  if (typeof body.checked !== "boolean") {
    return NextResponse.json({ error: "Ticked or not?" }, { status: 400 });
  }

  try {
    await setChecked(id, body.checked);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't change that." }, { status: 500 });
  }
}

/** Remove lines. Deliberate — a tick is how you keep one. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((i: unknown) => typeof i === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Which lines?" }, { status: 400 });

  try {
    await removeItems(ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't remove that." }, { status: 500 });
  }
}
