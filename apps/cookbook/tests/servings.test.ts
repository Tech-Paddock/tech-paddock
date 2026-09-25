import { describe, expect, it } from "vitest";
import { toServingRows, type Recipe } from "@/lib/recipes";
import { ConflictError, InputError, LookupError, errorBody, statusOf } from "@/lib/errors";

/**
 * **`GET /api/servings` is a contract with Health** (TEC-11; its one home is
 * `RULES.md`). Health reads these numbers once per logged meal and snapshots them,
 * so a wrong division here is a wrong number in a past day that nothing rewrites.
 */

function recipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    name: "Weeknight chilli",
    servings: 6,
    kcal: 2400,
    protein_g: 180,
    carbs_g: 120,
    fat_g: 100,
    origin: "manual",
    source: "estimate",
    model: "claude-haiku-4-5",
    source_url: null,
    ingredients: ["500g beef mince"],
    method: null,
    note: null,
    created_at: "2026-09-25T00:00:00Z",
    ...over,
  };
}

describe("the servings contract", () => {
  it("divides the whole pot by the servings — Cookbook does the division, not Health", () => {
    expect(toServingRows([recipe()])).toEqual([
      {
        id: "r1",
        name: "Weeknight chilli",
        servings: 6,
        per_serving: { kcal: 400, protein_g: 30, carbs_g: 20, fat_g: 100 / 6 },
      },
    ]);
  });

  it("does not round — Health multiplies before it displays", () => {
    const [row] = toServingRows([recipe({ fat_g: 100, servings: 6 })]);
    expect(row.per_serving.fat_g).toBe(100 / 6);
  });

  it("carries exactly the contract's fields and no others", () => {
    // Additive only: a new field is free, but one arriving by accident — the
    // method, the model, a note — is a field Health may start depending on.
    const [row] = toServingRows([recipe()]);
    expect(Object.keys(row).sort()).toEqual(["id", "name", "per_serving", "servings"]);
    expect(Object.keys(row.per_serving).sort()).toEqual(["carbs_g", "fat_g", "kcal", "protein_g"]);
  });

  it("an empty book is an empty list, which is different from a failed read", () => {
    expect(toServingRows([])).toEqual([]);
  });
});

describe("what each failure is reported as", () => {
  // 503 is what Health reads as "couldn't reach the Cookbook". A refused draft
  // or a duplicate name reported that way would read there as an outage.
  it("503 means only that the database did not answer", () => {
    expect(statusOf(new LookupError("Couldn't read the book: timeout"))).toBe(503);
  });

  it("a refused input is 400 and a collision is 409", () => {
    expect(statusOf(new InputError("The recipe needs a name."))).toBe(400);
    expect(statusOf(new ConflictError('"Chilli" is already in the book.'))).toBe(409);
  });

  it("anything else is 500 and shows the route's fallback, not its own message", () => {
    expect(errorBody(new Error("secret internals"), "Couldn't save that.")).toEqual({
      status: 500,
      error: "Couldn't save that.",
    });
  });

  it("a typed error shows its own sentence", () => {
    expect(errorBody(new InputError("Nothing to add."), "fallback")).toEqual({
      status: 400,
      error: "Nothing to add.",
    });
  });
});
