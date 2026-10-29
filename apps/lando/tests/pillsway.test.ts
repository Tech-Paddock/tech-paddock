// TEC-186: the pills as the way in. The Fun clock, Fun's Pee and Poop inference, the retired leash and spot
// ids, and the migration that widens lando.details_ok with `box`.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InvalidEvent,
  LEASH,
  LEASH_LABELS,
  LEASH_OFFERED,
  SPOT,
  SPOT_LABELS,
  SPOT_OFFERED,
  describe as describeEvent,
  funPotty,
  isAccident,
  leashOptions,
  parseDetails,
  sinceLast,
  spotOptions,
  type JournalEvent,
} from "@/lib/events";

// Invented ids. Nothing here is a real person or a real dog's record.
let n = 0;
const uuid = () => `00000000-0000-4000-b000-${String(++n).padStart(12, "0")}`;
function ev(over: Partial<JournalEvent> & Pick<JournalEvent, "kind" | "at">): JournalEvent {
  return { id: uuid(), person_id: null, details: {}, note: null, voids: null, created_at: over.at, ...over };
}
const exercise = (at: string, type: "walk" | "playtime" | "training") =>
  ev({ kind: "exercise", at, details: { type, where: "outside", with_dogs: false, minutes: 15, treats: 0 } });

const NOW = new Date("2026-10-28T15:00:00Z");

describe("the Fun clock", () => {
  it("counts walks and playtime", () => {
    const walk = exercise("2026-10-28T10:00:00Z", "walk");
    const play = exercise("2026-10-28T12:00:00Z", "playtime");
    expect(sinceLast([walk], NOW).exercise).toBe(walk);
    expect(sinceLast([walk, play], NOW).exercise).toBe(play);
  });

  it("is not reset by a training, which is newer", () => {
    const walk = exercise("2026-10-28T10:00:00Z", "walk");
    const training = exercise("2026-10-28T13:00:00Z", "training");
    expect(sinceLast([walk, training], NOW).exercise).toBe(walk);
  });

  it("reads none when only trainings exist", () => {
    expect(sinceLast([exercise("2026-10-28T13:00:00Z", "training")], NOW).exercise).toBeNull();
  });
});

describe("funPotty — where a Fun form's Pee or Poop lands", () => {
  it("a walk is outside and leashed, whatever Where says", () => {
    for (const where of ["outside", "inside"] as const) {
      expect(funPotty({ type: "walk", where }, "pee")).toEqual({ what: "pee", where: "outside", leash: "leashed" });
    }
    expect(funPotty({ type: "walk", where: "outside" }, "poop")).toEqual({ what: "poop", where: "outside", leash: "leashed" });
  });

  it("playtime outside is outside, with no leash picked", () => {
    expect(funPotty({ type: "playtime", where: "outside" }, "poop")).toEqual({ what: "poop", where: "outside" });
  });

  it("playtime inside is inside, an accident", () => {
    const d = funPotty({ type: "playtime", where: "inside" }, "pee")!;
    expect(d).toEqual({ what: "pee", where: "inside" });
    expect(isAccident({ kind: "potty", details: d })).toBe(true);
  });

  it("training gets none", () => {
    expect(funPotty({ type: "training", where: "outside" }, "pee")).toBeNull();
  });

  it("every answer is a valid potty the server accepts", () => {
    for (const type of ["walk", "playtime"] as const) {
      for (const where of ["outside", "inside"] as const) {
        for (const what of ["pee", "poop"] as const) {
          expect(() => parseDetails("potty", funPotty({ type, where }, what))).not.toThrow();
        }
      }
    }
  });
});

describe("leash and spot: box offered, the old ids retired", () => {
  it("offers Leashed / Unleashed / In box and Box / Loose", () => {
    expect(leashOptions("")).toEqual([["leashed", "Leashed"], ["unleashed", "Unleashed"], ["box", "In box"]]);
    expect(spotOptions("")).toEqual([["box", "Box"], ["loose", "Loose"]]);
    expect([...LEASH_OFFERED]).toEqual(["leashed", "unleashed", "box"]);
    expect([...SPOT_OFFERED]).toEqual(["box", "loose"]);
  });

  it("keeps every old id valid and labelled; nothing is deleted", () => {
    expect([...LEASH].sort()).toEqual(["box", "leashed", "pen", "unleashed"]);
    expect([...SPOT].sort()).toEqual(["box", "crate", "loose", "pen"]);
    expect(LEASH_LABELS.pen).toBe("In pen");
    expect(SPOT_LABELS.crate).toBe("Crate");
    expect(SPOT_LABELS.pen).toBe("Pen");
    for (const leash of LEASH) expect(parseDetails("potty", { what: "pee", where: "outside", leash })).toMatchObject({ leash });
    for (const spot of SPOT) expect(parseDetails("potty", { what: "pee", where: "inside", spot })).toMatchObject({ spot });
    expect(() => parseDetails("potty", { what: "pee", where: "outside", leash: "crate" })).toThrow(InvalidEvent);
    expect(() => parseDetails("potty", { what: "pee", where: "inside", spot: "leashed" })).toThrow(InvalidEvent);
  });

  it("a correction on an entry holding a retired id shows it, picked, beside the offered ones", () => {
    expect(leashOptions("pen")).toEqual([["leashed", "Leashed"], ["unleashed", "Unleashed"], ["box", "In box"], ["pen", "In pen"]]);
    expect(spotOptions("crate").map(([id]) => id)).toEqual(["box", "loose", "crate"]);
    expect(spotOptions("pen").map(([id]) => id)).toEqual(["box", "loose", "pen"]);
    expect(leashOptions("box")).toHaveLength(3);
  });

  it("the feed labels the new and the retired", () => {
    const d = (details: Record<string, unknown>) => describeEvent({ kind: "potty", details }).detail;
    expect(d({ what: "pee", where: "outside", leash: "box" })).toBe("outside · in box");
    expect(d({ what: "pee", where: "outside", leash: "pen" })).toBe("outside · in pen");
    expect(d({ what: "pee", where: "inside", spot: "box" })).toBe("accident, inside · box");
    expect(d({ what: "pee", where: "inside", spot: "crate" })).toBe("accident, inside · crate");
  });
});

describe("migration lando_box_leash_spot", () => {
  const dir = resolve(__dirname, "../../../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const file = files.find((f) => f.endsWith("_lando_box_leash_spot.sql"))!;
  const prevFile = files.find((f) => f.endsWith("_lando_potty_minutes.sql"))!;
  const read = (f: string) => readFileSync(resolve(dir, f), "utf8");
  const fnOf = (sql: string) => sql.slice(sql.indexOf("create or replace function lando.details_ok(kind"), sql.indexOf("$fn$;"));
  const block = (fn: string, from: string, to: string) => fn.slice(fn.indexOf(from), fn.indexOf(to));

  it("is the newest migration defining lando.details_ok, so it is the newest body", () => {
    expect(file).toBeDefined();
    const defining = files.filter((f) => read(f).includes("create or replace function lando.details_ok(kind"));
    expect(defining.at(-1)).toBe(file);
  });
  it("widens leash and spot with box and keeps every old value", () => {
    const potty = block(fnOf(read(file)), "WHEN 'potty' THEN", "WHEN 'food' THEN");
    expect(potty).toContain("details ->> 'leash' IN ('leashed', 'unleashed', 'pen', 'box')");
    expect(potty).toContain("details ->> 'spot' IN ('box', 'crate', 'pen', 'loose')");
  });
  it("is lock_timeout, search_path '' and the function only: no DROP, no ALTER", () => {
    const code = read(file).replace(/--.*$/gm, "");
    expect(code.trim().startsWith("set local lock_timeout = '5s';")).toBe(true);
    expect(code).toContain("set search_path = ''");
    const statements = code.replace(/\$fn\$[\s\S]*?\$fn\$/, "$fn$").split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(code).not.toMatch(/\b(drop|alter|truncate|delete|update|insert)\b/i);
  });
  it("differs from lando_potty_minutes in those two lists and nothing else", () => {
    const strip = (sql: string) =>
      fnOf(sql)
        .replace("IN ('leashed', 'unleashed', 'pen', 'box')", "IN ('leashed', 'unleashed', 'pen')")
        .replace("IN ('box', 'crate', 'pen', 'loose')", "IN ('crate', 'pen', 'loose')")
        .replace(/ *--.*$/gm, "");
    expect(strip(read(file))).toBe(strip(read(prevFile)));
  });
});
