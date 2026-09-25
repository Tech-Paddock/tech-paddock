import { describe, expect, it } from "vitest";
import { judge } from "@/lib/harness";
import { earnedUrl, normalizeUrl, urlsReadIn } from "@/lib/webEvidence";
import { textOf } from "@/lib/anthropic";

/** The debug harness's verdict, and the web-provenance check. Invented food only. */

const stored = { kcal: 600, protein_g: 30, carbs_g: 60, fat_g: 25 };
const close = { kcal: 610, protein_g: 31, carbs_g: 62, fat_g: 24 };
const far = { kcal: 890, protein_g: 30, carbs_g: 60, fat_g: 25 };

describe("judge", () => {
  it("compares each model with the stored number, not only with each other", () => {
    // The two models agree with each other and both miss your number: that is
    // exactly the case the old harness recorded as a match.
    const v = judge(stored, { macros: far }, { macros: far });
    expect(v.agreed).toBe(true);
    expect(v.haikuVsBaseline).toBe(false);
    expect(v.sonnetVsBaseline).toBe(false);
    expect(v.needsPick).toBe(true);
    expect(v.differs.haiku).toEqual(["kcal"]);
  });

  it("asks nothing when both reproduce the stored number", () => {
    const v = judge(stored, { macros: close }, { macros: stored });
    expect(v.needsPick).toBe(false);
    expect([v.haikuVsBaseline, v.sonnetVsBaseline]).toEqual([true, true]);
  });

  it("with nothing stored, falls back to the models against each other", () => {
    expect(judge(null, { macros: stored }, { macros: far }).needsPick).toBe(true);
    expect(judge(null, { macros: stored }, { macros: close }).needsPick).toBe(false);
    expect(judge(null, { macros: stored }, { macros: close }).haikuVsBaseline).toBeNull();
  });

  it("names a failed side and never counts it as agreement or a disagreement", () => {
    const v = judge(null, { error: "timeout" }, { macros: stored });
    expect(v.failed).toEqual(["haiku"]);
    expect(v.agreed).toBe(false);
    expect(v.needsPick).toBe(false);
    expect(v.differs.models).toEqual([]);
  });

  it("still asks when the working side disagrees with the stored number", () => {
    const v = judge(stored, { error: "timeout" }, { macros: far });
    expect(v.haikuVsBaseline).toBeNull();
    expect(v.needsPick).toBe(true);
  });
});

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
