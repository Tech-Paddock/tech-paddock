import { describe, expect, it } from "vitest";
import { anchorOnRoaster, bearsRoasterName, validateGuide, webHost, type RawGuide } from "@/lib/guide";

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

// TEC-46: a value read off a roaster's image reaches guide_* on the same terms
// as a sentence — the text read off the image is the quote, the page is its
// URL — and on one more: the image itself is stored beside it, to be shown.
describe("validateGuide, for values read off an image", () => {
  const PAGE = "https://www.middlestatecoffee.com/shop/jos-ramirez-guatemala";
  const CARD = "https://images.squarespace-cdn.com/content/v1/abc/recipe-card.jpg?format=1500w";
  const ELSEWHERE = "https://images.squarespace-cdn.com/content/v1/abc/about-us.jpg?format=1500w";
  const IN_GALLERY = [{ url: CARD, inGallery: true }];

  function card(over: Partial<RawGuide> = {}): RawGuide {
    return {
      status: "coffee_specific",
      product_url: PAGE,
      guide_url: PAGE,
      params: { dose: "139.5g", water: "2300ml" },
      quotes: [
        { field: "dose", text: "dose 139.5g", url: PAGE, image: CARD },
        { field: "water", text: "water 2300ml", url: PAGE, image: CARD },
      ],
      ...over,
    };
  }

  it("keeps a value read off an image in this coffee's gallery, with the image beside its quote", () => {
    const guide = validateGuide(card(), ["middlestatecoffee.com"], IN_GALLERY);
    expect(guide.status).toBe("coffee_specific");
    expect(guide.params).toEqual({ dose: "139.5g", water: "2300ml" });
    expect(guide.quotes.map((q) => q.image)).toEqual([CARD, CARD]);
    expect(guide.dropped).toEqual([]);
  });

  it("checks the page for the roaster's site, not the image's CDN host", () => {
    // The card lives on Squarespace's CDN; the roaster's site is the page.
    expect(validateGuide(card(), ["middlestatecoffee.com"], IN_GALLERY).status).toBe("coffee_specific");
    const onRetailer = card({
      product_url: "https://retailer.example/p/ramirez",
      guide_url: "https://retailer.example/p/ramirez",
      quotes: [{ field: "dose", text: "dose 139.5g", url: "https://retailer.example/p/ramirez", image: CARD }],
    });
    // A page that was not reached is refused, whatever its image.
    expect(validateGuide(onRetailer, ["middlestatecoffee.com"], IN_GALLERY).status).toBe("none");
  });

  it("drops a value whose quote has no image to show", () => {
    const guide = validateGuide(
      card({
        quotes: [
          { field: "dose", text: "dose 139.5g", url: PAGE, image: CARD },
          { field: "water", text: "water 2300ml", url: PAGE },
        ],
      }),
      ["middlestatecoffee.com"],
      IN_GALLERY
    );
    expect(guide.params).toEqual({ dose: "139.5g" });
    expect(guide.dropped).toEqual([{ field: "water", value: "2300ml", reason: expect.stringMatching(/image/) }]);
  });

  it("drops a value citing an image that was never read", () => {
    const guide = validateGuide(
      card({ quotes: [{ field: "dose", text: "dose 139.5g", url: PAGE, image: "https://evil.example/x.jpg" }] }),
      ["middlestatecoffee.com"],
      IN_GALLERY
    );
    expect(guide.status).toBe("none");
    expect(guide.dropped.map((d) => d.field).sort()).toEqual(["dose", "water"]);
  });

  it("earns tier 1 only from an image in this coffee's own gallery", () => {
    const guide = validateGuide(
      card({
        quotes: [
          { field: "dose", text: "dose 139.5g", url: PAGE, image: ELSEWHERE },
          { field: "water", text: "water 2300ml", url: PAGE, image: ELSEWHERE },
        ],
      }),
      ["middlestatecoffee.com"],
      [{ url: ELSEWHERE, inGallery: false }]
    );
    expect(guide.status).toBe("roaster_generic");
    expect(guide.params.dose).toBe("139.5g");
  });

  it("never lets a text search claim an image", () => {
    // Only the image reader sets `image`. A text answer carrying one would put
    // an arbitrary picture beside a sentence, as though it were the evidence.
    const guide = validateGuide(
      raw({ quotes: [{ field: "ratio", text: "We brew this at 1:16.", url: PRODUCT, image: "https://evil.example/x.jpg" }] }),
      REACHED
    );
    expect(guide.params.ratio).toBe("1:16");
    expect(guide.quotes[0]).not.toHaveProperty("image");
  });
});

// TEC-68: the product page is the anchor every other site check is made
// against, so it needs a check of its own. A retailer's page named as the
// product page used to pass, and since TEC-47 its gallery would be read too.
describe("bearsRoasterName", () => {
  it("accepts the roaster's own site under the usual naming", () => {
    const cases: [string, string][] = [
      ["Sweet Bloom Coffee Roasters", "https://sweetbloomcoffee.com/products/x"],
      ["Middlestate Coffee", "https://www.middlestatecoffee.com/shop/jos-ramirez-guatemala"],
      ["Onyx Coffee Lab", "https://onyxcoffeelab.com/products/x"],
      ["The Barn", "https://thebarn.de/products/x"],
      ["Black & White Coffee Roasters", "https://www.blackwhiteroasters.com/products/x"],
      ["La Cabra", "https://lacabra.dk/products/x"],
      ["Hydrangea", "https://hydrangea.coffee/products/x"],
      ["Heart Coffee Roasters", "https://www.heartroasters.com/products/x"],
      ["SWEETBLOOM", "https://shop.sweetbloomcoffee.com/x"],
      ["Joe's Coffee", "https://joescoffee.example/x"],
      ["Café Grumpy", "https://cafegrumpy.com/x"],
    ];
    for (const [roaster, url] of cases) expect(bearsRoasterName(url, roaster), `${roaster} @ ${url}`).toBe(true);
  });

  it("refuses a retailer's page, however it is described", () => {
    expect(bearsRoasterName("https://www.drinktrade.com/sweet-bloom-hometown", "Sweet Bloom Coffee Roasters")).toBe(false);
    expect(bearsRoasterName("https://www.amazon.com/Sweet-Bloom-Coffee/dp/B0", "Sweet Bloom")).toBe(false);
  });

  it("needs every word of the name, not one of them", () => {
    // "Sweet" alone is in a green-coffee retailer's host.
    expect(bearsRoasterName("https://www.sweetmarias.com/x", "Sweet Bloom")).toBe(false);
  });

  it("refuses when the name has nothing left to match once the filler is gone", () => {
    expect(bearsRoasterName("https://coffee.example/x", "Coffee Roasters Co.")).toBe(false);
    expect(bearsRoasterName("https://coffee.example/x", "")).toBe(false);
  });

  it("refuses what is not a web page", () => {
    expect(bearsRoasterName("javascript:alert('sweetbloom')", "Sweet Bloom")).toBe(false);
    expect(bearsRoasterName(null, "Sweet Bloom")).toBe(false);
  });
});

describe("anchorOnRoaster", () => {
  const RETAIL = "https://www.drinktrade.com/sweet-bloom-hometown";

  it("leaves a guide whose product page is on the roaster's site untouched", () => {
    const guide = validateGuide(raw(), REACHED);
    expect(anchorOnRoaster(guide, "Sweet Bloom Coffee Roasters")).toEqual({ guide, refusal: null });
  });

  it("leaves a guide with no product page alone", () => {
    const guide = validateGuide(raw({ product_url: null }), REACHED);
    expect(anchorOnRoaster(guide, "Sweet Bloom")).toEqual({ guide, refusal: null });
  });

  it("clears a retailer's product page, and refuses every value read on its site", () => {
    const guide = validateGuide(
      raw({
        product_url: RETAIL,
        guide_url: RETAIL,
        params: { method: "V60", ratio: "1:16" },
        quotes: [
          { field: "method", text: "Brew on a V60.", url: RETAIL },
          { field: "ratio", text: "We brew this at 1:16.", url: RETAIL },
        ],
      }),
      ["drinktrade.com"]
    );
    // What validateGuide alone let through: a retailer, reached and quoted.
    expect(guide.status).toBe("coffee_specific");

    const { guide: anchored, refusal } = anchorOnRoaster(guide, "Sweet Bloom Coffee Roasters");
    expect(refusal).toMatch(/drinktrade\.com/);
    expect(anchored).toMatchObject({ status: "none", product_url: null, guide_url: null, method: null, params: {}, quotes: [] });
    // Surfaced beside the answer, never silently discarded.
    expect(anchored.dropped).toEqual([
      { field: "method", value: "v60", reason: refusal },
      { field: "ratio", value: "1:16", reason: refusal },
    ]);
  });

  it("keeps what was already dropped", () => {
    const guide = validateGuide(
      raw({ product_url: RETAIL, guide_url: RETAIL, params: { ratio: "1:16", time: "3:00" }, quotes: [{ field: "ratio", text: "1:16", url: RETAIL }] }),
      ["drinktrade.com"]
    );
    const { guide: anchored } = anchorOnRoaster(guide, "Sweet Bloom");
    expect(anchored.dropped.map((d) => d.field)).toEqual(["time", "ratio"]);
  });

  it("clears a retailer's product page even when nothing was found on it", () => {
    const guide = validateGuide({ status: "none", product_url: RETAIL }, ["drinktrade.com"]);
    const { guide: anchored, refusal } = anchorOnRoaster(guide, "Sweet Bloom");
    expect(anchored.product_url).toBeNull();
    expect(anchored.dropped).toEqual([]);
    expect(refusal).not.toBeNull();
  });
});
