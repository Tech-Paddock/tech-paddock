import { NextRequest, NextResponse } from "next/server";
import { tidyList } from "@/lib/anthropic";
import { readList, validateTidy, applyTidy, type TidyLine } from "@/lib/grocery";
import { LookupError } from "@/lib/items";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Propose a tidier list, or apply one you approved.
 *
 * **Two steps, because the draft is not the list.** That is guardrail 1 doing
 * the same job it does for a meal: a model proposes, you look, approving is
 * what writes. Tidying is the one place in this app where a model's output
 * would *remove* something you entered, which is the strongest reason for the
 * approval step rather than the weakest.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const open = (await readList()).filter((i) => !i.checked);
    if (open.length < 2) {
      return NextResponse.json({ error: "Not enough on the list to tidy." }, { status: 422 });
    }

    // Applying an approved proposal. Re-validated here rather than trusted:
    // the browser has had it in its hands.
    if (Array.isArray(body.lines)) {
      const lines: TidyLine[] = body.lines.map((l: Record<string, unknown>) => ({
        name: typeof l.name === "string" ? l.name : "",
        note: typeof l.note === "string" && l.note.trim() ? l.note.trim() : null,
        absorbed: Array.isArray(l.absorbed) ? l.absorbed.filter((x: unknown): x is string => typeof x === "string") : [],
      }));

      const problem = validateTidy(open, lines);
      if (problem) return NextResponse.json({ error: problem }, { status: 422 });

      return NextResponse.json({ items: await applyTidy(open, lines) });
    }

    // Proposing. Nothing is written.
    const proposal = await tidyList(open.map((i) => ({ id: i.id, name: i.name, note: i.note })));
    const problem = validateTidy(open, proposal);
    if (problem) {
      // The model's answer is refused rather than shown — a proposal that drops
      // a line is not a starting point to edit, it is a wrong answer.
      return NextResponse.json({ error: `That tidy was refused. ${problem}` }, { status: 502 });
    }

    return NextResponse.json({ proposal, before: open });
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't tidy that." },
      { status: 500 }
    );
  }
}
