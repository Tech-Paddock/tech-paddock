import { describe, expect, it } from "vitest";
import { validateGuide, webHost, type RawGuide } from "@/lib/guide";

const PRODUCT = "https://sweetbloomcoffee.com/products/example-lot";
const BREW = "https://sweetbloomcoffee.com/pages/brew-guides";

/** The hosts a run's tool results showed it reaching — the roaster's site. */
const REACHED = ["sweetbloomcoffee.com"];

function raw(over: Partial<RawGuide> = {}): RawGuide {
  return {
    status: "coffee_specific",
    product_url: PRODUCT,
    guide_url: PRODUCT,
    params: { ratio: "1:16", temp: "205F" },
    quotes: [
      { field: "ratio", text: "We brew this at 1:16.", url: PRODUCT },
      { field: "temp", text: "Water at 205F.", url: PRODUCT },
    ],
    ...over,
  };
}

describe("validateGuide", () => {
  it("keeps parameters that carry a source sentence", () => {
    const guide = validateGuide(raw(), REACHED);
    expect(guide.status).toBe("coffee_specific");
    expect(guide.params.ratio).toBe("1:16");
    expect(guide.params.temp).toBe("205F");
    expect(guide.dropped).toHaveLength(0);
  });

  it("drops a parameter with no quote behind it", () => {
    // The failure this whole module exists to stop: a plausible number the
    // page never stated.
    const guide = validateGuide(raw({ params: { ratio: "1:16", temp: "205F", time: "3:00" } }), REACHED);
    expect(guide.params.time).toBeUndefined();
    expect(guide.dropped).toEqual([{ field: "time", value: "3:00", reason: "no source sentence" }]);
  });

  it("rejects a quote citing a page the model never reported reading", () => {
    const guide = validateGuide(
      raw({ quotes: [{ field: "ratio", text: "Use 1:16.", url: "https://coffeeblog.example/lot" }] }),
      REACHED
    );
    expect(guide.params.ratio).toBeUndefined();
  });

  it("refuses instructions read off another site entirely", () => {
    const guide = validateGuide(
      raw({
        guide_url: "https://coffeeblog.example/how-to-brew",
        quotes: [{ field: "ratio", text: "Use 1:16.", url: "https://coffeeblog.example/how-to-brew" }],
      }),
      [...REACHED, "coffeeblog.example"]
    );
    expect(guide.status).toBe("none");
    expect(guide.guide_url).toBeNull();
    expect(guide.dropped.some((d) => d.reason.includes("not the roaster's site"))).toBe(true);
  });

  it("refuses a guide from a blog when no product page was named at all", () => {
    // Until 2026-09-25 the anchor was the product URL the model reported, and
    // with none there was no host check whatsoever — this went straight in.
    const blog = "https://coffeeblog.example/how-to-brew";
    const guide = validateGuide(
      raw({
        status: "roaster_generic",
        product_url: null,
        guide_url: blog,
        quotes: [{ field: "ratio", text: "Use 1:16.", url: blog }],
        params: { ratio: "1:16" },
      }),
      ["coffeeblog.example"]
    );
    expect(guide.status).toBe("none");
    expect(guide.params).toEqual({});
    expect(guide.dropped).toEqual([
      { field: "ratio", value: "1:16", reason: "no product page was named, so nothing says whose site this is" },
    ]);
  });

  it("refuses a retailer's page, even one the search really reached", () => {
    // The retailer sells the coffee and the model may name its page as the
    // product page; the guide then has to be on that same site, and a guide
    // read off the roaster's site with a retailer's product page does not
    // match either.
    const retailer = "https://beanmarket.example/products/example-lot";
    const guide = validateGuide(
      raw({
        product_url: retailer,
        guide_url: BREW,
        quotes: [{ field: "ratio", text: "We use 1:16.", url: BREW }],
        params: { ratio: "1:16" },
      }),
      [...REACHED, "beanmarket.example"]
    );
    expect(guide.status).toBe("none");
    expect(guide.dropped[0].reason).toMatch(/not the roaster's site/);
  });

  it("refuses a guide on a site this run never reached, whatever the model said", () => {
    const guide = validateGuide(raw(), ["somewhere-else.example"]);
    expect(guide.status).toBe("none");
    expect(guide.dropped.map((d) => d.reason)).toEqual([
      "read from sweetbloomcoffee.com, which this search never reached",
      "read from sweetbloomcoffee.com, which this search never reached",
    ]);
  });

  it("refuses a javascript: URL as either page", () => {
    const evil = "javascript:alert(1)";
    const asGuide = validateGuide(
      raw({ guide_url: evil, quotes: [{ field: "ratio", text: "We brew this at 1:16.", url: evil }], params: { ratio: "1:16" } }),
      REACHED
    );
    expect(asGuide.status).toBe("none");
    expect(asGuide.guide_url).toBeNull();

    const asProduct = validateGuide(raw({ product_url: evil, guide_url: BREW, quotes: [{ field: "ratio", text: "1:16", url: BREW }] }), REACHED);
    expect(asProduct.status).toBe("none");
    expect(asProduct.product_url).toBeNull();
  });

  it("accepts a subdomain of the roaster's site", () => {
    const shop = "https://shop.sweetbloomcoffee.com/pages/brew";
    const guide = validateGuide(
      raw({
        status: "roaster_generic",
        guide_url: shop,
        quotes: [{ field: "ratio", text: "We use 1:16.", url: shop }],
        params: { ratio: "1:16" },
      }),
      ["shop.sweetbloomcoffee.com"]
    );
    expect(guide.status).toBe("roaster_generic");
    expect(guide.params.ratio).toBe("1:16");
  });

  it("demotes a guide read off another page to the roaster's house method", () => {
    // However the model labelled it: if it did not come from this coffee's
    // own page, it is not this coffee's recipe.
    const guide = validateGuide(
      raw({
        status: "coffee_specific",
        guide_url: BREW,
        quotes: [{ field: "ratio", text: "Weigh out 18g.", url: BREW }],
        params: { ratio: "1:16" },
      }),
      REACHED
    );
    expect(guide.status).toBe("roaster_generic");
  });

  it("normalizes the method from the roaster's own sentence", () => {
    const guide = validateGuide(
      raw({
        params: { method: "filter" },
        quotes: [{ field: "method", text: "Our preferred method is the Hario V60.", url: PRODUCT }],
      }),
      REACHED
    );
    expect(guide.method).toBe("v60");
  });

  it("reports none when nothing was backed", () => {
    const guide = validateGuide(raw({ params: { ratio: "1:16" }, quotes: [] }), REACHED);
    expect(guide.status).toBe("none");
    expect(guide.method).toBeNull();
    expect(guide.params).toEqual({});
  });

  it("never throws on a malformed response", () => {
    for (const bad of [{}, { status: "nonsense" }, { quotes: "not an array" } as unknown as RawGuide]) {
      expect(() => validateGuide(bad as RawGuide, REACHED)).not.toThrow();
      expect(validateGuide(bad as RawGuide, REACHED).status).toBe("none");
    }
  });
});

describe("webHost", () => {
  it("reads a web page's host", () => {
    expect(webHost("https://www.SweetBloomCoffee.com/x")).toBe("sweetbloomcoffee.com");
    expect(webHost("http://shop.example/x")).toBe("shop.example");
  });

  it("refuses anything that is not an http(s) page", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "mailto:a@b.example", "ftp://x.example/", "not a url", "", null]) {
      expect(webHost(bad)).toBeNull();
    }
  });
});
