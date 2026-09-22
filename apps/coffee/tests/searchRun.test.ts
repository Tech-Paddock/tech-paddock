import { describe, expect, it } from "vitest";
import { toolErrorsIn, unearnedNone } from "@/lib/searchRun";

describe("toolErrorsIn", () => {
  it("reads an error out of a web_search result block", () => {
    expect(
      toolErrorsIn([
        { type: "text" },
        { type: "web_search_tool_result", content: { error_code: "max_uses_exceeded" } },
      ])
    ).toEqual(["web_search: max_uses_exceeded"]);
  });

  it("reads an error out of a web_fetch result block, whose success shape is also an object", () => {
    expect(toolErrorsIn([{ type: "web_fetch_tool_result", content: { error_code: "url_not_accessible" } }])).toEqual([
      "web_fetch: url_not_accessible",
    ]);
  });

  it("treats a list of search results as the success it is", () => {
    // The two tools disagree about what success looks like, which is why the
    // test is error_code and not the shape.
    expect(toolErrorsIn([{ type: "web_search_tool_result", content: [{ url: "https://x.test" }] }])).toEqual([]);
  });

  it("treats a fetched document as the success it is", () => {
    expect(
      toolErrorsIn([{ type: "web_fetch_tool_result", content: { url: "https://x.test", document: {} } }])
    ).toEqual([]);
  });

  it("collects every failure in the turn, in order", () => {
    expect(
      toolErrorsIn([
        { type: "web_fetch_tool_result", content: { error_code: "url_not_accessible" } },
        { type: "text" },
        { type: "web_search_tool_result", content: { error_code: "too_many_requests" } },
      ])
    ).toEqual(["web_fetch: url_not_accessible", "web_search: too_many_requests"]);
  });

  it("ignores blocks that are not tool results, and malformed ones", () => {
    expect(
      toolErrorsIn([
        { type: "thinking", content: { error_code: "not_a_tool_result" } },
        { type: "web_search_tool_result" },
        { type: "web_search_tool_result", content: null },
        { type: "web_search_tool_result", content: { error_code: "" } },
        { type: "web_search_tool_result", content: { error_code: 7 } },
      ])
    ).toEqual([]);
  });

  it("survives a response with no content rather than throwing mid-search", () => {
    expect(toolErrorsIn([])).toEqual([]);
    expect(toolErrorsIn(undefined as never)).toEqual([]);
  });
});

describe("unearnedNone", () => {
  it("refuses a none that was reached past a failed tool", () => {
    // The whole point: this is the shape that used to be written to the row as
    // "this roaster publishes no brewing instructions".
    expect(unearnedNone("none", ["web_search: max_uses_exceeded"])).toMatch(/could not complete/);
  });

  it("names what failed, so the row says which of the two it was", () => {
    expect(unearnedNone("none", ["web_fetch: url_not_accessible"])).toContain("web_fetch: url_not_accessible");
  });

  it("believes a none that nothing got in the way of", () => {
    expect(unearnedNone("none", [])).toBeNull();
  });

  it("leaves a guide that found something alone, whatever failed along the way", () => {
    // A failure that did not stop the retrieval is not evidence against it,
    // and the quotes are their own evidence.
    expect(unearnedNone("coffee_specific", ["web_fetch: url_not_accessible"])).toBeNull();
    expect(unearnedNone("roaster_generic", ["web_search: too_many_requests"])).toBeNull();
  });
});
