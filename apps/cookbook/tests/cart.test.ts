import { describe, expect, it, vi } from "vitest";
import {
  alreadySent,
  planLine,
  readPicks,
  RepeatSendError,
  sendLines,
  summarize,
  type CartLine,
  type Decision,
} from "@/lib/cart";
import { CHECKOUT_URL, productIdFromUrl } from "@/lib/kingsoopers";
import { readProducts, searchTerm, type Product } from "@/lib/kroger";

/**
 * Send to cart's rules (TEC-90; `RULES.md`, *Send to cart*), with Kroger and the
 * database passed in as fakes. **Kroger is mocked entirely** — no session here
 * can reach it.
 */

const PAGE = "https://www.kingsoopers.com/p/fairlife-2-milk/0085631200203";

function line(over: Partial<CartLine> & { id: string; name: string }): CartLine {
  return { note: null, quantity: 1, sent_at: null, ...over };
}

function product(over: Partial<Product> = {}): Product {
  return {
    productId: "0001111041700",
    upc: "0001111041700",
    description: "Kroger 2% Milk",
    brand: "Kroger",
    size: "1 gal",
    price: 3.49,
    inStock: true,
    url: "https://www.kingsoopers.com/p/kroger-2-milk/0001111041700",
    ...over,
  };
}

describe("a King Soopers product page's number", () => {
  it("is the last path segment of a /p/ page", () => {
    expect(productIdFromUrl(PAGE)).toBe("0085631200203");
  });

  it("is null for a search page, another shop, or a page with no number", () => {
    expect(productIdFromUrl("https://www.kingsoopers.com/q/milk")).toBeNull();
    expect(productIdFromUrl("https://www.example.com/p/milk/0085631200203")).toBeNull();
    expect(productIdFromUrl("https://www.kingsoopers.com/p/milk")).toBeNull();
  });
});

describe("the checkout link (2026-10-20)", () => {
  it("is a fixed constant: King Soopers' cart", () => {
    expect(CHECKOUT_URL).toBe("https://www.kingsoopers.com/cart");
  });
});

describe("what a line becomes", () => {
  const none = (): Decision => null;

  it("a line tied to an exact product in Your brands goes in as-is, with no search", async () => {
    const search = vi.fn();
    const plan = await planLine(
      line({ id: "a", name: "milk" }),
      () => ({ phrase: "milk", kind: "product", url: PAGE, terms: null }),
      search
    );
    expect(plan).toMatchObject({ kind: "exact", upc: "0085631200203" });
    expect(search).not.toHaveBeenCalled();
  });

  it("any other line shows Kroger's top match", async () => {
    const plan = await planLine(line({ id: "a", name: "eggs" }), none, async () => product());
    expect(plan).toMatchObject({ kind: "match", product: { upc: "0001111041700" } });
  });

  it("searches a terms brand's words, not the line's", async () => {
    const search = vi.fn(async () => product());
    await planLine(
      line({ id: "a", name: "milk" }),
      () => ({ phrase: "milk", kind: "terms", url: null, terms: "fairlife 2%" }),
      search
    );
    expect(search).toHaveBeenCalledWith("fairlife 2%");
  });

  it("says so when Kroger has nothing, or the search fails — never a guess", async () => {
    expect(await planLine(line({ id: "a", name: "unicorn" }), none, async () => null)).toMatchObject({ kind: "none" });
    const failed = await planLine(line({ id: "a", name: "eggs" }), none, async () => {
      throw new Error("Kroger's search failed (HTTP 500).");
    });
    expect(failed).toEqual({ kind: "none", reason: "Kroger's search failed (HTTP 500)." });
  });

  it("refuses a search Kroger would refuse: under three characters", () => {
    expect(searchTerm("ox")).toBeNull();
    expect(searchTerm("one two three four five six seven eight nine")).toBe("one two three four five six seven eight");
  });
});

describe("Kroger's product answer", () => {
  it("reads the price (promo first), size, stock and page", () => {
    const [p] = readProducts({
      data: [
        {
          productId: "0001111041700",
          upc: "0001111041700",
          description: "Kroger 2% Milk",
          brand: "Kroger",
          productPageURI: "/p/kroger-2-milk/0001111041700?cid=x",
          items: [{ size: "1 gal", price: { regular: 3.49, promo: 2.99 }, inventory: { stockLevel: "TEMPORARILY_OUT_OF_STOCK" } }],
        },
      ],
    });
    expect(p).toMatchObject({ price: 2.99, size: "1 gal", inStock: false, url: "https://www.kingsoopers.com/p/kroger-2-milk/0001111041700" });
  });

  it("builds a /p/<slug>/<id> page when Kroger gives none", () => {
    const [p] = readProducts({ data: [{ productId: "0001111041700", description: "Kroger 2% Milk", items: [] }] });
    expect(p.url).toBe("https://www.kingsoopers.com/p/kroger-2-milk/0001111041700");
    expect(productIdFromUrl(p.url)).toBe("0001111041700");
  });
});

describe("a send: every line reports added, skipped or failed", () => {
  const open = [
    line({ id: "a", name: "milk", quantity: 2 }),
    line({ id: "b", name: "eggs" }),
    line({ id: "c", name: "bread" }),
    line({ id: "d", name: "butter" }),
  ];

  it("reports all three outcomes, one per open line", async () => {
    const add = vi.fn(async (upc: string) => {
      if (upc === "0000000000003") throw new Error("Kroger refused it (HTTP 400).");
    });
    const outcomes = await sendLines(
      {
        open,
        picks: [
          { id: "a", upc: "0000000000001" },
          { id: "c", upc: "0000000000003" },
        ],
        again: false,
      },
      { add, remember: vi.fn() }
    );

    expect(outcomes.map((o) => [o.id, o.result])).toEqual([
      ["a", "added"],
      ["b", "skipped"],
      ["c", "failed"],
      ["d", "skipped"],
    ]);
    expect(outcomes[2].detail).toMatch(/Kroger refused it/);
    // The quantity is the line's own.
    expect(add).toHaveBeenCalledWith("0000000000001", 2);
    expect(summarize(outcomes)).toBe("1 added, 2 skipped, 1 failed");
  });

  it("a replacement page goes in and is remembered in Your brands under the line's name", async () => {
    const remember = vi.fn(async () => {});
    const add = vi.fn(async () => {});
    const [o] = await sendLines(
      { open: [line({ id: "a", name: "milk" })], picks: [{ id: "a", url: PAGE }], again: false },
      { add, remember }
    );
    expect(remember).toHaveBeenCalledWith("milk", PAGE);
    expect(add).toHaveBeenCalledWith("0085631200203", 1);
    expect(o).toMatchObject({ result: "added" });
    expect(o.detail).toMatch(/Remembered/);
  });

  it("a page that is not a product fails that line and adds nothing for it", async () => {
    const add = vi.fn(async () => {});
    const [o] = await sendLines(
      { open: [line({ id: "a", name: "milk" })], picks: [{ id: "a", url: "https://www.kingsoopers.com/q/milk" }], again: false },
      { add, remember: vi.fn() }
    );
    expect(o.result).toBe("failed");
    expect(add).not.toHaveBeenCalled();
  });

  it("drops a malformed pick rather than guessing, so its line reports skipped", () => {
    expect(readPicks([{ id: "a", upc: "1" }, { nope: true }, { id: "a" }, "x"])).toEqual([{ id: "a", upc: "1" }]);
  });
});

describe("a second send warns and shows what was already sent", () => {
  const open = [
    line({ id: "a", name: "milk", sent_at: "2026-10-19T17:00:00Z" }),
    line({ id: "b", name: "eggs" }),
  ];
  const picks = [
    { id: "a", upc: "0000000000001" },
    { id: "b", upc: "0000000000002" },
  ];

  it("refuses before adding anything, naming the lines already sent", async () => {
    const add = vi.fn(async () => {});
    const attempt = sendLines({ open, picks, again: false }, { add, remember: vi.fn() });
    await expect(attempt).rejects.toBeInstanceOf(RepeatSendError);
    await attempt.catch((e: RepeatSendError) => {
      expect(e.lines.map((l) => l.name)).toEqual(["milk"]);
      expect(e.message).toMatch(/doubles/);
    });
    // Not even the line that was never sent: a half-sent list is what this prevents.
    expect(add).not.toHaveBeenCalled();
  });

  it("sends when the user says again", async () => {
    const add = vi.fn(async () => {});
    const outcomes = await sendLines({ open, picks, again: true }, { add, remember: vi.fn() });
    expect(outcomes.every((o) => o.result === "added")).toBe(true);
  });

  it("does not warn about a sent line that is not being sent", async () => {
    const add = vi.fn(async () => {});
    await sendLines({ open, picks: [{ id: "b", upc: "0000000000002" }], again: false }, { add, remember: vi.fn() });
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("the review lists what was sent, oldest first", () => {
    const lines = [
      line({ id: "x", name: "late", sent_at: "2026-10-20T00:00:00Z" }),
      line({ id: "y", name: "never" }),
      line({ id: "z", name: "early", sent_at: "2026-10-18T00:00:00Z" }),
    ];
    expect(alreadySent(lines).map((l) => l.name)).toEqual(["early", "late"]);
  });
});
