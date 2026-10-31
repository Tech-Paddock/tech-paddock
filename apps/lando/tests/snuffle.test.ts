// TEC-195: Snuffle mat is a food type beside Meal and Treat. It picks from the meal list and counts as a meal.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FOOD_TYPES, MISC_ID, findFood, foodNameTaken, isMealType, listOf, picklist, type AddedFood } from "@/lib/foods";
import { defaultFood } from "@/lib/defaults";
import {
  InvalidEvent,
  describe as describeEvent,
  mealPillLabel,
  mealsSummary,
  parseDetails,
  parseNewFood,
  quickLog,
  sinceLast,
  type JournalEvent,
} from "@/lib/events";

// Invented ids. Nothing here is a real person or a real dog's record.
let n = 0;
const uuid = () => `00000000-0000-4000-d000-${String(++n).padStart(12, "0")}`;
const NOW = new Date(2026, 9, 29, 18, 0, 0);
const at = (h: number) => new Date(2026, 9, 29, h, 0, 0).toISOString();
const ev = (over: Partial<JournalEvent> & Pick<JournalEvent, "kind" | "at">): JournalEvent => ({
  id: uuid(), person_id: null, details: {}, note: null, voids: null, created_at: over.at, ...over,
});
const voidOf = (e: JournalEvent): JournalEvent => ev({ kind: "void", at: e.at, voids: e.id });
const food = (h: number, type: "meal" | "snuffle" | "treat", unit: string | null, amount: number | null, item = "x") =>
  ev({ kind: "food", at: at(h), details: { type, item_id: item, item_name: "Invented food", kcal_per: null, unit, amount } });

const ADDED: AddedFood[] = [{ id: "11111111-1111-4111-8111-111111111111", type: "meal", name: "Test Kibble", unit: "scoop", kcalPer: 300 }];

describe("the type list", () => {
  it("is Meal, Snuffle mat and Treat, and a snuffle mat uses the meal list", () => {
    expect([...FOOD_TYPES]).toEqual(["meal", "snuffle", "treat"]);
    expect(listOf("snuffle")).toBe("meal");
    expect(listOf("meal")).toBe("meal");
    expect(listOf("treat")).toBe("treat");
    expect([isMealType("meal"), isMealType("snuffle"), isMealType("treat")]).toEqual([true, true, false]);
  });
});

describe("a snuffle mat's picklist is the meal list", () => {
  it("is the same items, added meal foods and Misc included", () => {
    expect(picklist("snuffle", ADDED)).toEqual(picklist("meal", ADDED));
    expect(picklist("snuffle", ADDED).map((f) => f.id)).toEqual([
      "purina-pro-plan-toy-puppy-chicken-rice",
      "royal-canin-dachshund-puppy",
      ADDED[0].id,
      MISC_ID,
    ]);
    expect(foodNameTaken("snuffle", "test kibble", ADDED)).toBe(true);
  });
  it("defaults the way a meal does", () => {
    expect(defaultFood("snuffle", { meal: ADDED[0].id }, ADDED)).toBe(ADDED[0].id);
    expect(defaultFood("snuffle", {})).toBe(MISC_ID);
  });
  it("adding a food on a snuffle mat adds a meal food", () => {
    expect(parseNewFood({ type: "snuffle", name: "Fresh Mix", unit: "cup" }).type).toBe("meal");
  });
});

describe("the retired snuffle-mat item", () => {
  it("is off the picklist but still resolves, so an old entry reads and corrects", () => {
    expect(picklist("meal").some((f) => f.id === "snuffle-mat")).toBe(false);
    expect(picklist("snuffle").some((f) => f.id === "snuffle-mat")).toBe(false);
    expect(findFood("meal", "snuffle-mat")).toMatchObject({ retired: true, unit: "cup", kcalPer: null });
    expect(findFood("snuffle", "snuffle-mat")?.retired).toBe(true);
    expect(parseDetails("food", { type: "meal", item_id: "snuffle-mat", amount: 0.5 })).toMatchObject({ item_name: "Snuffle mat" });
  });
});

describe("parseDetails and the feed row", () => {
  it("saves a snuffle mat with a meal item, snapshotting the item", () => {
    expect(parseDetails("food", { type: "snuffle", item_id: "royal-canin-dachshund-puppy", amount: 0.25 })).toEqual({
      type: "snuffle",
      item_id: "royal-canin-dachshund-puppy",
      item_name: "Royal Canin Dachshund Puppy",
      kcal_per: 369,
      unit: "cup",
      amount: 0.25,
    });
  });
  it("refuses a treat item on a snuffle mat", () => {
    expect(() => parseDetails("food", { type: "snuffle", item_id: "freeze-dried-beef-hearts" })).toThrow(InvalidEvent);
  });
  it("is titled Snuffle mat, with the food and amount like a meal row", () => {
    expect(describeEvent(food(8, "snuffle", "cup", 0.5))).toEqual({ title: "Snuffle mat", detail: "Invented food · 1/2 cup" });
    expect(describeEvent(food(8, "meal", "cup", 0.5)).title).toBe("Meal");
  });
});

describe("everything meal-based counts it as a meal (the Meal pill counts half, TEC-197)", () => {
  it("the Meal pill's N and cups", () => {
    const events = [food(7, "meal", "cup", 0.5), food(10, "snuffle", "cup", 0.25), food(11, "treat", "treat", 2)];
    expect(mealsSummary(events, NOW)).toEqual({ count: 1.5, cups: 0.75 });
    expect(mealPillLabel(events, NOW)).toBe("Meals: 1½ · ¾ cup");
    expect(mealPillLabel([food(10, "snuffle", "cup", null)], NOW)).toBe("Meals: ½");
  });
  it("time since the last meal", () => {
    const events = [food(7, "meal", "cup", 1), food(12, "snuffle", "cup", 0.25)];
    expect(sinceLast(events, NOW).food?.id).toBe(events[1].id);
  });
  it("quick log prefills from a snuffle mat's item and amount", () => {
    const last = food(12, "snuffle", "cup", 0.25, "royal-canin-dachshund-puppy");
    expect(quickLog("food", last)).toEqual({ form: "food", itemId: "royal-canin-dachshund-puppy", amount: 0.25 });
  });
});

describe("the migration", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const name = readdirSync(dir).find((f) => f.endsWith("_lando_snuffle_type.sql"))!;
  const sql = readFileSync(resolve(dir, name), "utf8");
  const code = sql.replace(/--.*$/gm, "");
  it("widens the food type list, keeps meal and treat, pins search_path, and never drops", () => {
    expect(code).toMatch(/create or replace function lando\.details_ok\(kind text, details jsonb\)/);
    expect(code).toMatch(/details ->> 'type' IN \('meal', 'snuffle', 'treat'\)/);
    expect(code).toMatch(/set search_path = ''/);
    expect(code).not.toMatch(/\b(drop|alter)\b/i);
  });
  it("leaves lando.foods alone: a snuffle mat uses meal foods", () => {
    expect(code).not.toMatch(/lando\.foods/);
  });
});

describe("the Meal pill counts a snuffle mat as half a meal (TEC-197)", () => {
  it("meals only read whole", () => {
    expect(mealPillLabel([food(7, "meal", "cup", 0.5), food(12, "meal", "cup", 0.5)], NOW)).toBe("Meals: 2 · 1 cup");
  });
  it("snuffle only reads a half", () => {
    expect(mealPillLabel([food(10, "snuffle", "cup", null)], NOW)).toBe("Meals: ½");
    expect(mealPillLabel([food(10, "snuffle", "cup", 0.25)], NOW)).toBe("Meals: ½ · ¼ cup");
  });
  it("mixed reads 2½, with cups in full", () => {
    const events = [food(7, "meal", "cup", 0.5), food(9, "meal", "cup", 0.5), food(10, "snuffle", "cup", 0.25)];
    expect(mealPillLabel(events, NOW)).toBe("Meals: 2½ · 1¼ cups");
    expect(mealPillLabel([food(7, "meal", "cup", null), food(10, "snuffle", "cup", null), food(11, "snuffle", "cup", null)], NOW)).toBe("Meals: 2");
  });
  it("leaves a voided snuffle mat out", () => {
    const m = food(10, "snuffle", "cup", 0.25);
    expect(mealPillLabel([food(7, "meal", "cup", 0.5), m, voidOf(m)], NOW)).toBe("Meals: 1 · ½ cup");
  });
});
