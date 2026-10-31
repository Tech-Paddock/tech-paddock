import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bubbleText, lineDeals, shadeWord, bestEmptyWords, type LineDeal } from "@/lib/lineDeal";
import { shadeOf } from "@/lib/dealSignal";
import { FRESH_NIGHTS, buildDealBoard } from "@/lib/dealRows";
import { percentOff } from "@/lib/pricing";
import { addDays } from "@/lib/priceDates";
import type { Coupon } from "@/lib/couponRules";
import type { SavedProduct } from "@/lib/brands";
import type { NightRow, WeekRow } from "@/lib/priceWeeks";

/**
 * The list's bubble, shade and Best (TEC-196). Made-up products. The point of
 * the file: a line and the Deals board, given the same rows, never disagree.
 */

const AS_OF = "2026-12-14"; // a Monday
const STORE = "01400999";
const P = "0001111000001";

const night = (product_id: string, daysAgo: number, regular: number | null, sale: number | null = null): NightRow => ({
  product_id,
  location_id: STORE,
  night: addDays(AS_OF, -daysAgo),
  regular,
  sale,
  in_stock: true,
  aisle: "Pantry",
});

const weeks = (product_id: string, count: number, low: number, mean: number): WeekRow[] =>
  Array.from({ length: count }, (_, i) => ({
    product_id,
    location_id: STORE,
    week_start: addDays("2026-12-07", -7 * i),
    low,
    high: mean,
    mean,
    regular_mean: mean,
    nights_on_sale: 0,
    nights_seen: 7,
  }));

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  id: "c",
  title: "Test coupon",
  amount: "$1 off",
  expires_on: addDays(AS_OF, 7),
  week_seen: "2026-12-07",
  product_ids: [P],
  ...over,
});

const saved = (product_id: string): SavedProduct =>
  ({ id: `id-${product_id}`, product_id, names: ["test item"], count: 0, size_first: null, description: "Test item", size: null, url: null }) as unknown as SavedProduct;

function both(nights: NightRow[], wks: WeekRow[], coupons: Coupon[] = []) {
  const line = lineDeals([{ id: "L", productId: P }], { asOf: AS_OF, locationId: STORE, nights, weeks: wks, coupons, freshNights: FRESH_NIGHTS }).get("L") ?? null;
  const board = buildDealBoard({
    asOf: AS_OF,
    store: { locationId: STORE, name: "Test" },
    products: [saved(P)],
    nights,
    weeks: wks,
    coupons,
    couponsStaged: coupons.length > 0,
    scan: null,
  });
  return { line, row: board.rows[0] ?? null };
}

describe("the shade rule", () => {
  it("with history: green is good, red is bad, anything else is plain", () => {
    expect(shadeOf("green", false, 0)).toBe("good");
    expect(shadeOf("red", true, 0)).toBe("bad"); // red even when Kroger calls it a sale
    expect(shadeOf("neutral", true, 1)).toBe("plain");
  });
  it("before history (new): a sale or a coupon is good, else plain, and never bad", () => {
    expect(shadeOf("new", true, 0)).toBe("good");
    expect(shadeOf("new", false, 1)).toBe("good");
    expect(shadeOf("new", false, 0)).toBe("plain");
  });
});

describe("a line and the Deals board agree", () => {
  const cases: [string, NightRow[], WeekRow[], Coupon[]][] = [
    ["new, on sale", [night(P, 0, 5, 3.99), night(P, 1, 5)], [], []],
    ["new, not on sale", [night(P, 0, 5), night(P, 1, 5)], [], []],
    ["new, a coupon only", [night(P, 0, 5), night(P, 1, 5)], [], [coupon()]],
    ["8 weeks, 30% under", [night(P, 0, 5, 3.5), night(P, 1, 5)], weeks(P, 8, 3.5, 5), []],
    ["8 weeks, red on sale", [night(P, 0, 7, 6.5), night(P, 1, 5)], weeks(P, 8, 4.5, 5), []],
    ["8 weeks, neutral", [night(P, 0, 5), night(P, 1, 5)], weeks(P, 8, 4.8, 5), []],
    ["3 weeks only", [night(P, 0, 5, 3), night(P, 1, 5)], weeks(P, 3, 3, 5), []],
    ["an expired coupon", [night(P, 0, 5), night(P, 1, 5)], [], [coupon({ expires_on: addDays(AS_OF, -1) })]],
  ];
  for (const [name, nights, wks, coupons] of cases) {
    it(name, () => {
      const { line, row } = both(nights, wks, coupons);
      expect(row).not.toBeNull();
      expect(line).not.toBeNull();
      expect(line?.shade).toBe(row.shade);
      expect(line?.best).toBe(row.best.qualifies);
      expect(line?.bestNights).toBe(row.best.nights);
      // The shade is the board's colour, read through the one rule.
      expect(line?.shade).toBe(shadeOf(row.light, row.onSale, row.coupons.length));
      expect(line?.salePrice !== null).toBe(row.onSale);
      expect(line?.coupon).toBe(row.coupons.length > 0);
    });
  }

  it("a line is plain when the board would not show its product (no night within the fresh days)", () => {
    const stale = [night(P, FRESH_NIGHTS + 1, 5, 3), night(P, FRESH_NIGHTS + 2, 5)];
    const { line, row } = both(stale, []);
    expect(row).toBeNull();
    expect(line).toBeNull();
  });
});

describe("a line with nothing to say", () => {
  const input = { asOf: AS_OF, locationId: STORE, nights: [night(P, 0, 5, 3)], weeks: [], coupons: [], freshNights: FRESH_NIGHTS };
  it("no saved product, or a product with no night, or no price, is null and plain", () => {
    const got = lineDeals(
      [
        { id: "none", productId: null },
        { id: "other", productId: "0009999000009" },
      ],
      input
    );
    expect(got.get("none")).toBeNull();
    expect(got.get("other")).toBeNull();
    const blank = lineDeals([{ id: "x", productId: P }], { ...input, nights: [night(P, 0, null, null)] });
    expect(blank.get("x")).toBeNull();
  });
  it("another store's nights say nothing", () => {
    const other = { ...night(P, 0, 5, 3), location_id: "99999999" };
    expect(lineDeals([{ id: "x", productId: P }], { ...input, nights: [other] }).get("x")).toBeNull();
  });
});

describe("the bubble", () => {
  const deal = (over: Partial<LineDeal> = {}): LineDeal => ({ shade: "plain", reason: "", salePrice: null, coupon: false, best: false, bestNights: 0, ...over });
  it("says Sale with the price, Coupon, both, or nothing", () => {
    expect(bubbleText(deal({ salePrice: 2.99 }))).toBe("Sale $2.99");
    expect(bubbleText(deal({ coupon: true }))).toBe("Coupon");
    expect(bubbleText(deal({ salePrice: 2.5, coupon: true }))).toBe("Sale + coupon");
    expect(bubbleText(deal())).toBeNull();
    expect(bubbleText(null)).toBeNull();
  });
  it("a sale is promo below regular: from the nightly row, at the night's own sale price", () => {
    const got = lineDeals([{ id: "L", productId: P }], { asOf: AS_OF, locationId: STORE, nights: [night(P, 0, 4, 2.99)], weeks: [], coupons: [], freshNights: FRESH_NIGHTS });
    expect(bubbleText(got.get("L"))).toBe("Sale $2.99");
    // A sale price that is not below the regular is not a sale.
    const same = lineDeals([{ id: "L", productId: P }], { asOf: AS_OF, locationId: STORE, nights: [night(P, 0, 4, 4)], weeks: [], coupons: [], freshNights: FRESH_NIGHTS });
    expect(bubbleText(same.get("L"))).toBeNull();
    expect(percentOff({ regular: 4, promo: 4 })).toBeNull();
  });
  it("Coupon comes only from a staged coupon that lists the product's code, never invented", () => {
    const base = { asOf: AS_OF, locationId: STORE, nights: [night(P, 0, 4)], weeks: [], freshNights: FRESH_NIGHTS };
    const line = [{ id: "L", productId: P }];
    expect(bubbleText(lineDeals(line, { ...base, coupons: [] }).get("L"))).toBeNull();
    expect(bubbleText(lineDeals(line, { ...base, coupons: [coupon({ product_ids: ["0008888000008"] })] }).get("L"))).toBeNull();
    expect(bubbleText(lineDeals(line, { ...base, coupons: [coupon()] }).get("L"))).toBe("Coupon");
  });
  it("colour is never the only cue: a shaded line has a bubble or a word", () => {
    expect(shadeWord(deal({ shade: "good" }))).toBe("Good price");
    expect(shadeWord(deal({ shade: "bad" }))).toBe("High price");
    expect(shadeWord(deal())).toBeNull();
  });
});

describe("an empty Best on the list says why", () => {
  it("under 2 nights it says so; with nights it says nothing is at its low", () => {
    const few: LineDeal = { shade: "plain", reason: "", salePrice: null, coupon: false, best: false, bestNights: 1 };
    expect(bestEmptyWords([few, null]).title).toBe("No best deals yet");
    expect(bestEmptyWords([{ ...few, bestNights: 9 }]).title).toBe("Nothing on the List is at its low");
    expect(bestEmptyWords([]).title).toBe("No best deals yet");
  });
});

describe("the list's surface", () => {
  const read = (file: string) => readFileSync(resolve(__dirname, file), "utf8");
  const list = read("../app/List.tsx");

  it("is browser-safe: lib/lineDeal.ts imports nothing with a database behind it", () => {
    const source = read("../lib/lineDeal.ts");
    const imports = [...source.matchAll(/^import .* from "(.+)";$/gm)].map((m) => m[1]);
    expect(imports.every((i) => i.startsWith("./"))).toBe(true);
    expect(imports.some((i) => /Store|supabase|kroger/i.test(i))).toBe(false);
  });

  it("each List and In cart line is one line: the name and the small line truncate, the price, bubble and button do not", () => {
    for (const row of [list.slice(list.indexOf("function ListRow"), list.indexOf("function Price")), list.slice(list.indexOf("function InCartRow"), list.indexOf("function ModeSwitch"))]) {
      expect(row).toMatch(/block truncate text-\[15px\]/);
      expect(row).toMatch(/min-w-0 truncate/);
      expect(row).toMatch(/title=\{lineTitle\(/);
      expect(row).not.toMatch(/whitespace-normal|break-words|line-clamp/);
    }
    expect(list).toMatch(/shrink-0 whitespace-nowrap rounded border border-accent/); // the bubble
    expect(list).toMatch(/h-8 shrink-0 whitespace-nowrap rounded-lg bg-accent/); // + Cart
    expect(list).toMatch(/min-h-11 shrink-0 whitespace-nowrap rounded-\[10px\] border border-line/); // Remove
  });

  it("the Best toggle filters the List to the lines the server marked Best", () => {
    expect(list).toMatch(/aria-pressed=\{bestOnly\}/);
    expect(list).toMatch(/onList\.filter\(\(i\) => i\.deal\?\.best\)/);
  });

  it("the server decides Best and the shade with the Deals board's own function", () => {
    const route = read("../app/api/grocery/route.ts");
    const rows = read("../lib/dealRows.ts");
    expect(route).toMatch(/lineDeals\(/);
    expect(read("../lib/lineDeal.ts")).toMatch(/productSignal\(/);
    expect(rows).toMatch(/productSignal\(/);
    expect(read("../lib/dealSignal.ts")).toMatch(/bestPrice\(/);
    // No Kroger call and no model on this path.
    expect(route).not.toMatch(/kroger\.ts|appToken|anthropic/i);
  });
});
