import { NextRequest, NextResponse } from "next/server";
import { tidyList } from "@/lib/anthropic";
import { applyTidy, readList, validateTidy, type TidyLine } from "@/lib/grocery";
import { LookupError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * Consolidating the list, in two steps that cannot be collapsed into one.
 *
 * `POST` proposes; `PUT` applies. **The proposal is shown before it happens**,
 * for the same reason a recipe draft is: a tidy rewrites the list you are about
 * to shop from, and "2 cloves garlic" disappearing into "garlic — 2 cloves and 1
 * tbsp minced" is right where "eggs" disappearing entirely is not, and the two
 * look identical until you read them.
 *
 * **Both steps read the list from the database rather than from the browser.** A
 * proposal validated against what the browser said the list was would happily
 * drop a line added on another device a minute ago.
 */

/** Propose. Reads the open lines, asks for a consolidation, checks it, returns it unapplied. */
export async function POST() {
  try {
    const open = (await readList()).filter((i) => !i.checked);
    if (open.length < 2) {
      return NextResponse.json({ error: "There is nothing to merge yet." }, { status: 400 });
    }

    const lines = await tidyList(open.map((i) => ({ id: i.id, name: i.name, note: i.note })));
    if (lines.length === 0) {
      return NextResponse.json({ error: "Nothing usable came back. Your list is untouched." }, { status: 502 });
    }

    // Checked here as well as on apply, so a proposal that would lose something
    // is never put on the screen for you to approve in the first place.
    const problem = validateTidy(open, lines);
    if (problem) {
      return NextResponse.json({ error: `${problem} Your list is untouched.` }, { status: 422 });
    }

    return NextResponse.json({ open, lines });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't work out a tidier list." },
      { status: 500 }
    );
  }
}

/** Apply an approved proposal, re-validated against the list as it is right now. */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const lines: TidyLine[] = Array.isArray(body.lines)
    ? body.lines
        .map((l: unknown) => {
          const o = (l ?? {}) as { name?: unknown; note?: unknown; absorbed?: unknown };
          return {
            name: typeof o.name === "string" ? o.name.trim() : "",
            note: typeof o.note === "string" && o.note.trim() ? o.note.trim() : null,
            absorbed: Array.isArray(o.absorbed)
              ? o.absorbed.filter((x: unknown): x is string => typeof x === "string")
              : [],
          };
        })
        .filter((l: TidyLine) => l.name.length > 0)
    : [];

  if (lines.length === 0) return NextResponse.json({ error: "Nothing to apply." }, { status: 400 });

  try {
    const open = (await readList()).filter((i) => !i.checked);
    const problem = validateTidy(open, lines);
    // The list moved under the proposal — something was added or ticked off
    // elsewhere. Refusing is right: applying would drop whatever arrived.
    if (problem) {
      return NextResponse.json(
        { error: `${problem} Your list is untouched — try tidying again.` },
        { status: 409 }
      );
    }

    return NextResponse.json({ items: await applyTidy(open, lines) });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Couldn't apply that." }, { status: 500 });
  }
}
