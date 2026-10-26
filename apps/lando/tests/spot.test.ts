// TEC-161: an inside potty's optional spot (crate, pen, loose).
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { InvalidEvent, describe as describeEvent, isAccident, parseDetails } from "@/lib/events";

describe("potty spot", () => {
  const inside = { what: "pee", where: "inside" };
  it("keeps a spot on an inside potty; an old entry without one stays valid", () => {
    for (const spot of ["crate", "pen", "loose"]) {
      expect(parseDetails("potty", { ...inside, spot })).toEqual({ ...inside, spot });
    }
    expect(parseDetails("potty", inside)).not.toHaveProperty("spot");
    expect(parseDetails("potty", { ...inside, spot: null })).toEqual(inside);
  });
  it("refuses a spot outside, or a value that is not one", () => {
    expect(() => parseDetails("potty", { what: "pee", where: "outside", spot: "crate" })).toThrow(/inside only/);
    expect(() => parseDetails("potty", { ...inside, spot: "couch" })).toThrow(InvalidEvent);
    expect(() => parseDetails("potty", { ...inside, spot: ["crate"] })).toThrow(InvalidEvent);
  });
  it("leash stays outside only", () => {
    expect(() => parseDetails("potty", { ...inside, leash: "leashed" })).toThrow(/outside only/);
  });
  it("reads in the feed, and still counts as an accident", () => {
    const e = { kind: "potty" as const, details: { ...inside, spot: "crate" } };
    expect(describeEvent(e)).toEqual({ title: "Accident", detail: "pee, inside · crate" });
    expect(isAccident(e)).toBe(true);
    expect(describeEvent({ kind: "potty", details: { what: "both", where: "inside", spot: "loose" } }).detail).toBe("pee + poop, inside · loose");
    expect(describeEvent({ kind: "potty", details: inside }).detail).toBe("pee, inside");
  });
});

describe("migration lando_potty_inside_spot", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const file = files.find((f) => f.endsWith("_lando_potty_inside_spot.sql"));
  const read = (f: string) => readFileSync(resolve(dir, f), "utf8");
  const fnOf = (sql: string) => sql.slice(sql.indexOf("create or replace function lando.details_ok(kind"), sql.indexOf("$fn$;"));
  const block = (fn: string, from: string, to: string) => fn.slice(fn.indexOf(from), fn.indexOf(to));

  it("sorts after lando_vet_weight", () => {
    expect(file).toBeDefined();
    expect(file! > files.find((f) => f.endsWith("_lando_vet_weight.sql"))!).toBe(true);
  });
  it("widens potty with an inside-only spot", () => {
    const potty = block(fnOf(read(file!)), "WHEN 'potty' THEN", "WHEN 'food' THEN");
    expect(potty).toContain("ARRAY['what', 'where', 'leash', 'spot', 'issue', 'photos']");
    expect(potty).toMatch(/details \? 'spot' THEN\s+details ->> 'where' = 'inside'/);
    expect(potty).toContain("details ->> 'spot' IN ('crate', 'pen', 'loose')");
    expect(potty).toContain("details ->> 'leash' IN ('leashed', 'unleashed', 'pen')");
  });
  it("is only lock_timeout and the function: no DROP, no ALTER", () => {
    const code = read(file!).replace(/--.*$/gm, "");
    expect(code.trim().startsWith("set local lock_timeout = '5s';")).toBe(true);
    const statements = code.replace(/\$fn\$[\s\S]*?\$fn\$/, "$fn$").split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(code).not.toMatch(/\b(drop|alter|truncate|delete|update|insert)\b/i);
  });
  it("keeps every other branch exactly as lando_vet_weight had it", () => {
    const prev = fnOf(read(files.find((f) => f.endsWith("_lando_vet_weight.sql"))!));
    const now = fnOf(read(file!));
    for (const [from, to] of [
      ["WHEN 'food' THEN", "WHEN 'exercise' THEN"],
      ["WHEN 'exercise' THEN", "WHEN 'weight' THEN"],
      ["WHEN 'weight' THEN", "WHEN 'health' THEN"],
      ["WHEN 'health' THEN", "WHEN 'void' THEN"],
    ]) {
      expect(block(now, from, to)).toBe(block(prev, from, to));
    }
  });
});
