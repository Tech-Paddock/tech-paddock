import { describe, expect, it, vi } from "vitest";
import {
  alreadySent,
  planLine,
  readPicks,
  RepeatSendError,
  sendLines,
  summarize,
  type Candidate,
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

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: "p1",
    upc: "0085631200203",
    url: PAGE,
    count: 0,
    missing: false,
    description: "fairlife 2% Milk",
    size: "52 fl oz",
    sizeFirst: "52 fl oz",
    price: 4.99,
    names: ["milk"],
    ...over,
  };
}

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
    regular: 3.49,
    promo: null,
    promoEnds: null,
    aisle: null,
    pickup: true,
    delivery: true,
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
      () => ({ kind: "products", via: "name", name: "milk", candidates: [candidate()] }),
      search
    );
    expect(plan).toMatchObject({ kind: "exact", upc: "0085631200203", via: "name" });
    expect(search).not.toHaveBeenCalled();
  });

  it("a line matching several products and no default is Pick one, in the order given (most counted first)", async () => {
    const search = vi.fn();
    const a = candidate({ id: "a", upc: "0000000000011", url: "https://www.kingsoopers.com/p/a/0000000000011", count: 9 });
    const b = candidate({ id: "b", upc: "0000000000022", url: "https://www.kingsoopers.com/p/b/0000000000022", count: 2 });
    const plan = await planLine(line({ id: "x", name: "coke" }), () => ({ kind: "products", via: "name", name: "coke", candidates: [a, b] }), search);
    expect(plan).toMatchObject({ kind: "settle", options: [{ upc: "0000000000011" }, { upc: "0000000000022" }] });
    expect(search).not.toHaveBeenCalled();
  });

  it("searches the item alone when nothing in Your brands decides the line (TEC-131)", async () => {
    const search = vi.fn(async () => [product()]);
    await planLine(line({ id: "a", name: "6 cloves of garlic" }), none, search);
    expect(search).toHaveBeenCalledWith("garlic cloves");
  });

  it("any other line shows Kroger's top match", async () => {
    const plan = await planLine(line({ id: "a", name: "eggs" }), none, async () => [product()]);
    expect(plan).toMatchObject({ kind: "match", product: { upc: "0001111041700" } });
  });

  it("searches a terms brand's words, not the line's", async () => {
    const search = vi.fn(async () => [product()]);
    await planLine(
      line({ id: "a", name: "milk" }),
      () => ({ kind: "terms", phrase: "milk", terms: "fairlife 2%" }),
      search
    );
    expect(search).toHaveBeenCalledWith("fairlife 2%");
  });

  it("says so when Kroger has nothing, or the search fails — never a guess", async () => {
    expect(await planLine(line({ id: "a", name: "unicorn" }), none, async () => [])).toMatchObject({ kind: "none" });
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
    expect(add).toHaveBeenCalledWith("0000000000001", 2, null);
    expect(summarize(outcomes)).toBe("1 added, 2 skipped, 1 failed");
  });

  it("a replacement page goes in and is remembered in Your brands under the line's name", async () => {
    const order: string[] = [];
    const remember = vi.fn(async () => {
      order.push("remember");
    });
    const add = vi.fn(async () => {
      order.push("add");
    });
    const [o] = await sendLines(
      { open: [line({ id: "a", name: "milk" })], picks: [{ id: "a", url: PAGE }], again: false },
      { add, remember }
    );
    expect(remember).toHaveBeenCalledWith("milk", PAGE, "0085631200203", null);
    expect(add).toHaveBeenCalledWith("0085631200203", 1, null);
    // Saved only once the add went in (TEC-128).
    expect(order).toEqual(["add", "remember"]);
    expect(o).toMatchObject({ result: "added", upc: "0085631200203" });
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

describe("whatever goes in for an unmatched line is remembered in Your brands (TEC-128)", () => {
  const MATCH = product().url;
  const UPC = product().upc;

  it("a tapped top match is remembered as its page, under the line's name, after the add", async () => {
    const order: string[] = [];
    const add = vi.fn(async () => {
      order.push("add");
    });
    const remember = vi.fn(async () => {
      order.push("remember");
    });
    const [o] = await sendLines(
      { open: [line({ id: "a", name: "milk", note: "the small tin" })], picks: [{ id: "a", upc: UPC, match: MATCH }], again: false },
      { add, remember }
    );
    expect(add).toHaveBeenCalledWith(UPC, 1, null);
    expect(remember).toHaveBeenCalledWith("milk", MATCH, UPC, null);
    expect(order).toEqual(["add", "remember"]);
    expect(o).toMatchObject({ result: "added", upc: UPC });
    expect(o.detail).toBe("Added ×1. Remembered in Your brands.");
  });

  it("an exact brand sends no match page, so nothing is re-saved", async () => {
    const remember = vi.fn(async () => {});
    const [o] = await sendLines(
      { open: [line({ id: "a", name: "milk" })], picks: [{ id: "a", upc: UPC }], again: false },
      { add: vi.fn(async () => {}), remember }
    );
    expect(remember).not.toHaveBeenCalled();
    expect(o.detail).toBe("Added ×1.");
  });

  it("a failed add saves nothing — match or replacement", async () => {
    const remember = vi.fn(async () => {});
    const add = vi.fn(async () => {
      throw new Error("Kroger refused it (HTTP 500).");
    });
    const outcomes = await sendLines(
      {
        open: [line({ id: "a", name: "milk" }), line({ id: "b", name: "eggs" })],
        picks: [
          { id: "a", upc: UPC, match: MATCH },
          { id: "b", url: PAGE },
        ],
        again: false,
        modality: "PICKUP",
      },
      { add, remember }
    );
    expect(outcomes.map((o) => o.result)).toEqual(["failed", "failed"]);
    expect(outcomes.every((o) => !/remember/i.test(o.detail))).toBe(true);
    expect(remember).not.toHaveBeenCalled();
  });

  it("a failed save is said on the line and never undoes or hides the add", async () => {
    const remember = vi.fn(async () => {
      throw new Error("Couldn't save that preference: connection reset.");
    });
    const [o] = await sendLines(
      { open: [line({ id: "a", name: "milk" })], picks: [{ id: "a", upc: UPC, match: MATCH }], again: false },
      { add: vi.fn(async () => {}), remember }
    );
    expect(o).toMatchObject({ result: "added", upc: UPC });
    expect(o.detail).toBe("Added ×1. Couldn't remember it in Your brands (Couldn't save that preference: connection reset) — save it there by hand.");
  });

  it("a line that went in without Pickup/Delivery is still remembered", async () => {
    const { KrogerError } = await import("@/lib/kroger");
    const add = vi.fn(async (_upc: string, _q: number, m: unknown) => {
      if (m) throw new KrogerError("Kroger refused it (HTTP 400).", 400);
    });
    const remember = vi.fn(async () => {});
    const [o] = await sendLines(
      { open: [line({ id: "a", name: "milk" })], picks: [{ id: "a", upc: UPC, match: MATCH }], again: false, modality: "DELIVERY" },
      { add, remember }
    );
    expect(o).toMatchObject({ result: "added", withoutModality: true });
    expect(remember).toHaveBeenCalledWith("milk", MATCH, UPC, null);
    expect(o.detail).toMatch(/Kroger refused the choice\. Remembered in Your brands\.$/);
  });

  it("a match page naming a different product is not remembered, and the add still stands", async () => {
    const remember = vi.fn(async () => {});
    const [o] = await sendLines(
      { open: [line({ id: "a", name: "milk" })], picks: [{ id: "a", upc: UPC, match: PAGE }], again: false },
      { add: vi.fn(async () => {}), remember }
    );
    expect(remember).not.toHaveBeenCalled();
    expect(o).toMatchObject({ result: "added", upc: UPC });
    expect(o.detail).toMatch(/Not remembered in Your brands/);
  });

  it("a pick keeps the match page only beside a product number, and a pasted page wins", () => {
    expect(
      readPicks([
        { id: "a", upc: UPC, match: MATCH },
        { id: "b", url: PAGE, upc: UPC, match: MATCH },
        { id: "c", match: MATCH },
      ])
    ).toEqual([{ id: "a", upc: UPC, match: MATCH }, { id: "b", url: PAGE }, { id: "c" }]);
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
