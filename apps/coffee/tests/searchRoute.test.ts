import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const searchBrewGuide = vi.fn(async (_params: Record<string, unknown>) => ({
  guide: { status: "none", product_url: null, guide_url: null, method: null, params: {}, quotes: [], dropped: [] },
  warning: null,
}));

vi.mock("@/lib/anthropic", () => ({ searchBrewGuide: (p: Record<string, unknown>) => searchBrewGuide(p) }));
vi.mock("@/lib/supabase", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/suggestOnBag", () => ({ suggestOnBag: vi.fn() }));

const { POST } = await import("@/app/api/search/route");

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("https://coffee.techpaddock.io/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/search", () => {
  it("ignores a model and effort the caller still sends (TEC-133)", async () => {
    // What an installed copy of the old page with the picker would send.
    for (const [model, effort] of [["claude-haiku-4-5", null], ["claude-sonnet-5", "max"], ["not-a-model", "loudest"]]) {
      searchBrewGuide.mockClear();
      const res = await post({ roaster: "R", coffee_name: "C", model, effort });
      expect(res.status, `${model}/${effort}`).toBe(200);
      const data = await res.json();
      // The response, like the row, records what ran.
      expect(data.model).toBe("claude-sonnet-5-5");
      expect(data.effort).toBe("medium");
      // And nothing about the request reaches the search.
      expect(searchBrewGuide.mock.calls[0][0]).not.toHaveProperty("model");
      expect(searchBrewGuide.mock.calls[0][0]).not.toHaveProperty("effort");
    }
  });
});
