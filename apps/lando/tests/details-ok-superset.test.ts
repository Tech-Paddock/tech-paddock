// TEC-164: lando.details_ok only ever widens. The newest migration defining it must keep every key and
// every list value of the one before it, so a widening copied from an older body fails CI here.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dir = resolve(__dirname, "../../../supabase/migrations");
const DEFINES = "create or replace function lando.details_ok(kind";

/** Every migration defining the function, oldest first, as [name, sql]. */
const definers = (): [string, string][] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => [f, readFileSync(resolve(dir, f), "utf8")] as [string, string])
    .filter(([, sql]) => sql.includes(DEFINES));

const fnBody = (sql: string) => {
  const start = sql.indexOf(DEFINES);
  return sql.slice(start, sql.indexOf("$fn$;", start)).replace(/--.*$/gm, "");
};

const quoted = (s: string) => [...s.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]);

/**
 * Every key and list value, as "kind | what the list is | value". A list is an `ARRAY[...]` of keys, an
 * `IN (...)` or a `<@ '[...]'` of values; its label is its line with the list emptied, so a longer list on
 * the same line is the same list grown.
 */
function listValues(sql: string): Set<string> {
  const out = new Set<string>();
  let kind = "";
  for (const raw of fnBody(sql).split("\n")) {
    const line = raw.trim().replace(/\s+/g, " ");
    kind = line.match(/^WHEN '(potty|food|exercise|weight|health|void)' THEN/)?.[1] ?? kind;
    const add = (label: string, values: string[]) => values.forEach((v) => out.add(`${kind} | ${label} | ${v}`));
    for (const m of line.matchAll(/ARRAY\[([^\]]*)\]/g)) add(line.replace(m[0], "ARRAY[]"), quoted(m[1]));
    for (const m of line.matchAll(/\bIN \(([^)]*)\)/g)) add(line.replace(m[0], "IN ()"), quoted(m[1]));
    for (const m of line.matchAll(/<@ '(\[[^']*\])'::jsonb/g)) add(line.replace(m[1], "[]"), JSON.parse(m[1]) as string[]);
  }
  return out;
}

/** What `older` lists that `newer` does not. */
const dropped = (older: string, newer: string) => {
  const now = listValues(newer);
  return [...listValues(older)].filter((v) => !now.has(v));
};

describe("lando.details_ok only widens", () => {
  const all = definers();

  it("reads the lists it compares (a parser that finds nothing would pass anything)", () => {
    expect(all.length).toBeGreaterThan(2);
    const newest = listValues(all.at(-1)![1]);
    expect(newest.has("potty | AND details - ARRAY[] = '{}'::jsonb | spot")).toBe(true);
    expect([...newest].some((v) => v.endsWith("| stomach-appetite"))).toBe(true);
    expect([...newest].some((v) => v.endsWith("| potty-bell"))).toBe(true);
    expect(newest.size).toBeGreaterThan(80);
  });

  it("the newest keeps every key and list value of the one before it", () => {
    const [prev, newest] = all.slice(-2);
    expect(dropped(prev[1], newest[1]), `${newest[0]} dropped these from ${prev[0]}`).toEqual([]);
  });

  it("holds at every step from lando_health_picklist on", () => {
    // The two earlier bodies were written before the lists were history's key.
    const from = all.findIndex(([f]) => f.endsWith("_lando_health_picklist.sql"));
    expect(from).toBeGreaterThan(-1);
    for (let i = from + 1; i < all.length; i++) {
      expect(dropped(all[i - 1][1], all[i][1]), `${all[i][0]} dropped these from ${all[i - 1][0]}`).toEqual([]);
    }
  });

  it("fails a narrowed copy: a body taken from an older file, or one with a value removed", () => {
    const newest = all.at(-1)![1];
    const vetWeight = all.find(([f]) => f.endsWith("_lando_vet_weight.sql"))![1];
    // The case the issue names: a widening copied from lando_vet_weight has no potty spot.
    expect(dropped(newest, vetWeight)).toContain("potty | AND details - ARRAY[] = '{}'::jsonb | spot");
    // One list value gone from the newest body.
    const narrowed = newest.replace("'crate', 'pen', 'loose')", "'crate', 'pen')");
    expect(narrowed).not.toBe(newest);
    expect(dropped(newest, narrowed).some((v) => v.endsWith("| loose"))).toBe(true);
    // One command gone from the training list.
    const noCommand = newest.replace('"potty-bell", ', "");
    expect(noCommand).not.toBe(newest);
    expect(dropped(newest, noCommand).some((v) => v.endsWith("| potty-bell"))).toBe(true);
  });
});
