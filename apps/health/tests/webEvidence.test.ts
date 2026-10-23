import { describe, expect, it } from "vitest";
import { earnedUrl, normalizeUrl, urlsReadIn } from "@/lib/webEvidence";
import { textOf } from "@/lib/anthropic";

/** The web-provenance check, and how an answer's text is read. Invented food only. */

describe("web provenance", () => {
  const content = [
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://www.example.com/menu/nutrition/" }] },
    { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://example.org/fries#table" } },
    { type: "web_fetch_tool_result", content: { type: "web_fetch_tool_error", error_code: "url_not_accessible" } },
    { type: "text", text: "..." },
  ];

  it("reads the pages a run's own tools returned", () => {
    const read = urlsReadIn(content);
    expect(read.has(normalizeUrl("https://example.com/menu/nutrition") as string)).toBe(true);
    expect(read.has(normalizeUrl("https://example.org/fries") as string)).toBe(true);
    expect(read.size).toBe(2);
  });

  it("keeps a cited URL only when this run read it", () => {
    const read = urlsReadIn(content);
    expect(earnedUrl("https://example.org/fries", read)).toBe("https://example.org/fries");
    expect(earnedUrl("https://example.net/made-up", read)).toBeNull();
    expect(earnedUrl("not a url", read)).toBeNull();
    expect(earnedUrl(null, new Set())).toBeNull();
  });
});

describe("textOf", () => {
  it("joins text blocks with nothing, so a citation split mid-JSON still parses", () => {
    const blocks = [
      { type: "text", text: '{"kcal": 4' },
      { type: "web_search_tool_result" },
      { type: "text", text: '90, "protein_g": 6}' },
    ];
    expect(JSON.parse(textOf(blocks))).toEqual({ kcal: 490, protein_g: 6 });
  });
});
