import { describe, expect, it } from "vitest";
import { validateGuide, type RawGuide } from "@/lib/guide";

const PRODUCT = "https://sweetbloomcoffee.com/products/maria-gutierrez";
const BREW = "https://sweetbloomcoffee.com/pages/brew-guides";

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
    const guide = validateGuide(raw());
    expect(guide.status).toBe("coffee_specific");
    expect(guide.params.ratio).toBe("1:16");
    expect(guide.params.temp).toBe("205F");
    expect(guide.dropped).toHaveLength(0);
  });

  it("drops a parameter with no quote behind it", () => {
    // The failure this whole module exists to stop: a plausible number the
    // page never stated.
    const guide = validateGuide(raw({ params: { ratio: "1:16", temp: "205F", time: "3:00" } }));
    expect(guide.params.time).toBeUndefined();
    expect(guide.dropped).toEqual([{ field: "time", value: "3:00", reason: "no source sentence" }]);
  });

  it("rejects a quote citing a page the model never reported reading", () => {
    const guide = validateGuide(
      raw({ quotes: [{ field: "ratio", text: "Use 1:16.", url: "https://coffeeblog.example/maria" }] })
    );
    expect(guide.params.ratio).toBeUndefined();
  });

  it("refuses instructions read off another site entirely", () => {
    const guide = validateGuide(
      raw({
        guide_url: "https://coffeeblog.example/how-to-brew",
        quotes: [{ field: "ratio", text: "Use 1:16.", url: "https://coffeeblog.example/how-to-brew" }],
      })
    );
    expect(guide.status).toBe("none");
    expect(guide.guide_url).toBeNull();
    expect(guide.dropped.some((d) => d.reason.includes("not the roaster's site"))).toBe(true);
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
      "sweetbloomcoffee.com"
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
      })
    );
    expect(guide.status).toBe("roaster_generic");
  });

  it("normalizes the method from the roaster's own sentence", () => {
    const guide = validateGuide(
      raw({
        params: { method: "filter" },
        quotes: [{ field: "method", text: "Our preferred method is the Hario V60.", url: PRODUCT }],
      })
    );
    expect(guide.method).toBe("v60");
  });

  it("reports none when nothing was backed", () => {
    const guide = validateGuide(raw({ params: { ratio: "1:16" }, quotes: [] }));
    expect(guide.status).toBe("none");
    expect(guide.method).toBeNull();
    expect(guide.params).toEqual({});
  });

  it("never throws on a malformed response", () => {
    for (const bad of [{}, { status: "nonsense" }, { quotes: "not an array" } as unknown as RawGuide]) {
      expect(() => validateGuide(bad as RawGuide)).not.toThrow();
      expect(validateGuide(bad as RawGuide).status).toBe("none");
    }
  });
});
