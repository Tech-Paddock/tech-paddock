import { createElement, type ReactElement, type ReactNode } from "react";

// A loosely typed element, so a test can read its props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = ReactElement<Record<string, any>>;
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * A product picked for one grocery line (TEC-227; owner, 2026-11-04: "This line only"). It is
 * stored on the line, it is the named-product step first in `planLine`, Send then sends it, and
 * it **never** touches `products.default_for`. The database is a recorder; Kroger is mocked.
 */

const db = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; values?: Record<string, unknown>; filters: [string, unknown][] }[],
  fail: false,
}));

vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        const call = { table, op: "update", values, filters: [] as [string, unknown][] };
        db.calls.push(call);
        return {
          eq: async (col: string, v: unknown) => {
            call.filters.push([col, v]);
            return { error: db.fail ? { message: "down" } : null };
          },
        };
      },
    }),
  }),
}));

import { PATCH } from "@/app/api/grocery/route";
import { readPicked, withPicks, type PickedProduct } from "@/lib/linePick";
import { planLine, sendLines, type Candidate, type CartLine, type Decision } from "@/lib/cart";
import { guessPick } from "@/lib/cartGuess";
import { matchOptions, matchView } from "@/lib/itemMatches";
import { MatchesBody, pickOfOption } from "@/app/ItemMatches";
import { backdropTap, SheetFrame } from "@/app/Cart";
import type { Product } from "@/lib/kroger";

const ZERO = "0004900000001";
const CLASSIC = "0004900000002";
const KROGER = "0001111000003";

const pageOf = (upc: string) => `https://www.kingsoopers.com/p/test/${upc}`;

function candidate(upc: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id: `id-${upc}`,
    upc,
    url: pageOf(upc),
    count: 0,
    missing: false,
    description: `Coke ${upc}`,
    size: "12 oz",
    sizeFirst: null,
    price: 7.5,
    names: ["coke"],
    ...over,
  };
}

/** What Your brands would decide for "coke" with no pick: the default is Classic. */
function decideCoke(): Decision {
  const options = [candidate(CLASSIC, { isDefault: true, description: "Coke Classic" }), candidate(ZERO, { description: "Coke Zero" })];
  return { kind: "products", via: "name", name: "coke", matched: "coke", chosen: "default", candidates: options };
}

const saved = [] as never[];
const decide = withPicks(() => decideCoke(), saved);

const line = (over: Partial<CartLine> = {}): CartLine => ({ id: "l1", name: "coke", note: null, quantity: 2, sent_at: null, ...over });
const pick: PickedProduct = { upc: ZERO, url: pageOf(ZERO), label: "Coke Zero", size: "12 oz", price: 7.5 };

const noSearch = async (): Promise<Product[]> => {
  throw new Error("Kroger must not be asked");
};

describe("reading a pick", () => {
  it("keeps a product code, name, size and price", () => {
    expect(readPicked({ upc: ZERO, url: pageOf(ZERO), label: "Coke Zero", size: "12 oz", price: 7.5 })).toEqual(pick);
  });

  it("rejects anything that is not a product code, and rebuilds a page that is not King Soopers' or names another product", () => {
    expect(readPicked({ upc: "abc", label: "x" })).toBeNull();
    expect(readPicked(null)).toBeNull();
    expect(readPicked("0004900000001")).toBeNull();
    expect(readPicked({ upc: ZERO, url: "https://example.com/p/x/0004900000001", label: "Coke Zero" })?.url).toBe(`https://www.kingsoopers.com/p/coke-zero/${ZERO}`);
    expect(readPicked({ upc: ZERO, url: pageOf(CLASSIC), label: "Coke Zero" })?.url).toBe(`https://www.kingsoopers.com/p/coke-zero/${ZERO}`);
  });

  it("drops a negative or non-numeric price and a blank size", () => {
    expect(readPicked({ upc: ZERO, label: "Coke Zero", size: " ", price: -1 })).toMatchObject({ size: null, price: null });
    expect(readPicked({ upc: ZERO, label: "Coke Zero", price: "3" })?.price).toBeNull();
  });
});

describe("the pick is the named-product step, first", () => {
  it("without a pick the line goes in as its default", async () => {
    const plan = await planLine(line(), decide, noSearch);
    expect(plan).toMatchObject({ kind: "exact", upc: CLASSIC, chosen: "default" });
  });

  it("with a pick it goes in as the pick, ahead of the default, with no Kroger call", async () => {
    const plan = await planLine(line({ picked: pick }), decide, noSearch);
    expect(plan).toMatchObject({ kind: "exact", upc: ZERO, chosen: "named" });
    expect(plan.kind === "exact" && plan.options.map((o) => o.upc)).toEqual([ZERO]);
  });

  it("a pick of a product Your brands has uses the saved row's own data", async () => {
    const ctx = withPicks(() => null, [
      { id: "p9", product_id: ZERO, names: ["coke"], description: "Coke Zero Sugar", size: "12 oz", size_first: "12 oz", price: 8.25, count: 4, url: pageOf(ZERO), missing_since: null, default_for: [], pack_label: null, pack_size: null, pack_unit: null } as never,
    ]);
    const plan = await planLine(line({ picked: { ...pick, label: "stale", price: 1 } }), ctx, noSearch);
    expect(plan).toMatchObject({ kind: "exact", upc: ZERO });
    expect(plan.kind === "exact" && plan.option).toMatchObject({ id: "p9", description: "Coke Zero Sugar", price: 8.25 });
    // It is not a default, even for the saved row.
    expect(plan.kind === "exact" && plan.option.isDefault).toBe(false);
  });
});

describe("Send sends the pick and never makes a default", () => {
  const sendDeps = () => ({
    add: vi.fn(async (_upc: string, _quantity: number, _modality: unknown) => undefined),
    remember: vi.fn(async (_name: string, _page: string, _upc: string, _size: string | null) => undefined),
  });

  it("a picked saved product is sent as it is, once, and nothing is re-saved", async () => {
    const plan = await planLine(line({ picked: pick }), withPicks(() => decideCoke(), [{ id: "p9", product_id: ZERO, names: ["coke"], description: "Coke Zero", size: "12 oz", size_first: null, price: 7.5, count: 0, url: pageOf(ZERO), missing_since: null, default_for: [], pack_label: null, pack_size: null, pack_unit: null } as never]), noSearch);
    const deps = sendDeps();
    const outcomes = await sendLines({ open: [line({ picked: pick })], picks: [guessPick({ id: "l1", plan })], again: false, modality: "PICKUP" }, deps);
    expect(deps.add).toHaveBeenCalledWith(ZERO, 2, "PICKUP");
    expect(outcomes[0]).toMatchObject({ result: "added", upc: ZERO });
    expect(deps.remember).not.toHaveBeenCalled();
  });

  it("a picked product Your brands does not have yet is remembered like any tapped match, with its page and size", async () => {
    const plan = await planLine(line({ picked: pick }), decide, noSearch);
    expect(guessPick({ id: "l1", plan })).toEqual({ id: "l1", upc: ZERO, match: pageOf(ZERO), size: "12 oz" });
    const deps = sendDeps();
    await sendLines({ open: [line({ picked: pick })], picks: [guessPick({ id: "l1", plan })], again: false, modality: null }, deps);
    expect(deps.add).toHaveBeenCalledWith(ZERO, 2, null);
    expect(deps.remember.mock.calls[0].slice(1)).toEqual([pageOf(ZERO), ZERO, "12 oz"]);
  });

  it("the code that stores a pick cannot write a default", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["../lib/linePick.ts", "../lib/mirror.ts", "../app/api/kroger/mirror/route.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/default_for\s*[:=]|setDefault|defaultPatches|rememberProduct|addToCart|bumpCounts/);
    }
  });
});

describe("PATCH /api/grocery with a pick", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.fail = false;
  });
  const patch = (body: unknown) =>
    PATCH(new NextRequest("http://localhost/api/grocery", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

  it("persists the pick on that one line, and writes nothing else: no products table, no default", async () => {
    const res = await patch({ id: "l1", pick });
    expect(res.status).toBe(200);
    expect(db.calls).toEqual([{ table: "grocery_items", op: "update", values: { picked_product: pick }, filters: [["id", "l1"]] }]);
    expect(JSON.stringify(db.calls)).not.toMatch(/default_for|products/);
  });

  it("null clears the pick", async () => {
    const res = await patch({ id: "l1", pick: null });
    expect(res.status).toBe(200);
    expect(db.calls[0].values).toEqual({ picked_product: null });
  });

  it("refuses something that is not a product, and writes nothing", async () => {
    const res = await patch({ id: "l1", pick: { upc: "nope" } });
    expect(res.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it("says so when the write fails", async () => {
    db.fail = true;
    const res = await patch({ id: "l1", pick });
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});

describe("the List popup", () => {
  const plan = async () => planLine(line(), decide, noSearch);

  it("marks the picked product as selected, and only that one", async () => {
    const view = matchView(await plan(), "https://www.kingsoopers.com/q/coke", { ok: true }, pick);
    expect(view.picked).toBe(ZERO);
    expect(view.options.filter((o) => o.selected).map((o) => o.upc)).toEqual([ZERO]);
    expect(matchView(await plan(), "x", { ok: true }).options.some((o) => o.selected)).toBe(false);
  });

  it("still shows a pick the plan no longer offers, first, tagged as the pick", async () => {
    const gone: PickedProduct = { ...pick, upc: KROGER, url: pageOf(KROGER), label: "Kroger Cola" };
    const view = matchView(await plan(), "x", { ok: true }, gone);
    expect(view.options[0]).toMatchObject({ upc: KROGER, selected: true, tag: "your pick" });
  });

  it("each option is one line: the name, then size and price, then the reason as a small pill", async () => {
    const view = matchView(await plan(), "https://www.kingsoopers.com/q/coke", { ok: true }, pick);
    const html = renderToStaticMarkup(createElement(MatchesBody, { name: "coke", view, error: null, fallback: "x", onPick: () => undefined, onClose: () => undefined }));
    const zero = html.slice(html.indexOf("Coke Zero"), html.indexOf("</button>", html.indexOf("Coke Zero")));
    expect(zero).toContain("12 oz · $7.50");
    expect(zero).toContain("new");
    // The reason is a pill on the same button, smaller than the 13px name.
    expect(html).toMatch(/rounded-full[^"]*text-\[10px\][^"]*">★ bought 0×|rounded-full[^"]*text-\[10px\][^"]*">new/);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Picked for this line");
  });

  it("tapping a product picks it; tapping the picked one clears the pick", async () => {
    const view = matchView(await plan(), "x", { ok: true }, pick);
    const onPick = vi.fn();
    const tree = MatchesBody({ name: "coke", view, error: null, fallback: "x", onPick, onClose: () => undefined });
    const buttons = findAll(tree, (e) => e.type === "button" && e.props["aria-pressed"] !== undefined);
    expect(buttons).toHaveLength(2);
    const [classic, zero] = [buttons.find((b) => !b.props["aria-pressed"])!, buttons.find((b) => b.props["aria-pressed"])!];
    classic.props.onClick();
    expect(onPick).toHaveBeenLastCalledWith(pickOfOption(matchOptions(await plan()).find((o) => o.upc === CLASSIC)!));
    zero.props.onClick();
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it("closes on the × at the top, there is no Close button, and Search King Soopers is still there", async () => {
    const view = matchView(await plan(), "https://www.kingsoopers.com/q/coke", { ok: true });
    const onClose = vi.fn();
    const tree = MatchesBody({ name: "coke", view, error: null, fallback: "x", onPick: () => undefined, onClose });
    const x = findAll(tree, (e) => e.type === "button" && e.props["aria-label"] === "Close");
    expect(x).toHaveLength(1);
    x[0].props.onClick();
    expect(onClose).toHaveBeenCalledTimes(1);
    const html = renderToStaticMarkup(createElement(MatchesBody, { name: "coke", view, error: null, fallback: "x", onPick: () => undefined, onClose }));
    expect(html.match(/>Close</g)).toBeNull();
    expect(html).toContain("Search King Soopers");
    expect(html).toContain('href="https://www.kingsoopers.com/q/coke"');
  });

  it("closes on a tap outside it, but not on a tap inside, and the Which-chicken picker keeps its backdrop off", () => {
    const onClose = vi.fn();
    const backdrop = {};
    const inside = {};
    const tap = backdropTap(true, onClose)!;
    tap({ target: inside, currentTarget: backdrop });
    expect(onClose).not.toHaveBeenCalled();
    tap({ target: backdrop, currentTarget: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(backdropTap(false, onClose)).toBeUndefined();
    // The popup turns it on; the shared sheet defaults it off.
    const html = renderToStaticMarkup(createElement(SheetFrame, { label: "x", onClose, closeOnBackdrop: true, children: "body" }));
    expect(html).toContain('role="dialog"');
  });
});

/** Every element in a tree of React elements matching `test`, depth first. */
function findAll(node: ReactNode, test: (e: El) => boolean): El[] {
  const out: El[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object" || !("props" in n)) return;
    const e = n as El;
    if (test(e)) out.push(e);
    walk((e.props as { children?: ReactNode }).children);
  };
  walk(node);
  return out;
}
