import { describe, expect, it, vi } from "vitest";
import { heldByLine, summarizeTakeBack, takeBack, takeBackLines, type SendRow, type TakeBackDeps, type TakeBackLine } from "@/lib/takeBack";
import { sentRows, type Outcome } from "@/lib/cart";
import { KrogerError } from "@/lib/kroger";

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

  it("acts only on lines still on the list that Cookbook sent; the line's quantity now doesn't matter", () => {
    const list = [
      { id: "a", name: "milk", sent_at: "2026-10-21T01:00:00Z" },
      { id: "b", name: "eggs", sent_at: null },
      { id: "c", name: "flour", sent_at: "2026-10-01T00:00:00Z" }, // before the ledger
    ];
    const lines = takeBackLines(list, [row({}), row({ item_id: "gone", quantity: 9 })]);
    expect(lines.map((l) => [l.id, l.held])).toEqual([
      ["a", [{ upc: MILK, quantity: 2, modality: "PICKUP" }]],
      ["c", []],
    ]);
  });
});

function deps() {
  return {
    reserve: vi.fn<TakeBackDeps["reserve"]>(async () => undefined),
    remove: vi.fn<TakeBackDeps["remove"]>(async () => undefined),
    refused: vi.fn<TakeBackDeps["refused"]>(async () => undefined),
  };
}

const LINE: TakeBackLine = {
  id: "a",
  name: "milk",
  sent_at: "2026-10-21T01:00:00Z",
  held: [
    { upc: MILK, quantity: 3, modality: "PICKUP" },
    { upc: OAT, quantity: 1, modality: null },
  ],
};

describe("taking back", () => {
  it("removes each held product with its own quantity and mode, reserving first, and marks the line unsent", async () => {
    const d = deps();
    const order: string[] = [];
    d.reserve.mockImplementation(async () => void order.push("reserve"));
    d.remove.mockImplementation(async () => void order.push("remove"));
    const { outcomes, unsent } = await takeBack([LINE], d);
    expect(order).toEqual(["reserve", "remove", "remove"]);
    expect(d.reserve).toHaveBeenCalledWith(LINE, LINE.held);
    expect(d.remove.mock.calls).toEqual([
      [MILK, 3, "PICKUP"],
      [OAT, 1, null],
    ]);
    expect(outcomes).toEqual([{ id: "a", name: "milk", result: "taken back", detail: "Took back ×3 + ×1." }]);
    expect(unsent).toEqual(["a"]);
    expect(d.refused).not.toHaveBeenCalled();
  });

  it("a Kroger refusal fails the line, reverses only what was refused, and leaves it sent", async () => {
    const d = deps();
    d.remove.mockImplementation(async (upc: string) => {
      if (upc === OAT) throw new KrogerError("Kroger refused it (400).", 400);
    });
    const { outcomes, unsent } = await takeBack([LINE], d);
    expect(d.refused).toHaveBeenCalledWith(LINE, [LINE.held[1]]);
    expect(unsent).toEqual([]);
    expect(outcomes[0].result).toBe("failed");
    expect(outcomes[0].detail).toMatch(/^Took back ×3, but not ×1: Kroger refused it \(400\)\. Still marked sent/);
    expect(outcomes[0].detail).toMatch(/cart page/);
  });

  it("does not retry without the mode", async () => {
    const d = deps();
    d.remove.mockRejectedValue(new KrogerError("Kroger refused it (422).", 422));
    await takeBack([{ ...LINE, held: [LINE.held[0]] }], d);
    expect(d.remove).toHaveBeenCalledTimes(1);
  });

  it("a reservation the database refuses asks nothing of Kroger", async () => {
    const d = deps();
    d.reserve.mockRejectedValue(new Error("db down"));
    const { outcomes, unsent } = await takeBack([LINE], d);
    expect(d.remove).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ result: "failed", detail: expect.stringMatching(/Kroger wasn't asked/) });
    expect(unsent).toEqual([]);
  });

  it("an unrecordable refusal says the line now reads as taken back", async () => {
    const d = deps();
    d.remove.mockRejectedValue(new KrogerError("Kroger refused it (400).", 400));
    d.refused.mockRejectedValue(new Error("db down"));
    const { outcomes } = await takeBack([{ ...LINE, held: [LINE.held[0]] }], d);
    expect(outcomes[0].detail).toMatch(/reads as taken back — check the cart page/);
  });

  it("a line sent before the ledger is skipped and said, without Kroger", async () => {
    const d = deps();
    const { outcomes } = await takeBack([{ ...LINE, held: [] }], d);
    expect(outcomes[0]).toMatchObject({ result: "skipped", detail: expect.stringMatching(/before Cookbook recorded/) });
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.remove).not.toHaveBeenCalled();
  });

  it("the summary counts every line and never says the cart is empty", () => {
    const s = summarizeTakeBack([
      { id: "a", name: "milk", result: "taken back", detail: "" },
      { id: "b", name: "eggs", result: "failed", detail: "" },
      { id: "c", name: "flour", result: "skipped", detail: "" },
    ]);
    expect(s).toBe("1 taken back, 1 skipped, 1 failed. Anything added to the cart elsewhere is still there.");
    expect(s).not.toMatch(/empty/i);
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
