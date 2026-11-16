import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RULES.md's Never list, read off the files rather than trusted. Comments are
 * stripped first so a comment explaining a rule does not trip it.
 */
const APP = resolve(__dirname, "..");
const REPO = resolve(APP, "../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const source = ["app", "lib"]
  .flatMap((d) => walk(join(APP, d)))
  .filter((p) => /\.(ts|tsx)$/.test(p))
  .map((p) => ({ p: p.slice(APP.length + 1), text: readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1") }));

const migrations = readdirSync(join(REPO, "supabase/migrations"))
  .filter((n) => /grid/.test(n))
  .sort();
const sql = (n: string) => readFileSync(join(REPO, "supabase/migrations", n), "utf8");

describe("Never 1: rewrite a journal entry", () => {
  it("nothing in the app updates or deletes journal versions", () => {
    for (const { p, text } of source) {
      expect(text, p).not.toMatch(/journal_versions"\)\s*\.(update|delete)\(/);
    }
    const db = source.find((s) => s.p === "lib/db.ts")!.text;
    const fn = db.slice(db.indexOf("export async function writeJournal"), db.indexOf("export async function writeMeditation"));
    expect(fn).toContain("journal_versions");
    expect(fn).not.toMatch(/\.(update|delete)\(/);
  });

  it("the journal route exports POST alone", () => {
    const route = source.find((s) => s.p === "app/api/journal/route.ts")!.text;
    expect(route).toMatch(/export function POST/);
    expect(route).not.toMatch(/export (async )?function (PUT|PATCH|DELETE)/);
  });

  it("the table refuses an update or a delete itself", () => {
    const first = sql(migrations[0]);
    expect(first).toMatch(/before update or delete on grid\.journal_versions/);
    expect(first).toMatch(/raise exception/);
  });
});

describe("Never 2: real text or names in the repo", () => {
  it("fixtures here are the invented ones: no tests read a person's text from a file", () => {
    for (const n of readdirSync(join(APP, "tests"))) {
      expect(n).not.toMatch(/\.(docx|csv|json)$/);
    }
  });
});

describe("Never 3: a model", () => {
  it("no code calls Anthropic or names a model, and there is no lib/models.ts", () => {
    for (const { p, text } of source) {
      expect(text, p).not.toMatch(/anthropic|claude-|sonnet|openai/i);
    }
    expect(source.some((s) => s.p === "lib/models.ts")).toBe(false);
    const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf8"));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join()).not.toMatch(/anthropic|openai/);
  });
});

describe("Never 4: another tool's schema", () => {
  it("no code reaches past the pinned client", () => {
    for (const { p, text } of source) {
      expect(text, p).not.toMatch(/\.schema\(/);
      expect(text, p).not.toMatch(/\b(public|resume|coffee|health|cookbook|lando)\.\w+/);
    }
    for (const n of migrations) {
      expect(sql(n), n).not.toMatch(/\bpublic\./);
    }
  });
});

describe("Never 5: a logged secret or a lost body", () => {
  it("nothing logs", () => {
    for (const { p, text } of source) expect(text, p).not.toMatch(/\bconsole\./);
  });
});

describe("the grid schema", () => {
  it("is two migrations, schema and tables first and grants second", () => {
    expect(migrations).toHaveLength(2);
    expect(migrations[0]).toMatch(/create_grid_schema/);
    expect(migrations[1]).toMatch(/grant_grid_schema_usage/);
    expect(migrations[0] < migrations[1]).toBe(true);
  });

  it("every table has RLS on in the file that creates it, and no migration adds a policy", () => {
    const first = sql(migrations[0]);
    const tables = [...first.matchAll(/create table grid\.(\w+)/g)].map((m) => m[1]);
    expect(tables.sort()).toEqual(["goals", "journal_versions", "list_items", "lists", "meditation_sessions", "routine_ticks", "routines", "tasks"]);
    for (const t of tables) expect(first, t).toMatch(new RegExp(`alter table grid\\.${t} enable row level security`));
    for (const n of migrations) expect(sql(n)).not.toMatch(/create policy/i);
  });

  it("the grants copy the cookbook's and the local stack exposes the schema", () => {
    const grants = sql(migrations[1]);
    expect(grants).toMatch(/GRANT USAGE ON SCHEMA grid TO anon, authenticated, service_role/);
    expect(grants).toMatch(/GRANT ALL ON ALL TABLES IN SCHEMA grid/);
    expect(grants).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA grid/);
    expect(readFileSync(join(REPO, "supabase/config.toml"), "utf8")).toMatch(/^schemas = \[.*"grid".*\]$/m);
  });

  it("the trigger function pins an empty search_path", () => {
    expect(sql(migrations[0])).toMatch(/journal_is_append_only[\s\S]*set search_path = ''/);
  });
});
