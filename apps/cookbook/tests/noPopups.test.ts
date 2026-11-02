import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { confirmWords, guessPick, guessPicks, needsSplash, pickOf, pickerOptions } from "@/lib/cartGuess";
import { tickedLast } from "@/lib/listOrder";
import { reconcile, refreshCart, type CartRefreshDeps } from "@/lib/cartRefresh";
import { sendLines, type Candidate, type CartLine, type Plan, type ReviewLine } from "@/lib/cart";
import { takeBack, takeBackLines, type SendRow, type TakeBackDeps } from "@/lib/takeBack";
import type { Product } from "@/lib/kroger";

/**
 * The grocery list with no pop-up lists (TEC-206; owner, 2026-11-02). **Kroger is
 * mocked**: nothing here calls it, and every product and code is made up.
 */

const A = "0009990000001";
const B = "0009990000002";
const C = "0009990000003";

function candidate(upc: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id: `id-${upc}`,
    upc,
    url: `https://www.kingsoopers.com/p/test/${upc}`,
    count: 0,
    missing: false,
    description: `Test ${upc}`,
    size: "12 ct",
    sizeFirst: null,
    price: 3,
    names: ["english muffins"],
    ...over,
  };
}

function product(upc: string, over: Partial<Product> = {}): Product {
  return {
    productId: upc,
    upc,
    description: `Kroger ${upc}`,
    brand: null,
    size: "1 ct",
    price: 2,
    regular: 2,
    promo: null,
    promoEnds: null,
    pickup: true,
    delivery: true,
    inStock: true,
    url: `https://www.kingsoopers.com/p/kroger/${upc}`,
    aisle: null,
    ...over,
  };
}

const exact = (upc: string): Plan => {
  const option = candidate(upc);
  return { kind: "exact", upc, url: option.url, phrase: "milk", missing: false, via: "name", option, chosen: "one", options: [option], matched: "milk" };
};
const settle = (): Plan => ({ kind: "settle", phrase: "english muffins", via: "name", options: [candidate(A, { count: 8 }), candidate(B, { count: 4 })], matched: "english muffins" });
const match = (): Plan => ({ kind: "match", product: product(C, { size: "6 oz" }) });
const none = (): Plan => ({ kind: "none", reason: "Kroger has no match at your store." });

function review(id: string, plan: Plan, over: Partial<ReviewLine> = {}): ReviewLine {
  return { id, name: id, note: null, quantity: 1, sent_at: null, plan, ...over };
}

describe("the confirm says a count and never a list", () => {
  it("asks once per action with how many", () => {
    expect(confirmWords("remove", 1).ask).toBe("Take 1 out of the cart?");
    expect(confirmWords("clear-cart", 5).ask).toBe("Clear the cart? 5 items come out.");
    expect(confirmWords("tidy", 9).ask).toBe("Tidy 9 lines?");
    expect(confirmWords("clear-ticked", 2).ask).toBe("Clear 2 ticked?");
    expect(confirmWords("clear-all", 7).ask).toBe("Clear all 7?");
  });

  it("takes only a count: no names go into any question", () => {
    expect(confirmWords.length).toBe(2);
  });

  it("the screens ask through it and keep no review, proposal or take-back list", () => {
    const read = (f: string) => readFileSync(resolve(__dirname, f), "utf8");
    const list = read("../app/List.tsx");
    const cart = read("../app/Cart.tsx");
    // TEC-211: adds (+ Cart, Send all) never ask; taking out, tidying and clearing still do.
    for (const kind of ["tidy", "clear-ticked", "clear-all", "clear-cart"]) expect(list).toContain(`"${kind}"`);
    expect(list).toMatch(/confirmWords\("remove"/);
    expect(list).not.toMatch(/confirmWords\("add"|setConfirm\("send"\)|confirm === "send"/);
    expect(list).not.toMatch(/proposal/i);
    expect(list).not.toMatch(/TakeBackConfirm/);
    expect(cart).not.toMatch(/ReviewRow|SendView|Back to the list|TakeBackConfirm|Pick one|Not saved yet/);
    // The owner's words: the King Soopers app is only for checkout, so nothing says it hides adds.
    expect(list).not.toMatch(/added in the King Soopers app/);
  });
});

describe("best-guess Send", () => {
  it("one saved product or the default goes in as it is, with no page to remember", () => {
    expect(guessPick(review("milk", exact(A)))).toEqual({ id: "milk", upc: A });
  });

  it("several saved products and no default: the most-bought goes in, and is remembered", () => {
    expect(guessPick(review("muffins", settle()))).toEqual({ id: "muffins", upc: A, match: `https://www.kingsoopers.com/p/test/${A}` });
  });

  it("nothing saved: Kroger's top match goes in, with its size for Your brands", () => {
    expect(guessPick(review("kale", match()))).toEqual({ id: "kale", upc: C, match: `https://www.kingsoopers.com/p/kroger/${C}`, size: "6 oz" });
  });

  it("nothing to add is still sent along with no product, so the server reports it", () => {
    expect(guessPick(review("zzz", none()))).toEqual({ id: "zzz" });
  });

  it("never offers a line already in the cart", () => {
    const picks = guessPicks([review("a", exact(A)), review("b", exact(B), { sent_at: "2026-11-01T00:00:00Z" })]);
    expect(picks.map((p) => p.id)).toEqual(["a"]);
  });

  it("sends every line in one go, remembering what went in, and every line reports", async () => {
    const lines: ReviewLine[] = [review("milk", exact(A)), review("muffins", settle()), review("kale", match()), review("zzz", none())];
    const open: CartLine[] = lines.map(({ plan: _plan, ...l }) => l);
    const add = vi.fn(async (_upc: string, _quantity: number, _modality: unknown) => undefined);
    const remember = vi.fn(async (_name: string, _page: string, _upc: string, _size: string | null) => undefined);
    const outcomes = await sendLines({ open, picks: guessPicks(lines), again: false, modality: "PICKUP" }, { add, remember });
    expect(add.mock.calls.map((c) => c[0])).toEqual([A, A, C]);
    expect(outcomes.map((o) => [o.id, o.result])).toEqual([
      ["milk", "added"],
      ["muffins", "added"],
      ["kale", "added"],
      ["zzz", "skipped"],
    ]);
    expect(outcomes[3].detail).toBe("No product to add.");
    // The exact product is never re-saved; the guess and the match are.
    expect(remember.mock.calls.map((c) => c[2])).toEqual([A, C]);
  });
});

describe("ticked lines go to the bottom", () => {
  const rows = [
    { id: "a", checked: false },
    { id: "b", checked: true },
    { id: "c", checked: false },
    { id: "d", checked: true },
    { id: "e", checked: false },
  ];

  it("keeps the unticked order on top and the ticked order below", () => {
    expect(tickedLast(rows).map((r) => r.id)).toEqual(["a", "c", "e", "b", "d"]);
  });

  it("unticking moves a line back up into the list's own order", () => {
    const untick = rows.map((r) => (r.id === "d" ? { ...r, checked: false } : r));
    expect(tickedLast(untick).map((r) => r.id)).toEqual(["a", "c", "d", "e", "b"]);
  });

  it("does not change what it is given, and the list fades a ticked line", () => {
    const before = JSON.stringify(rows);
    tickedLast(rows);
    expect(JSON.stringify(rows)).toBe(before);
    expect(readFileSync(resolve(__dirname, "../app/List.tsx"), "utf8")).toMatch(/tickedLast\(shownLines\)/);
    expect(readFileSync(resolve(__dirname, "../app/List.tsx"), "utf8")).toMatch(/item\.checked \? "opacity-60"/);
  });
});

function row(item_id: string, upc: string, quantity: number, kind: SendRow["kind"] = "sent"): SendRow {
  return { item_id, name: item_id, kind, upc, quantity, modality: "PICKUP" };
}

describe("Refresh cart", () => {
  const T0 = "2026-11-02T18:00:00.000Z";
  function deps(over: Partial<CartRefreshDeps> & { list: { id: string; name: string; sent_at: string | null }[]; rows: SendRow[]; found: Product[] }) {
    const { list, rows, found, ...rest } = over;
    return {
      now: () => new Date(T0),
      readList: async () => list,
      readSends: async () => rows,
      markSent: vi.fn(async () => undefined),
      markUnsent: vi.fn(async () => undefined),
      store: async () => ({ locationId: "62000001", name: "Test King Soopers" }),
      appToken: vi.fn(async () => "app-token"),
      byIds: vi.fn(async () => found),
      ...rest,
    } satisfies CartRefreshDeps;
  }

  it("fixes In cart from the ledger both ways", () => {
    const list = [
      { id: "held-not-marked", name: "milk", sent_at: null },
      { id: "marked-but-taken-back", name: "eggs", sent_at: "2026-10-30T00:00:00Z" },
      { id: "fine", name: "kale", sent_at: "2026-10-30T00:00:00Z" },
      { id: "before-the-ledger", name: "salt", sent_at: "2026-09-01T00:00:00Z" },
      { id: "plain", name: "rice", sent_at: null },
    ];
    const fix = reconcile(list, [
      row("held-not-marked", A, 1),
      row("marked-but-taken-back", B, 2),
      row("marked-but-taken-back", B, -2, "taken_back"),
      row("fine", C, 1),
    ]);
    expect(fix.markSent).toEqual(["held-not-marked"]);
    expect(fix.markUnsent).toEqual(["marked-but-taken-back"]);
  });

  it("writes the fix, then prices each In cart line today with the app token and sums the total", async () => {
    const d = deps({
      list: [
        { id: "milk", name: "milk", sent_at: null },
        { id: "kale", name: "kale", sent_at: "2026-10-30T00:00:00Z" },
        { id: "rice", name: "rice", sent_at: null },
      ],
      rows: [row("milk", A, 2), row("kale", C, 1)],
      found: [product(A, { price: 2.5, regular: 3, promo: 2.5 }), product(C, { price: 4 })],
    });
    const out = await refreshCart(d);
    expect(d.markSent).toHaveBeenCalledWith(["milk"], T0);
    expect(d.markUnsent).not.toHaveBeenCalled();
    // Product read at the chosen store, with the app's own token.
    expect(d.appToken).toHaveBeenCalledTimes(1);
    expect(d.byIds).toHaveBeenCalledWith("app-token", [A, C], "62000001");
    expect(out.lines).toEqual([
      { id: "milk", product: `Kroger ${A}`, size: "1 ct", total: 5, onSale: true },
      { id: "kale", product: `Kroger ${C}`, size: "1 ct", total: 4, onSale: false },
    ]);
    expect(out.total).toBe(9);
    expect(out.unpriced).toBe(0);
    expect(out.checkedAt).toBe(T0);
    expect(out.fixed).toEqual({ added: 1, removed: 0 });
  });

  it("a line Kroger can't price reads no price and is never counted as $0", async () => {
    const d = deps({
      list: [
        { id: "milk", name: "milk", sent_at: "2026-10-30T00:00:00Z" },
        { id: "kale", name: "kale", sent_at: "2026-10-30T00:00:00Z" },
        { id: "salt", name: "salt", sent_at: "2026-09-01T00:00:00Z" },
      ],
      rows: [row("milk", A, 1), row("kale", C, 1)],
      found: [product(A, { price: 3 })], // C not returned
    });
    const out = await refreshCart(d);
    expect(out.lines.map((l) => [l.id, l.total])).toEqual([
      ["milk", 3],
      ["kale", null],
      ["salt", null],
    ]);
    expect(out.total).toBe(3);
    expect(out.unpriced).toBe(2);
  });

  it("with nothing priceable the total is null, not $0", async () => {
    const out = await refreshCart(deps({ list: [{ id: "milk", name: "milk", sent_at: "2026-10-30T00:00:00Z" }], rows: [row("milk", A, 1)], found: [] }));
    expect(out.total).toBeNull();
  });

  it("asks Kroger for nothing, and needs no token, when the cart is empty", async () => {
    const d = deps({ list: [{ id: "rice", name: "rice", sent_at: null }], rows: [], found: [] });
    const out = await refreshCart(d);
    expect(d.appToken).not.toHaveBeenCalled();
    expect(out.lines).toEqual([]);
  });

  it("a line Clear cart cleared is gone: never put back In cart, never returned to the List (TEC-210)", async () => {
    const cleared = { id: "bought", name: "milk", sent_at: "2026-10-30T00:00:00Z", cleared_at: "2026-11-02T17:00:00Z" };
    // The ledger still holds it (nothing was taken back) — and it must still not come back.
    const fix = reconcile([cleared, { ...cleared, id: "bought2", sent_at: null }], [row("bought", A, 1), row("bought2", B, 1)]);
    expect(fix.markSent).toEqual([]);
    expect(fix.markUnsent).toEqual([]);
    const d = deps({ list: [cleared, { id: "kale", name: "kale", sent_at: "2026-10-30T00:00:00Z" }], rows: [row("bought", A, 1), row("kale", C, 1)], found: [product(C, { price: 4 })] });
    const out = await refreshCart(d);
    expect(d.markSent).not.toHaveBeenCalled();
    expect(d.markUnsent).not.toHaveBeenCalled();
    expect(d.byIds).toHaveBeenCalledWith("app-token", [C], "62000001");
    expect(out.lines.map((l) => l.id)).toEqual(["kale"]);
    expect(out.total).toBe(4);
  });

  it("the route uses the app token and never the account's", () => {
    const route = readFileSync(resolve(__dirname, "../app/api/kroger/cart/refresh/route.ts"), "utf8");
    expect(route).toMatch(/appToken/);
    expect(route).not.toMatch(/withAccessToken\(|import .*withAccessToken/);
  });
});

describe("Clear cart", () => {
  it("takes back every line In cart, whatever was ticked, by negative quantities, and marks them all unsent", async () => {
    const list = [
      { id: "a", name: "milk", sent_at: "2026-11-01T00:00:00Z" },
      { id: "b", name: "kale", sent_at: "2026-11-01T00:00:00Z" },
      { id: "c", name: "rice", sent_at: null },
    ];
    const lines = takeBackLines(list, [row("a", A, 2), row("b", C, 1)]);
    const d: TakeBackDeps = {
      reserve: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      refused: vi.fn(async () => undefined),
    };
    // The route is given no ids: all of them.
    const { outcomes, unsent } = await takeBack(lines, d);
    expect(unsent).toEqual(["a", "b"]);
    expect((d.remove as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [A, 2, "PICKUP"],
      [C, 1, "PICKUP"],
    ]);
    expect(outcomes.every((o) => o.result === "taken back")).toBe(true);
  });

  it("needs no King Soopers step and sends no ids from the button", () => {
    const cart = readFileSync(resolve(__dirname, "../app/Cart.tsx"), "utf8");
    expect(cart).toMatch(/async function clearCart\(\)[\s\S]*takeBackRequest\(null, true\)/);
    expect(cart).not.toMatch(/Open the King Soopers cart/);
    expect(cart).not.toMatch(/\/api\/kroger\/cart\/take-back"[^)]*\{ cache/);
  });
});

describe("the splash, the one picker that stays", () => {
  it("opens when several saved products match and none is the default", () => {
    expect(needsSplash(settle())).toBe(true);
  });

  it("does not open for a default, one product, Kroger's match or nothing", () => {
    expect(needsSplash(exact(A))).toBe(false);
    expect(needsSplash(match())).toBe(false);
    expect(needsSplash(none())).toBe(false);
    expect(needsSplash({ kind: "settle", phrase: "x", via: "name", options: [candidate(A)], matched: "x" })).toBe(false);
  });

  it("offers each product with its size and price, most-bought first", () => {
    const options = pickerOptions(settle());
    expect(options.map((o) => [o.upc, o.count, o.detail])).toEqual([
      [A, 8, "12 ct · $3.00"],
      [B, 4, "12 ct · $3.00"],
    ]);
  });

  it("a tap sends that product with its page; Make default rides along only when a name matched", () => {
    const line = review("muffins", settle());
    const [, second] = pickerOptions(line.plan);
    expect(pickOf(line, second, false)).toEqual({ id: "muffins", upc: B, match: `https://www.kingsoopers.com/p/test/${B}` });
    expect(pickOf(line, second, true)).toMatchObject({ upc: B, makeDefault: true });
    const unmatched = review("muffins", { ...(settle() as Extract<Plan, { kind: "settle" }>), matched: null });
    expect(pickOf(unmatched, second, true)).not.toHaveProperty("makeDefault");
  });

  it("Add an item opens it from the new lines; Change is gone (TEC-211)", () => {
    const cart = readFileSync(resolve(__dirname, "../app/Cart.tsx"), "utf8");
    const list = readFileSync(resolve(__dirname, "../app/List.tsx"), "utf8");
    expect(list).toMatch(/cart\.offerChoices\(/);
    expect(cart).toMatch(/needsSplash\(l\.plan\)/);
    expect(cart).toMatch(/Make default/);
    expect(cart).not.toMatch(/change: true|changeLine/);
  });
});

describe("the header and where Add sits", () => {
  const list = readFileSync(resolve(__dirname, "../app/List.tsx"), "utf8");

  it("holds Pickup/Delivery and the store, and the store opens a ZIP search", () => {
    expect(list).toMatch(/<ModeSwitch/);
    expect(list).toMatch(/cart\.setChoosingStore\(!cart\.choosingStore\)/);
    expect(list).toMatch(/<StorePicker cart=\{cart\} \/>/);
    expect(list.indexOf("<ModeSwitch")).toBeLessThan(list.indexOf('aria-label="List"'));
  });

  it("puts Add an item below the list's filters, not at the top", () => {
    expect(list.indexOf('aria-label="Add items, one per line"')).toBeGreaterThan(list.indexOf("Clear ticked"));
    expect(list.indexOf('aria-label="Add items, one per line"')).toBeLessThan(list.indexOf("<ListRow"));
  });
});
