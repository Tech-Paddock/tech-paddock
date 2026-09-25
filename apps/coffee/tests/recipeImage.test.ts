import { describe, expect, it } from "vitest";
import {
  chooseRecipe,
  combineReads,
  galleryImagesIn,
  imageGuide,
  isFetchableUrl,
  recipesOnCard,
  shouldReadImages,
  sizedImageUrl,
  type CardImage,
} from "@/lib/recipeImage";
import type { Guide } from "@/lib/guide";
import type { SearchOutcome } from "@/lib/searchRun";

// The case that surfaced TEC-47: Middlestate prints its recipe as a card in
// the product gallery, in two columns, batch and espresso.
const PAGE = "https://www.middlestatecoffee.com/shop/jos-ramirez-guatemala?category=Coffee";
const BAG = "https://images.squarespace-cdn.com/content/v1/ms/bag-front.jpg?format=1500w";
const CARD = "https://images.squarespace-cdn.com/content/v1/ms/recipe-card.jpg?format=1500w";
const IMAGES: CardImage[] = [
  { url: BAG, inGallery: true },
  { url: CARD, inGallery: true },
];

function guide(over: Partial<Guide> = {}): Guide {
  return {
    status: "none",
    product_url: PAGE,
    guide_url: null,
    method: null,
    params: {},
    quotes: [],
    dropped: [],
    ...over,
  };
}

/** A copy-out as the vision call returns it. Every key present, null when not printed. */
function recipe(over: Record<string, unknown> = {}) {
  const blank = Object.fromEntries(
    ["method", "ratio", "dose", "water", "temp", "grind", "time"].flatMap((f) => [
      [f, null],
      [`${f}_printed`, null],
    ])
  );
  return { image: 2, heading: null, ...blank, ...over };
}

const BATCH = recipe({
  heading: "batch",
  method: "Fetco CBS-2032-e",
  method_printed: "brewer: Fetco CBS-2032-e",
  dose: "139.5g",
  dose_printed: "dose 139.5g",
  water: "2300ml",
  water_printed: "2050ml yield (2300ml water in)",
  ratio: "16.5",
  ratio_printed: "ratio 16.5",
  time: "6 min",
  time_printed: "time 6 min",
});

const ESPRESSO = recipe({
  heading: "espresso",
  dose: "22g",
  dose_printed: "22g in",
  ratio: "2.3",
  ratio_printed: "ratio 2.3",
  time: "35 s",
  time_printed: "35 s",
});

// ---------------------------------------------------------------------------

describe("galleryImagesIn", () => {
  const html = `
    <html><head>
      <meta property="og:image" content="https://images.squarespace-cdn.com/content/v1/ms/og.jpg">
      <script>var fake = '<div class="ProductItem-gallery"><img src="https://x.example/in-script.jpg"></div>';</script>
    </head><body>
      <header><img src="/logo.png" alt="Middlestate"></header>
      <!-- <div class="product-gallery"><img src="https://x.example/commented.jpg"></div> -->
      <div class="ProductItem-gallery">
        <div class="ProductItem-gallery-slides">
          <div class="slide"><img data-src="https://images.squarespace-cdn.com/content/v1/ms/bag-front.jpg" src="data:image/gif;base64,R0lGOD"></div>
          <div class="slide"><img data-image="//images.squarespace-cdn.com/content/v1/ms/recipe-card.jpg?format=300w" /></div>
          <div class="slide"><img src="https://images.squarespace-cdn.com/content/v1/ms/bag-front.jpg?format=750w"></div>
          <div class="slide"><img src="javascript:alert(1)"></div>
          <br>
        </div>
      </div>
      <section class="related-products">
        <img src="https://images.squarespace-cdn.com/content/v1/ms/other-coffee-card.jpg">
      </section>
    </body></html>`;

  it("collects the product gallery's images, and nothing outside it", () => {
    expect(galleryImagesIn(html, PAGE).map((i) => i.url)).toEqual([BAG, CARD]);
  });

  it("marks them as this coffee's own gallery", () => {
    expect(galleryImagesIn(html, PAGE).every((i) => i.inGallery)).toBe(true);
  });

  it("stops at the limit", () => {
    const many = `<div class="product-gallery">${Array.from({ length: 9 }, (_, i) => `<img src="/p/${i}.jpg">`).join("")}</div>`;
    const got = galleryImagesIn(many, "https://roaster.example/shop/x");
    expect(got).toHaveLength(6);
    expect(got[0].url).toBe("https://roaster.example/p/0.jpg");
  });

  it("falls back to the page's own og:image when it has no gallery it can recognise", () => {
    const bare = `<head><meta content="https://cdn.example/lot.jpg" property="og:image"></head><body><img src="/logo.png"></body>`;
    expect(galleryImagesIn(bare, "https://roaster.example/shop/x")).toEqual([
      { url: "https://cdn.example/lot.jpg", inGallery: true },
    ]);
  });

  it("finds nothing on a page with neither, rather than reaching for the page's other images", () => {
    expect(galleryImagesIn(`<body><img src="/logo.png"><img src="/team.jpg"></body>`, "https://roaster.example/")).toEqual([]);
  });

  it("reads the largest srcset candidate and decodes entities", () => {
    const got = galleryImagesIn(
      `<div id="product-images"><img srcset="/a.jpg?w=300&amp;h=1 300w, /a.jpg?w=1200&amp;h=1 1200w"></div>`,
      "https://roaster.example/shop/x"
    );
    expect(got.map((i) => i.url)).toEqual(["https://roaster.example/a.jpg?w=1200&h=1"]);
  });

  it("never throws on junk", () => {
    expect(galleryImagesIn("<<<div class='gallery'><img src=>", "not a url")).toEqual([]);
    expect(galleryImagesIn("", PAGE)).toEqual([]);
  });
});

describe("isFetchableUrl", () => {
  it("accepts a public web page", () => {
    expect(isFetchableUrl(PAGE)).toBe(true);
    expect(isFetchableUrl("http://roaster.example:443/x")).toBe(true);
  });

  it("refuses anything the server should not be pointed at", () => {
    for (const bad of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "http://localhost/x",
      "http://127.0.0.1/x",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/x",
      "http://metadata.google.internal/x",
      "http://intranet/x",
      "http://roaster.example:8080/x",
      "",
      null,
    ]) {
      expect(isFetchableUrl(bad)).toBe(false);
    }
  });
});

describe("sizedImageUrl", () => {
  it("asks Squarespace's CDN for a size the vision call can take", () => {
    expect(sizedImageUrl("https://images.squarespace-cdn.com/content/v1/ms/card.jpg")).toBe(
      "https://images.squarespace-cdn.com/content/v1/ms/card.jpg?format=1500w"
    );
    expect(sizedImageUrl("https://images.squarespace-cdn.com/content/v1/ms/card.jpg?format=300w")).toBe(
      "https://images.squarespace-cdn.com/content/v1/ms/card.jpg?format=1500w"
    );
  });

  it("asks Shopify's CDN the same", () => {
    expect(sizedImageUrl("https://cdn.shopify.com/s/files/1/card.jpg?v=12")).toBe(
      "https://cdn.shopify.com/s/files/1/card.jpg?v=12&width=1500"
    );
  });

  it("leaves every other host alone", () => {
    expect(sizedImageUrl("https://roaster.example/card.jpg?x=1")).toBe("https://roaster.example/card.jpg?x=1");
  });
});

describe("shouldReadImages", () => {
  it("reads when the text search came back below tier 1 with a product page", () => {
    expect(shouldReadImages(guide())).toBe(true);
    expect(shouldReadImages(guide({ status: "roaster_generic", guide_url: "https://www.middlestatecoffee.com/brew" }))).toBe(true);
  });

  it("does not read over a tier-1 answer, or with no product page to read", () => {
    expect(shouldReadImages(guide({ status: "coffee_specific", guide_url: PAGE }))).toBe(false);
    expect(shouldReadImages(guide({ product_url: null }))).toBe(false);
    expect(shouldReadImages(guide({ product_url: "http://127.0.0.1/x" }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("recipesOnCard", () => {
  it("reads each column as its own recipe, quoting the page and carrying its image", () => {
    const [batch, espresso] = recipesOnCard({ recipes: [BATCH, ESPRESSO] }, IMAGES, PAGE);
    expect(batch.kind).toBe("filter");
    expect(espresso.kind).toBe("espresso");
    expect(batch.raw.quotes).toContainEqual({ field: "dose", text: "dose 139.5g", url: PAGE, image: CARD });
    expect(batch.raw.params?.dose).toBe("139.5g");
  });

  it("takes a printed column heading as the method when nothing else names one", () => {
    const [r] = recipesOnCard({ recipes: [recipe({ heading: "Batch", dose: "139.5g", dose_printed: "139.5g" })] }, IMAGES, PAGE);
    expect(r.raw.params?.method).toBe("Batch");
    expect(r.raw.quotes).toContainEqual({ field: "method", text: "Batch", url: PAGE, image: CARD });
    expect(r.kind).toBe("filter");
  });

  it("leaves a recipe with no heading and no method as unknown, not filter", () => {
    const [r] = recipesOnCard({ recipes: [recipe({ dose: "20g", dose_printed: "20g" })] }, IMAGES, PAGE);
    expect(r.kind).toBe("unknown");
  });

  it("gives a value no image when it names an image that was not shown", () => {
    const [r] = recipesOnCard({ recipes: [recipe({ image: 9, dose: "20g", dose_printed: "20g" })] }, IMAGES, PAGE);
    expect(r.image).toBeNull();
    expect(r.raw.quotes?.[0]).not.toHaveProperty("image");
  });

  it("never throws on a malformed copy-out", () => {
    for (const junk of [null, undefined, "x", 7, {}, { recipes: "x" }, { recipes: [null, 3, "x"] }]) {
      expect(recipesOnCard(junk, IMAGES, PAGE)).toEqual([]);
    }
  });
});

describe("chooseRecipe", () => {
  const read = (...rs: unknown[]) => recipesOnCard({ recipes: rs }, IMAGES, PAGE);

  it("prefers filter or batch over espresso when the card prints both", () => {
    expect(chooseRecipe(read(ESPRESSO, BATCH))?.raw.params?.dose).toBe("139.5g");
    expect(chooseRecipe(read(BATCH, ESPRESSO))?.raw.params?.dose).toBe("139.5g");
  });

  it("stores espresso when it is the only recipe published", () => {
    expect(chooseRecipe(read(ESPRESSO))?.kind).toBe("espresso");
  });

  it("prefers a recipe it cannot place over one it knows is espresso", () => {
    expect(chooseRecipe(read(ESPRESSO, recipe({ dose: "20g", dose_printed: "20g" })))?.kind).toBe("unknown");
  });

  it("chooses nothing from a card with no values on it", () => {
    expect(chooseRecipe(read(recipe()))).toBeNull();
    expect(chooseRecipe([])).toBeNull();
  });
});

describe("imageGuide", () => {
  const page = { url: PAGE, reachedUrl: PAGE };

  it("stores the batch recipe off Middlestate's card as tier 1, the card beside every value", () => {
    const { guide: g, espresso } = imageGuide({ recipes: [BATCH, ESPRESSO] }, page, IMAGES);
    expect(g.status).toBe("coffee_specific");
    expect(g.method).toBe("batch");
    expect(g.params).toEqual({ dose: "139.5g", water: "2300ml", ratio: "16.5", time: "6 min" });
    expect(g.product_url).toBe(PAGE);
    expect(g.guide_url).toBe(PAGE);
    expect(g.quotes.every((q) => q.image === CARD && q.url === PAGE)).toBe(true);
    expect(espresso).toBe(false);
  });

  it("does not record the recipe it did not choose as a dropped value", () => {
    const { guide: g } = imageGuide({ recipes: [BATCH, ESPRESSO] }, page, IMAGES);
    expect(g.dropped).toEqual([]);
  });

  it("drops a value the card was not seen to print", () => {
    const { guide: g } = imageGuide({ recipes: [{ ...BATCH, temp: "94C", temp_printed: null }] }, page, IMAGES);
    expect(g.params.temp).toBeUndefined();
    expect(g.dropped).toContainEqual({ field: "temp", value: "94C", reason: "no source sentence" });
  });

  it("refuses a page that redirected off the roaster's site", () => {
    const { guide: g } = imageGuide({ recipes: [BATCH] }, { url: PAGE, reachedUrl: "https://parked-domain.example/" }, IMAGES);
    expect(g.status).toBe("none");
    expect(g.product_url).toBe(PAGE);
  });

  it("is a none with the product page kept when the card has no recipe", () => {
    const { guide: g } = imageGuide({ recipes: [] }, page, IMAGES);
    expect(g.status).toBe("none");
    expect(g.product_url).toBe(PAGE);
    expect(g.dropped).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("combineReads", () => {
  const textNone: SearchOutcome = { guide: guide(), warning: null };
  const found = imageGuide({ recipes: [BATCH, ESPRESSO] }, { url: PAGE, reachedUrl: PAGE }, IMAGES);

  it("takes an image recipe over a text none", () => {
    const out = combineReads(textNone, { kind: "read", ...found });
    expect(out.guide.status).toBe("coffee_specific");
    expect(out.warning).toBeNull();
  });

  it("drops the text run's no-recipe warning once the image found one", () => {
    const out = combineReads({ ...textNone, warning: "Recorded as no recipe, though …" }, { kind: "read", ...found });
    expect(out.warning).toBeNull();
  });

  it("keeps the text run's dropped values beside the image's", () => {
    const withDropped = { guide: guide({ dropped: [{ field: "grind" as const, value: "fine", reason: "no source sentence" }] }), warning: null };
    expect(combineReads(withDropped, { kind: "read", ...found }).guide.dropped).toContainEqual({
      field: "grind",
      value: "fine",
      reason: "no source sentence",
    });
  });

  it("takes a tier-1 image recipe over a tier-2 text one", () => {
    const generic: SearchOutcome = {
      guide: guide({ status: "roaster_generic", guide_url: "https://www.middlestatecoffee.com/brew", method: "v60", params: { ratio: "1:16" } }),
      warning: null,
    };
    expect(combineReads(generic, { kind: "read", ...found }).guide.status).toBe("coffee_specific");
  });

  it("keeps a filter recipe from the text search over an espresso-only card", () => {
    const generic: SearchOutcome = {
      guide: guide({ status: "roaster_generic", guide_url: "https://www.middlestatecoffee.com/brew", method: "v60", params: { ratio: "1:16" } }),
      warning: null,
    };
    const espressoOnly = imageGuide({ recipes: [ESPRESSO] }, { url: PAGE, reachedUrl: PAGE }, IMAGES);
    expect(espressoOnly.espresso).toBe(true);
    const out = combineReads(generic, { kind: "read", ...espressoOnly });
    expect(out.guide.status).toBe("roaster_generic");
    expect(out.guide.params.ratio).toBe("1:16");
  });

  it("keeps the text answer when the image read found nothing better", () => {
    const nothing = imageGuide({ recipes: [] }, { url: PAGE, reachedUrl: PAGE }, IMAGES);
    expect(combineReads(textNone, { kind: "read", ...nothing })).toEqual(textNone);
    expect(combineReads(textNone, { kind: "skipped" })).toEqual(textNone);
  });

  it("says so beside the answer when the images could not be read", () => {
    // An empty result and an unread result must not render the same: a none
    // recorded without reading the card is not the same none.
    const out = combineReads(textNone, { kind: "failed", message: "the product page returned 503" });
    expect(out.guide).toEqual(textNone.guide);
    expect(out.warning).toMatch(/images.*could not be read.*503/);
  });

  it("keeps an earlier warning and adds the image failure to it", () => {
    const out = combineReads({ ...textNone, warning: "Recorded as no recipe, though X." }, { kind: "failed", message: "Y" });
    expect(out.warning).toMatch(/^Recorded as no recipe, though X\. .*Y/);
  });
});
