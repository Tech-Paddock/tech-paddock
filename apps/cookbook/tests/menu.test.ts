import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MENU_DAYS, menuSince } from "@/lib/menu";

/**
 * On the menu (TEC-39 C): seven days rolling from when a recipe was added —
 * Joel's pick over a calendar week — and nothing deletes an old row.
 */
describe("the menu's week", () => {
  it("is seven days back from now, not back to a Monday", () => {
    // A Thursday evening. A calendar week would start on the Monday; this starts
    // exactly a week before.
    const now = new Date("2026-09-24T19:30:00Z");
    expect(MENU_DAYS).toBe(7);
    expect(menuSince(now)).toBe("2026-09-17T19:30:00.000Z");
  });
});

describe("the migration behind it", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_cookbook_menu_and_line_recipes.sql"));
  const sql = file ? readFileSync(resolve(dir, file), "utf8") : "";

  it("exists, and says it is additive", () => {
    expect(file).toBeDefined();
    expect(sql).toMatch(/Shape: \*\*additive\.\*\*/);
  });

  it("protects the new table with RLS, as every table here must be", () => {
    expect(sql).toMatch(/alter table cookbook\.menu enable row level security/);
  });

  it("takes a removed recipe off the menu by cascade", () => {
    expect(sql).toMatch(/references cookbook\.recipes \(id\) on delete cascade/);
  });
});
