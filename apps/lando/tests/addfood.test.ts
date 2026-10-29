// TEC-191: foods added in the app. The picklist is the code catalogue plus lando.foods rows, Misc last.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FOODS, FOOD_UNITS, MISC_ID, findFood, foodNameTaken, picklist, type AddedFood } from "@/lib/foods";
import { InvalidEvent, foodSnapshot, parseNewFood, quickLog, treatEntry, type JournalEvent } from "@/lib/events";
import { defaultFood } from "@/lib/defaults";

// Invented foods (RULES.md, Never 2).
const MEAL: AddedFood = { id: "11111111-1111-4111-8111-111111111111", type: "meal", name: "Test Kibble", unit: "scoop", kcalPer: 300 };
const TREAT: AddedFood = { id: "22222222-2222-4222-8222-222222222222", type: "treat", name: "Test Chew", unit: "piece", kcalPer: null };
const RETIRED: AddedFood = { id: "33333333-3333-4333-8333-333333333333", type: "meal", name: "Old Kibble", unit: "cup", kcalPer: 1, retired: true };
const ADDED = [MEAL, TREAT, RETIRED];

describe("the merged picklist", () => {
  it("is the code catalogue then added foods in the order added, Misc last, retired left off", () => {
    const meals = picklist("meal", ADDED).map((f) => f.id);
    expect(meals).toEqual([...FOODS.meal.filter((f) => f.id !== MISC_ID).map((f) => f.id), MEAL.id, MISC_ID]);
    expect(meals.at(-1)).toBe(MISC_ID);
    expect(picklist("treat", ADDED).map((f) => f.id).slice(-2)).toEqual([TREAT.id, MISC_ID]);
  });

  it("keeps each food on its own list", () => {
    expect(picklist("meal", ADDED).some((f) => f.id === TREAT.id)).toBe(false);
    expect(picklist("treat", ADDED).some((f) => f.id === MEAL.id)).toBe(false);
  });

  it("is the code catalogue alone when nothing was added", () => {
    expect(picklist("meal")).toEqual(picklist("meal", []));
  });
});

describe("findFood for an added food", () => {
  it("resolves it, a retired one too, so an old entry can be corrected", () => {
    expect(findFood("meal", MEAL.id, ADDED)).toMatchObject({ name: "Test Kibble", kcalPer: 300, unit: "scoop" });
    expect(findFood("meal", RETIRED.id, ADDED)?.retired).toBe(true);
  });
  it("does not resolve it on the other list, or without the added foods", () => {
    expect(findFood("treat", MEAL.id, ADDED)).toBeNull();
    expect(findFood("meal", MEAL.id)).toBeNull();
  });
  it("snapshots it like a code item", () => {
    expect(foodSnapshot("meal", MEAL.id, 1.5, ADDED)).toEqual({
      type: "meal",
      item_id: MEAL.id,
      item_name: "Test Kibble",
      kcal_per: 300,
      unit: "scoop",
      amount: 1.5,
    });
    expect(() => foodSnapshot("meal", MEAL.id, 1)).toThrow(InvalidEvent);
  });
  it("makes a queued treat's entry", () => {
    const e = treatEntry({ id: "44444444-4444-4444-8444-444444444444", item_id: TREAT.id, amount: 2 }, "2026-10-29T12:00:00.000Z", null, ADDED);
    expect(e.details).toMatchObject({ item_id: TREAT.id, item_name: "Test Chew", unit: "piece", kcal_per: null });
  });
});

describe("the add-a-food check", () => {
  const ok = { type: "meal", name: " Test  Mix ", unit: "cup", kcalPer: 350 };

  it("tidies the name and keeps a valid unit and calories", () => {
    expect(parseNewFood(ok)).toEqual({ type: "meal", name: "Test Mix", unit: "cup", kcalPer: 350 });
  });
  it("takes calories as optional", () => {
    expect(parseNewFood({ ...ok, kcalPer: undefined }).kcalPer).toBeNull();
    expect(parseNewFood({ ...ok, kcalPer: null }).kcalPer).toBeNull();
  });
  it("offers cup, scoop, piece, treat, pop and gram", () => {
    expect([...FOOD_UNITS]).toEqual(["cup", "scoop", "piece", "treat", "pop", "gram"]);
    for (const unit of FOOD_UNITS) expect(parseNewFood({ ...ok, unit }).unit).toBe(unit);
    expect(() => parseNewFood({ ...ok, unit: "bucket" })).toThrow(/unit/);
    expect(() => parseNewFood({ ...ok, unit: undefined })).toThrow(/unit/);
  });
  it("needs a name of 1 to 60 characters", () => {
    expect(() => parseNewFood({ ...ok, name: "   " })).toThrow(/name/);
    expect(() => parseNewFood({ ...ok, name: "x".repeat(61) })).toThrow(/name/);
    expect(() => parseNewFood({ ...ok, name: 7 })).toThrow(/name/);
    expect(parseNewFood({ ...ok, name: "x".repeat(60) }).name).toHaveLength(60);
  });
  it("needs a type of meal or treat", () => {
    expect(() => parseNewFood({ ...ok, type: "snack" })).toThrow(InvalidEvent);
  });
  it("refuses calories that are not a number above 0", () => {
    for (const kcalPer of [0, -1, "12", Number.NaN, 10001]) expect(() => parseNewFood({ ...ok, kcalPer })).toThrow(/calories/);
  });
  it("refuses a body that is not an object", () => {
    for (const body of [null, "x", [], 5]) expect(() => parseNewFood(body)).toThrow(InvalidEvent);
  });
  it("refuses a duplicate name in its own list, ignoring case and spaces, code or added", () => {
    expect(() => parseNewFood({ ...ok, name: "test   kibble" }, ADDED)).toThrow(/already in the list/);
    expect(() => parseNewFood({ ...ok, name: "ROYAL CANIN DACHSHUND PUPPY" })).toThrow(/already in the list/);
    expect(() => parseNewFood({ ...ok, name: "Old Kibble" }, ADDED)).toThrow(/already in the list/); // retired too
    expect(foodNameTaken("treat", "Test Kibble", ADDED)).toBe(false); // the other list
    expect(parseNewFood({ ...ok, type: "treat", name: "Test Kibble" }, ADDED).type).toBe("treat");
  });
});

describe("Quick log's Meal prefill and the form's defaults with an added food", () => {
  const meal = (item: string): JournalEvent =>
    ({
      id: "55555555-5555-4555-8555-555555555555",
      kind: "food",
      at: "2026-10-29T12:00:00.000Z",
      person_id: null,
      details: { type: "meal", item_id: item, item_name: "x", kcal_per: 1, unit: "scoop", amount: 0.5 },
      note: null,
      voids: null,
      created_at: "2026-10-29T12:00:00.000Z",
    }) as JournalEvent;

  it("opens on an added food as the last meal", () => {
    expect(quickLog("food", meal(MEAL.id), ADDED)).toEqual({ form: "food", itemId: MEAL.id, amount: 0.5 });
  });
  it("falls back to the usual when that food is not known", () => {
    expect(quickLog("food", meal(MEAL.id))).toEqual({ form: "food", itemId: null, amount: null });
  });
  it("remembers an added meal as the phone's default, and Misc when it is retired or unknown", () => {
    expect(defaultFood("meal", { meal: MEAL.id }, ADDED)).toBe(MEAL.id);
    expect(defaultFood("meal", { meal: RETIRED.id }, ADDED)).toBe(MISC_ID);
    expect(defaultFood("meal", { meal: MEAL.id })).toBe(MISC_ID);
  });
});

describe("the lando_foods migration", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_lando_foods.sql"));
  const sql = file ? readFileSync(resolve(dir, file), "utf8").replace(/--.*$/gm, "") : "";

  it("exists, and creates lando.foods in the lando schema, never public", () => {
    expect(file).toBeDefined();
    expect(sql).toMatch(/CREATE TABLE lando\.foods \(/);
    expect(sql).not.toMatch(/public\./);
  });
  it("turns RLS on in the same file and writes no policy", () => {
    expect(sql).toMatch(/ALTER TABLE lando\.foods ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
  it("has the columns: id, type, name, unit, kcal_per (nullable), created_at, retired (default false)", () => {
    for (const col of [
      /id uuid PRIMARY KEY/,
      /type text NOT NULL/,
      /name text NOT NULL/,
      /unit text NOT NULL/,
      /created_at timestamptz NOT NULL DEFAULT now\(\)/,
      /retired boolean NOT NULL DEFAULT false/,
    ])
      expect(sql).toMatch(col);
    expect(sql).toMatch(/kcal_per numeric\(10, 3\) CHECK \(kcal_per IS NULL/);
  });
  it("allows exactly the app's types and units, so the database and the form agree", () => {
    expect(sql).toMatch(/type IN \('meal', 'treat'\)/);
    const units = /unit IN \(([^)]*)\)/.exec(sql)![1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(units).toEqual([...FOOD_UNITS]);
  });
  it("keeps a name unique within its list, and is additive: it drops and alters nothing", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX foods_type_name_key ON lando\.foods \(type, lower\(btrim\(name\)\)\)/);
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE)\b/i);
  });
  it("gives every added food an id that details_ok's item_id pattern accepts (a uuid does)", () => {
    for (const f of ADDED) expect(f.id).toMatch(/^[a-z0-9-]{1,60}$/);
  });
});
