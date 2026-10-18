import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { localToday, menuDayLabel, parseDay } from "@/lib/menuDay";

/**
 * On the menu (TEC-39 C), with a day each (Joel, 2026-10-05): picked when the
 * ingredients go to the list, shown as "Tue 10/7", and cleared only by Joel.
 */
describe("the menu's day", () => {
  it("reads a real calendar day and nothing else", () => {
    expect(parseDay("2026-10-07")).toBe("2026-10-07");
    expect(parseDay(" 2026-10-07 ")).toBe("2026-10-07");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("10/7/2026")).toBeNull();
    expect(parseDay("")).toBeNull();
    expect(parseDay(undefined)).toBeNull();
    expect(parseDay(20261007)).toBeNull();
  });

  it("is labelled in Joel's format, on the day it names wherever the browser is", () => {
    // 2026-10-07 is a Wednesday. Built at UTC midnight it would read Tuesday the
    // 6th in Denver; the label must not move it.
    expect(menuDayLabel("2026-10-07")).toBe("Wed 10/7");
    expect(menuDayLabel("2026-12-25")).toBe("Fri 12/25");
  });

  it("takes today from the local clock, not UTC", () => {
    // 11pm local on the 5th is still the 5th, whatever UTC says.
    expect(localToday(new Date(2026, 9, 5, 23, 0))).toBe("2026-10-05");
    expect(localToday(new Date(2026, 0, 9, 0, 30))).toBe("2026-01-09");
  });
});

describe("the migrations behind it", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const read = (suffix: string) => {
    const file = readdirSync(dir).find((f) => f.endsWith(suffix));
    return { file, sql: file ? readFileSync(resolve(dir, file), "utf8") : "" };
  };

  it("the menu table exists, additive, with RLS and a cascade from the book", () => {
    const { file, sql } = read("_cookbook_menu_and_line_recipes.sql");
    expect(file).toBeDefined();
    expect(sql).toMatch(/Shape: \*\*additive\.\*\*/);
    expect(sql).toMatch(/alter table cookbook\.menu enable row level security/);
    expect(sql).toMatch(/references cookbook\.recipes \(id\) on delete cascade/);
  });

  it("the day is additive, and the code already live keeps working against it", () => {
    const { file, sql } = read("_cookbook_menu_day.sql");
    expect(file).toBeDefined();
    expect(sql).toMatch(/Shape: \*\*additive\.\*\*/);
    // Old code inserts no day, so not-null must come with a default.
    expect(sql).toMatch(/alter column day set default/);
    expect(sql).toMatch(/alter column day set not null/);
    // Still one row a recipe: the primary key is not touched.
    expect(sql).not.toMatch(/drop constraint|add primary key/i);
  });
});
