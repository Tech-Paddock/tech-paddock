// TEC-176: an outside potty's optional time outside, in minutes.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { InvalidEvent, OUT_MINUTES_CHIPS, describe as describeEvent, parseDetails } from "@/lib/events";

describe("potty time outside", () => {
  const outside = { what: "pee", where: "outside" };
  it("keeps a whole number of minutes from 1 to 120 on an outside potty", () => {
    for (const minutes of [1, 5, 30, 45, 120]) {
      expect(parseDetails("potty", { ...outside, minutes })).toEqual({ ...outside, minutes });
    }
    expect(parseDetails("potty", { ...outside, leash: "leashed", minutes: 10 })).toEqual({ ...outside, leash: "leashed", minutes: 10 });
  });
  it("is optional: old entries and null still pass, with no key", () => {
    expect(parseDetails("potty", outside)).not.toHaveProperty("minutes");
    expect(parseDetails("potty", { ...outside, minutes: null })).toEqual(outside);
    expect(parseDetails("potty", { what: "none", where: "outside", minutes: 15 })).toEqual({ what: "none", where: "outside", minutes: 15 });
  });
  it("refuses a number out of range, a fraction, or a non-number", () => {
    for (const minutes of [0, -5, 121, 7.5, NaN, "10", [10], true]) {
      expect(() => parseDetails("potty", { ...outside, minutes })).toThrow(InvalidEvent);
    }
  });
  it("is outside only: inside refuses it", () => {
    expect(() => parseDetails("potty", { what: "pee", where: "inside", minutes: 10 })).toThrow(/outside only/);
  });
  it("offers chips 5 to 30 in fives", () => {
    expect([...OUT_MINUTES_CHIPS]).toEqual([5, 10, 15, 20, 25, 30]);
  });
  it("reads in the feed after the leash, before the link and photos; a row without one is unchanged", () => {
    const d = (details: Record<string, unknown>) => describeEvent({ kind: "potty", details }).detail;
    expect(d({ ...outside, leash: "leashed", minutes: 5 })).toBe("outside · leashed · 5 min");
    expect(d({ ...outside, minutes: 20 })).toBe("outside · 20 min");
    expect(d({ ...outside, leash: "pen", minutes: 15, photos: ["health/00000000-0000-4000-8000-000000000001.jpg"] })).toBe(
      "outside · in pen · 15 min · 1 photo"
    );
    expect(d({ ...outside, leash: "leashed" })).toBe("outside · leashed");
    expect(d(outside)).toBe("outside");
  });
});

describe("migration lando_potty_minutes", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const file = files.find((f) => f.endsWith("_lando_potty_minutes.sql"))!;
  const prevFile = files.find((f) => f.endsWith("_lando_details_ok_search_path.sql"))!;
  const read = (f: string) => readFileSync(resolve(dir, f), "utf8");
  const fnOf = (sql: string) => sql.slice(sql.indexOf("create or replace function lando.details_ok(kind"), sql.indexOf("$fn$;"));
  const block = (fn: string, from: string, to: string) => fn.slice(fn.indexOf(from), fn.indexOf(to));

  it("sorts after lando_details_ok_search_path", () => {
    expect(file).toBeDefined();
    expect(file > prevFile).toBe(true);
  });
  it("widens potty with an outside-only integer minutes from 1 to 120", () => {
    const potty = block(fnOf(read(file)), "WHEN 'potty' THEN", "WHEN 'food' THEN");
    expect(potty).toContain("ARRAY['what', 'where', 'leash', 'spot', 'minutes', 'issue', 'photos']");
    expect(potty).toMatch(/details \? 'minutes' THEN\s+details ->> 'where' = 'outside'/);
    expect(potty).toContain("(details ->> 'minutes')::numeric BETWEEN 1 AND 120");
    expect(potty).toContain("(details ->> 'minutes')::numeric % 1 = 0");
    expect(potty).toContain("details ->> 'leash' IN ('leashed', 'unleashed', 'pen')");
  });
  it("keeps set search_path = '' and is only lock_timeout and the function: no DROP, no ALTER", () => {
    const code = read(file).replace(/--.*$/gm, "");
    expect(code).toContain("set search_path = ''");
    expect(code.trim().startsWith("set local lock_timeout = '5s';")).toBe(true);
    const statements = code.replace(/\$fn\$[\s\S]*?\$fn\$/, "$fn$").split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(code).not.toMatch(/\b(drop|alter|truncate|delete|update|insert)\b/i);
  });
  it("keeps every other branch exactly as the file before it had it", () => {
    const prev = fnOf(read(prevFile));
    const now = fnOf(read(file));
    for (const [from, to] of [
      ["WHEN 'food' THEN", "WHEN 'exercise' THEN"],
      ["WHEN 'exercise' THEN", "WHEN 'weight' THEN"],
      ["WHEN 'weight' THEN", "WHEN 'health' THEN"],
      ["WHEN 'health' THEN", "WHEN 'void' THEN"],
    ]) {
      expect(block(now, from, to)).toBe(block(prev, from, to));
    }
    expect(now.slice(now.indexOf("WHEN 'void' THEN"))).toBe(prev.slice(prev.indexOf("WHEN 'void' THEN")));
  });
});
