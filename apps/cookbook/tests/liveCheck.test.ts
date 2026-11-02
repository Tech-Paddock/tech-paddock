import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkLine, clock, type CheckResult } from "@/lib/checkLine";
import { checkConnection } from "@/lib/krogerCheck";
import { KrogerConfigError, KrogerError } from "@/lib/kroger";
import { ConflictError, LookupError } from "@/lib/errors";
import { confirmWords } from "@/lib/cartGuess";
import { InCartRow, ListRow } from "@/app/List";
import { sentWords } from "@/app/Cart";

/**
 * The live King Soopers check and the one-line list (TEC-211; owner, 2026-11-02).
 * Kroger is stubbed: nothing here calls it, and every name and price is made up.
 */

const read = (f: string) => readFileSync(resolve(__dirname, f), "utf8");
const T = new Date("2026-11-02T21:14:00.000Z");
const now = () => T;

describe("the live check reports each state from a stubbed token call", () => {
  it("connected: the token call worked", async () => {
    const out = await checkConnection(async () => true, now);
    expect(out).toEqual({ state: "connected", checkedAt: T.toISOString(), detail: null, problems: [] });
  });

  it("expired: Kroger refused the stored sign-in, or it can't be opened", async () => {
    const refused = await checkConnection(async () => { throw new KrogerError("Kroger refused the stored sign-in — connect King Soopers again (invalid_grant).", 400, true); }, now);
    expect(refused.state).toBe("expired");
    const unreadable = await checkConnection(async () => { throw new KrogerError("The stored Kroger token is unreadable.", 0, true); }, now);
    expect(unreadable.state).toBe("expired");
  });

  it("unreachable: Kroger didn't answer, or answered with a fault that isn't the sign-in", async () => {
    const down = await checkConnection(async () => { throw new KrogerError("Couldn't reach Kroger.", 0); }, now);
    expect(down.state).toBe("unreachable");
    const fault = await checkConnection(async () => { throw new KrogerError("Kroger refused the stored sign-in — connect King Soopers again (HTTP 503).", 503); }, now);
    expect(fault.state).toBe("unreachable");
  });

  it("not connected: nothing was ever saved", async () => {
    const out = await checkConnection(async () => { throw new ConflictError("Connect King Soopers first."); }, now);
    expect(out.state).toBe("not-connected");
  });

  it("not set up: names the missing variable", async () => {
    const out = await checkConnection(async () => { throw new KrogerConfigError(["KROGER_CLIENT_ID is not set"]); }, now);
    expect(out.state).toBe("not-set-up");
    expect(out.problems).toEqual(["KROGER_CLIENT_ID is not set"]);
  });

  it("the database not answering is thrown, never read as King Soopers being down", async () => {
    await expect(checkConnection(async () => { throw new LookupError("db down"); }, now)).rejects.toThrow("db down");
  });

  it("the route is signed-in only, borrows the account's token, and returns only the result", () => {
    const route = read("../app/api/kroger/check/route.ts");
    expect(route).toMatch(/withAccessToken\(async \(\) => true\)/);
    expect(route).not.toMatch(/accessToken|refresh_token|NextRequest/);
    // No new signed-out path: the gate file is untouched, so /api/kroger/check is gated like the rest.
    expect(read("../proxy.ts")).not.toMatch(/kroger\/check/);
  });
});

describe("the header says each state in words, not colour alone", () => {
  const at = (state: CheckResult["state"]): CheckResult => ({ state, checkedAt: T.toISOString(), detail: null, problems: [] });
  const time = () => "2:14 pm";

  it("connected shows when it was checked", () => {
    expect(checkLine(at("connected"), null, time)).toMatchObject({ tone: "good", word: "Connected", rest: "checked 2:14 pm", action: null });
  });

  it("expired offers Reconnect, a link to /kroger/connect", () => {
    expect(checkLine(at("expired"), null, time)).toMatchObject({ tone: "bad", word: "Sign-in expired", action: { label: "Reconnect", href: "/kroger/connect" } });
  });

  it("unreachable says when it last worked, or that it never has this visit", () => {
    expect(checkLine(at("unreachable"), "2026-11-02T20:00:00.000Z", time)).toMatchObject({ tone: "warn", word: "Can't reach King Soopers", rest: "last worked 2:14 pm" });
    expect(checkLine(at("unreachable"), null, time).rest).toBe("no good check yet");
  });

  it("not connected and not set up are plain; Connect is the way out of the first", () => {
    expect(checkLine(at("not-connected"), null, time)).toMatchObject({ tone: "plain", word: "Not connected", action: { href: "/kroger/connect" } });
    expect(checkLine(at("not-set-up"), null, time)).toMatchObject({ tone: "plain", word: "Not set up", action: null });
  });

  it("before the first answer it says it is checking", () => {
    expect(checkLine(null, null, time).word).toBe("Checking King Soopers…");
    expect(clock("2026-11-02T21:14:00.000Z")).toMatch(/\d{1,2}:14/);
  });

  it("runs on open, after a King Soopers call fails, and when tapped", () => {
    const cart = read("../app/Cart.tsx");
    const list = read("../app/List.tsx");
    expect(cart).toMatch(/void runCheck\(\);\n\n    void loadStatus\(\)/);
    for (const where of ["Refresh failed", "Deal scan failed"]) expect(cart).toContain(where);
    expect((cart.match(/void runCheck\(\)/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect(cart).toMatch(/fetch\("\/api\/kroger\/check"/);
    expect(cart).toMatch(/serial\(\(\) => fetch\("\/api\/kroger\/check"/);
    expect(list).toMatch(/onClick=\{\(\) => void cart\.runCheck\(\)\}/);
  });
});

// A line as the list screen is handed it: only what a row can read.
const line = (over: Record<string, unknown> = {}) =>
  ({
    id: "l1",
    name: "2 cups chopped yellow onion",
    note: "for the soup",
    source: "recipe",
    checked: false,
    created_at: "2026-11-01T00:00:00Z",
    recipes: ["Zesty Chicken Soup", "Weeknight Chili"],
    quantity: 3,
    sent_at: null,
    href: "https://www.kingsoopers.com/search?query=onion",
    via: "search",
    view: { name: "Yellow onions", amount: "2 cups", note: "for the soup" },
    mark: "★",
    price: { total: 4.5, onSale: true },
    deal: { shade: "good", reason: "5% under its usual price", salePrice: 1.5, coupon: false, best: false, bestNights: 6 },
    used: { product: "Kroger Yellow Onions 3 lb", size: "3 lb" },
    ...over,
  }) as never;

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("one line per item: item, qty and price", () => {
  const noop = () => undefined;
  const listRow = (over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(ListRow, { item: line(over), onTick: noop, onQuantity: noop, canAdd: true, adding: false, notSent: null, onAdd: noop, ...extra }));
  const cartRow = (over: Record<string, unknown> = {}, live: { total: number | null } | null = null) =>
    renderToStaticMarkup(
      createElement(InCartRow, { item: line({ sent_at: "2026-11-02T00:00:00Z", ...over }), live, disabled: false, removing: false, confirming: false, onAskRemove: noop, onCancel: noop, onRemove: noop })
    );

  it("a List row reads the item, the quantity and the price, and offers + Cart", () => {
    const html = listRow();
    expect(text(html)).toContain("Yellow onions");
    expect(html).toMatch(/value="3"/);
    expect(text(html)).toContain("$4.50");
    expect(text(html)).toContain("+ Cart");
  });

  it("no recipe, mark, bubble, amount or note in a List row's text", () => {
    const shown = text(listRow());
    for (const gone of ["Zesty Chicken Soup", "Weeknight Chili", "from a recipe", "★", "Sale $1.50", "2 cups", "for the soup", "Good price", "Used:"]) {
      expect(shown).not.toContain(gone);
    }
  });

  it("the deal still shades the row and says why on the price, so colour is not the only cue", () => {
    const html = listRow();
    expect(html).toContain("border-l-accent");
    expect(html).toMatch(/aria-label="\$4\.50, Sale \$1\.50 · Good price/);
  });

  it("an In cart row reads the item, the quantity and the price, and offers Remove: no recipe, no Used line, no Change", () => {
    const html = cartRow();
    const shown = text(html);
    expect(shown).toContain("Yellow onions");
    expect(shown).toContain("×3");
    expect(shown).toContain("$4.50");
    expect(shown).toContain("Remove");
    for (const gone of ["Zesty Chicken Soup", "Weeknight Chili", "Used:", "Kroger Yellow Onions", "Change", "★", "for the soup"]) expect(shown).not.toContain(gone);
  });

  it("an In cart row prefers today's price once Refresh cart has read it, and never shows $0", () => {
    expect(text(cartRow({}, { total: 6.25 }))).toContain("$6.25");
    const none = text(cartRow({}, { total: null }));
    expect(none).toContain("no price");
    expect(none).not.toContain("$0");
  });

  it("a line a send did not take reads a red 'not sent' in its price spot", () => {
    const html = listRow({}, { notSent: "No product to add." });
    expect(text(html)).toContain("not sent");
    expect(text(html)).not.toContain("$4.50");
    expect(html).toContain("text-danger");
    expect(html).toContain('title="No product to add."');
  });

  it("a long name truncates rather than wrapping, and the full text is the row's title", () => {
    const html = listRow({ view: { name: "A very long name ".repeat(6), amount: null, note: null } });
    expect(html).toMatch(/class="[^"]*\btruncate\b[^"]*"/);
    expect(html).toContain("<li title=");
  });
});

describe("adds go at once; everything else keeps its confirm", () => {
  const list = read("../app/List.tsx");
  const cart = read("../app/Cart.tsx");

  it("+ Cart and Send all call straight through, with no confirm", () => {
    expect(list).toMatch(/onAdd=\{\(\) => void cart\.addOne\(item\.id\)\}/);
    expect(list).toMatch(/onClick=\{\(\) => void cart\.sendAll\(\)\}/);
    expect(list).not.toMatch(/setConfirm\("send"\)|setConfirm\("add"\)|onAskAdd/);
  });

  it("Tidy, Clear ticked, Clear all, Clear cart and Remove still ask one question with a count", () => {
    for (const kind of ["tidy", "clear-ticked", "clear-all", "clear-cart"]) expect(list).toContain(`setConfirm("${kind}")`);
    expect(list).toMatch(/setRemoveConfirm\(item\.id\)/);
    expect(confirmWords("clear-cart", 4).ask).toBe("Clear the cart? 4 items come out.");
    expect(confirmWords("tidy", 4).ask).toBe("Tidy 4 lines?");
  });
});

describe("a send is one toast, and there is no Sent list", () => {
  it("says Sent N, or Sent N and how many were not sent", () => {
    expect(sentWords(12, 0)).toBe("Sent 12");
    expect(sentWords(12, 2)).toBe("Sent 12 · 2 not sent");
  });

  it("renders no Sent list: SendResults is gone from both files", () => {
    const list = read("../app/List.tsx");
    const cart = read("../app/Cart.tsx");
    expect(list + cart).not.toMatch(/SendResults|Send results|dismissResults|\bsetResults\b/);
    expect(cart).toMatch(/toast\.notice\(words\)/);
  });

  it("the checkout link stays in the In cart section", () => {
    const list = read("../app/List.tsx");
    const inCart = list.slice(list.indexOf('aria-label="In cart"'));
    expect(inCart).toContain("CHECKOUT_URL");
    expect(inCart).toContain("Go to checkout");
  });
});

describe("the King Soopers panel is in the header, and nothing King Soopers sits below In cart", () => {
  const list = read("../app/List.tsx");
  const cart = read("../app/Cart.tsx");

  it("CartPanel is gone", () => {
    expect(list + cart).not.toMatch(/CartPanel/);
    expect(list).not.toMatch(/<h2[^>]*>King Soopers<\/h2>/);
  });

  it("status, connect, store, Pickup/Delivery, Refresh now and disconnect all come before the List", () => {
    const before = list.slice(0, list.indexOf('aria-label="List"'));
    for (const piece of ["<KingSoopersStatus", "<ModeSwitch", "<StorePicker", "Refresh now", "disconnect", "cart.scanNote"]) expect(before + list.slice(list.indexOf("function KingSoopersStatus"))).toContain(piece);
    expect(list.indexOf("<KingSoopersStatus")).toBeLessThan(list.indexOf('aria-label="List"'));
  });

  it("after the In cart section closes, the component ends", () => {
    const tail = list.slice(list.indexOf('aria-label="In cart"'));
    const afterSection = tail.slice(tail.indexOf("      ) : null}\n    </section>"));
    expect(afterSection.slice(0, afterSection.indexOf("\n}\n"))).not.toMatch(/King Soopers|Refresh now|disconnect|Connect|<CartPanel/);
  });
});
