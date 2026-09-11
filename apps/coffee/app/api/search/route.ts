import { NextRequest, NextResponse } from "next/server";
import { searchBrewGuide } from "@/lib/anthropic";

export const dynamic = "force-dynamic";
// Three tiers of search and fetch at high effort runs well past the default.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const roaster = typeof body.roaster === "string" ? body.roaster.trim() : "";
  const coffeeName = typeof body.coffee_name === "string" ? body.coffee_name.trim() : "";

  if (!roaster || !coffeeName) {
    return NextResponse.json({ error: "A roaster and a coffee name are needed to search." }, { status: 400 });
  }

  try {
    const guide = await searchBrewGuide({
      roaster,
      coffeeName,
      roasterDomain: typeof body.roaster_domain === "string" && body.roaster_domain.trim() ? body.roaster_domain.trim() : null,
    });
    return NextResponse.json({ guide });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The search failed." },
      { status: 502 }
    );
  }
}
