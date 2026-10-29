// TEC-176: an outside potty's optional time outside, in minutes.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { InvalidEvent, OUT_MINUTES_CHIPS, OUT_MINUTES_MAX, describe as describeEvent, outMinutesAria, outMinutesChip, outMinutesLabel, parseDetails } from "@/lib/events";

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
  it("offers five range chips (TEC-193): up to 5, 5-15, 15-30, 30-45, 45-60, each saving its upper bound; the stored bound stays 1 to 120", () => {
    expect([...OUT_MINUTES_CHIPS]).toEqual([5, 15, 30, 45, 60]);
    expect(OUT_MINUTES_CHIPS.map(outMinutesLabel)).toEqual(["≤5", "5–15", "15–30", "30–45", "45–60"]);
    expect(OUT_MINUTES_CHIPS.map(outMinutesAria)).toEqual(["5 minutes or less", "5 to 15 minutes", "15 to 30 minutes", "30 to 45 minutes", "45 to 60 minutes"]);
    expect(OUT_MINUTES_MAX).toBe(120);
    // What a chip saves passes the same check as before.
    for (const m of OUT_MINUTES_CHIPS) expect(parseDetails("potty", { ...outside, minutes: m })).toEqual({ ...outside, minutes: m });
  });
  it("opens a correction on the chip its value matches, and on none for an older value", () => {
    expect([5, 15, 30, 45, 60].map(outMinutesChip)).toEqual([5, 15, 30, 45, 60]);
    for (const old of [1, 7, 10, 20, 25, 90, 120]) expect(outMinutesChip(old)).toBeNull();
    expect(outMinutesChip(null)).toBeNull();
    expect(outMinutesChip(undefined)).toBeNull();
  });
  it("reads in the feed (a range for a chip's value) after the leash, before the link and photos; a row without one is unchanged", () => {
    const d = (details: Record<string, unknown>) => describeEvent({ kind: "potty", details }).detail;
    expect(d({ ...outside, leash: "leashed", minutes: 5 })).toBe("outside · leashed · ≤5 min");
    expect(d({ ...outside, leash: "leashed", minutes: 15 })).toBe("outside · leashed · 5–15 min");
    expect(d({ ...outside, minutes: 60 })).toBe("outside · 45–60 min");
    // An older entry holding another number still reads "N min".
    for (const old of [10, 20, 25, 7, 90]) expect(d({ ...outside, minutes: old })).toBe(`outside · ${old} min`);
    expect(d({ ...outside, leash: "pen", minutes: 30, photos: ["health/00000000-0000-4000-8000-000000000001.jpg"] })).toBe(
      "outside · in pen · 15–30 min · 1 photo"
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
