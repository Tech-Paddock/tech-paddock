import { describe, expect, it } from "vitest";
import {
  concludeSearch,
  reachedUrlsIn,
  readTurn,
  SearchFailed,
  toolErrorsIn,
  toolFailuresIn,
  unearnedNone,
  type ResultBlock,
  type ToolFailure,
} from "@/lib/searchRun";
import { shouldReadImages } from "@/lib/recipeImage";

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


const fail = (tool: "web_search" | "web_fetch", code: string, url: string | null = null): ToolFailure => ({ tool, code, url });

describe("unearnedNone", () => {
  it("refuses a none reached past a service failure", () => {
    // The shape that used to be written to the row as "this roaster
    // publishes no brewing instructions" when the search could not look.
    expect(unearnedNone("none", [fail("web_search", "too_many_requests")])).toMatch(/could not complete/);
    expect(unearnedNone("none", [fail("web_fetch", "unavailable")])).toContain("web_fetch: unavailable");
  });

  it("believes a none past a failure the model caused itself", () => {
    // Refusing these kept the bag `not_searched` forever, and the suggestion
    // refuses a bag in that state — a genuine "no recipe" became a permanent
    // error. The run could recover from each of these, and had the chance to.
    for (const code of ["max_uses_exceeded", "url_not_in_prior_context", "url_not_accessible", "query_too_long"]) {
      expect(unearnedNone("none", [fail("web_fetch", code)])).toBeNull();
    }
  });

  it("treats an error code it does not know as the service's", () => {
    // A code the API grows later is "could not look" until someone reads it.
    expect(unearnedNone("none", [fail("web_search", "some_new_outage")])).toMatch(/could not complete/);
  });

  it("believes a none that nothing got in the way of", () => {
    expect(unearnedNone("none", [])).toBeNull();
  });

  it("leaves a guide that found something alone, whatever failed along the way", () => {
    expect(unearnedNone("coffee_specific", [fail("web_fetch", "unavailable")])).toBeNull();
    expect(unearnedNone("roaster_generic", [fail("web_search", "too_many_requests")])).toBeNull();
  });
});

describe("toolFailuresIn", () => {
  it("names the URL a failed fetch was asked for", () => {
    expect(
      toolFailuresIn([
        { type: "server_tool_use", id: "t1", name: "web_fetch", input: { url: "https://roaster.example/old" } },
        { type: "web_fetch_tool_result", tool_use_id: "t1", content: { error_code: "url_not_accessible" } },
      ])
    ).toEqual([{ tool: "web_fetch", code: "url_not_accessible", url: "https://roaster.example/old" }]);
  });
});

describe("reachedUrlsIn", () => {
  it("collects fetched documents and listed search results, and nothing that failed", () => {
    expect(
      reachedUrlsIn([
        { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.example/1" }] },
        { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://b.example/2" } },
        { type: "web_fetch_tool_result", content: { error_code: "url_not_accessible" } },
        { type: "text", text: "https://c.example/said-but-never-read" },
      ])
    ).toEqual(["https://a.example/1", "https://b.example/2"]);
  });
});

describe("readTurn", () => {
  it("resumes a paused turn", () => {
    expect(readTurn({ stop_reason: "pause_turn", content: [] })).toEqual({ resume: true });
  });

  it("joins a split answer back together exactly as it was cut", () => {
    // Web search splits text at citation boundaries, and a boundary can fall
    // inside a JSON string. A newline there broke JSON.parse.
    const turn = readTurn({
      stop_reason: "end_turn",
      content: [
        { type: "text", text: '{"status":"roaster_generic","quotes":[{"text":"Brew at a 1:' },
        { type: "text", text: '16 ratio."}]}' },
      ],
    });
    expect(turn).toEqual({ resume: false, text: '{"status":"roaster_generic","quotes":[{"text":"Brew at a 1:16 ratio."}]}' });
    expect(() => JSON.parse((turn as { text: string }).text)).not.toThrow();
  });

  it("refuses an answer cut off at max_tokens rather than reading it as none", () => {
    expect(() => readTurn({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"status":"coff' }] })).toThrow(
      SearchFailed
    );
  });

  it("refuses a refusal rather than reading it as none", () => {
    expect(() => readTurn({ stop_reason: "refusal", content: [] })).toThrow(/declined/);
  });

  it("refuses any other stop it was not built for", () => {
    expect(() => readTurn({ stop_reason: "tool_use", content: [] })).toThrow(/unexpected reason \(tool_use\)/);
  });
});

describe("concludeSearch", () => {
  const PRODUCT = "https://roaster.example/products/example-lot";
  const GUIDE = "https://roaster.example/pages/brew";
  /** The name on the bag, which the product page's host has to carry (TEC-68). */
  const ROASTER = "Example Coffee Roasters";
  const conclude = (text: string, blocks: ResultBlock[]) => concludeSearch(text, blocks, ROASTER);

  const answer = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      status: "roaster_generic",
      product_url: PRODUCT,
      guide_url: GUIDE,
      params: { ratio: "1:16" },
      quotes: [{ field: "ratio", text: "We brew at 1:16.", url: GUIDE }],
      ...over,
    });

  const fetched = (url: string, id = url): ResultBlock[] => [
    { type: "server_tool_use", id, name: "web_fetch", input: { url } },
    { type: "web_fetch_tool_result", tool_use_id: id, content: { type: "web_fetch_result", url } },
  ];

  const failedFetch = (url: string, code: string, id = `f-${url}`): ResultBlock[] => [
    { type: "server_tool_use", id, name: "web_fetch", input: { url } },
    { type: "web_fetch_tool_result", tool_use_id: id, content: { error_code: code } },
  ];

  it("keeps a guide read on a page the run fetched", () => {
    const { guide, warning } = conclude(answer(), fetched(GUIDE));
    expect(guide.status).toBe("roaster_generic");
    expect(guide.params.ratio).toBe("1:16");
    expect(warning).toBeNull();
  });

  it("refuses a guide on a site the run never reached, however confidently it is cited", () => {
    const { guide } = conclude(answer(), []);
    expect(guide.status).toBe("none");
    expect(guide.dropped[0].reason).toMatch(/never reached/);
  });

  it("records none with a warning when the model's own fetch failed", () => {
    const { guide, warning } = conclude(
      JSON.stringify({ status: "none", product_url: null }),
      failedFetch("https://roaster.example/x", "url_not_in_prior_context")
    );
    expect(guide.status).toBe("none");
    expect(warning).toMatch(/Recorded as no recipe/);
    expect(warning).toContain("url_not_in_prior_context");
  });

  it("throws, recording nothing, when the service failed under a none", () => {
    expect(() => conclude(JSON.stringify({ status: "none" }), [{ type: "web_search_tool_result", content: { error_code: "unavailable" } }])).toThrow(
      /could not complete/
    );
  });

  it("clears a product link whose page no longer loads", () => {
    // The roaster moved or removed the page. Keeping the link would hand the
    // next search a dead page as a known one, and leave it under "Beans ↗".
    const { guide, warning } = conclude(
      JSON.stringify({ status: "none", product_url: PRODUCT }),
      failedFetch(PRODUCT, "url_not_accessible")
    );
    expect(guide.status).toBe("none");
    expect(guide.product_url).toBeNull();
    expect(warning).toMatch(/link was cleared/);
  });

  it("keeps a product link that did load, even when another fetch failed", () => {
    const { guide } = conclude(JSON.stringify({ status: "none", product_url: PRODUCT }), [
      ...fetched(PRODUCT),
      ...failedFetch("https://roaster.example/other", "url_not_accessible"),
    ]);
    expect(guide.product_url).toBe(PRODUCT);
  });

  it("reads an answer split mid-string once it is rejoined", () => {
    const whole = answer();
    const cut = whole.indexOf("1:16");
    const turn = readTurn({
      stop_reason: "end_turn",
      content: [
        { type: "text", text: whole.slice(0, cut + 2) },
        { type: "text", text: whole.slice(cut + 2) },
      ],
    });
    const { guide } = conclude((turn as { text: string }).text, fetched(GUIDE));
    expect(guide.status).toBe("roaster_generic");
  });

  describe("a retailer's page named as the product page (TEC-68)", () => {
    // A host that does not carry "example", the roaster's one distinctive word.
    const RETAIL = "https://shop.retailer.test/p/lot";

    it("clears it and refuses the guide read on it, though the run reached it", () => {
      const { guide, warning } = conclude(
        answer({ product_url: RETAIL, guide_url: RETAIL, quotes: [{ field: "ratio", text: "We brew at 1:16.", url: RETAIL }] }),
        fetched(RETAIL)
      );
      expect(guide).toMatchObject({ status: "none", product_url: null, guide_url: null, params: {} });
      expect(guide.dropped).toEqual([{ field: "ratio", value: "1:16", reason: expect.stringMatching(/retailer\.test/) }]);
      expect(warning).toMatch(/retailer\.test/);
      // No product page left, so the image read has nothing to read.
      expect(shouldReadImages(guide)).toBe(false);
    });

    it("clears it when nothing was found on it, and says why beside the none", () => {
      const { guide, warning } = conclude(JSON.stringify({ status: "none", product_url: RETAIL }), fetched(RETAIL));
      expect(guide.product_url).toBeNull();
      expect(warning).toMatch(/not kept/);
      expect(shouldReadImages(guide)).toBe(false);
    });

    it("keeps the roaster's own product page, so its images are still read", () => {
      const { guide, warning } = conclude(JSON.stringify({ status: "none", product_url: PRODUCT }), fetched(PRODUCT));
      expect(guide.product_url).toBe(PRODUCT);
      expect(warning).toBeNull();
      expect(shouldReadImages(guide)).toBe(true);
    });
  });
});
