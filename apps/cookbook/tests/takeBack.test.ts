import { describe, expect, it } from "vitest";
import { BACK_TO_LIST_WORDS, clearedWords, heldByLine, type SendRow } from "@/lib/takeBack";
import { sentRows, type Outcome } from "@/lib/cart";
import * as kroger from "@/lib/kroger";

/**
 * Take back (TEC-127). Pure: Kroger and the ledger are passed in. What these
 * hold: it takes back **what was sent**, not what the line says now; a refusal
 * fails that line and leaves it sent; a database failure never removes twice;
 * and the summary never claims the cart is empty.
 */

const MILK = "0001111041700";
const OAT = "0001111099999";

function row(over: Partial<SendRow>): SendRow {
  return { item_id: "a", name: "milk", kind: "sent", upc: MILK, quantity: 2, modality: "PICKUP", ...over };
}

describe("what is still held", () => {
  it("sums each product and mode, and drops what is back to zero", () => {
    const held = heldByLine([
      row({}),
      row({ quantity: 1 }), // sent again
      row({ upc: OAT, quantity: 1 }), // re-picked
      row({ kind: "taken_back", upc: OAT, quantity: -1 }),
      row({ item_id: "b", name: "eggs", upc: "0000000000002", quantity: 1, modality: null }),
      row({ item_id: null, name: "gone", quantity: 5 }), // a cleared line
    ]);
    expect(held.get("a")).toEqual([{ upc: MILK, quantity: 3, modality: "PICKUP" }]);
    expect(held.get("b")).toEqual([{ upc: "0000000000002", quantity: 1, modality: null }]);
    expect(held.size).toBe(2);
  });

  it("keeps the same product sent with and without a mode apart", () => {
    const held = heldByLine([row({}), row({ quantity: 1, modality: null })]);
    expect(held.get("a")).toEqual([
      { upc: MILK, quantity: 2, modality: "PICKUP" },
      { upc: MILK, quantity: 1, modality: null },
    ]);
  });

  it("a refusal reverses its reservation, so the product is held again", () => {
    const held = heldByLine([row({}), row({ kind: "taken_back", quantity: -2 }), row({ kind: "refused", quantity: 2 })]);
    expect(held.get("a")).toEqual([{ upc: MILK, quantity: 2, modality: "PICKUP" }]);
  });
});

describe("what a send records", () => {
  it("records the product, quantity and the mode each added line actually went with", () => {
    const outcomes: Outcome[] = [
      { id: "a", name: "milk", quantity: 2, result: "added", detail: "", upc: MILK },
      { id: "b", name: "eggs", quantity: 1, result: "added", detail: "", upc: OAT, withoutModality: true },
      { id: "c", name: "flour", quantity: 1, result: "failed", detail: "", upc: "0000000000003" },
      { id: "d", name: "salt", quantity: 1, result: "skipped", detail: "" },
    ];
    expect(sentRows(outcomes, "DELIVERY")).toEqual([
      { item_id: "a", name: "milk", kind: "sent", upc: MILK, quantity: 2, modality: "DELIVERY" },
      { item_id: "b", name: "eggs", kind: "sent", upc: OAT, quantity: 1, modality: null },
    ]);
  });
});

describe("Clear cart and Back to list words (TEC-228)", () => {
  it("say Cookbook only, and that the King Soopers cart is not affected", () => {
    expect(clearedWords(3)).toBe("Cleared 3 from Cookbook. Items in your King Soopers cart are not affected.");
    expect(BACK_TO_LIST_WORDS).toBe("Back on the list. Your King Soopers cart is not affected.");
  });
});

describe("Cookbook never removes from the King Soopers cart (TEC-228)", () => {
  it("has no take-back call: Kroger's Cart API only adds", () => {
    expect("takeBackFromCart" in kroger).toBe(false);
  });
});
