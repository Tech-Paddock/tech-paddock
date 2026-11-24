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
  .filter((n) => /pitrow/.test(n))
  .sort();
const sql = (n: string) => readFileSync(join(REPO, "supabase/migrations", n), "utf8");

describe("Never 1: rewrite or delete a completion", () => {
  it("nothing in the app updates or deletes completions", () => {
    for (const { p, text } of source) {
      expect(text, p).not.toMatch(/completions"\)\s*\.(update|delete)\(/);
    }
    const db = source.find((s) => s.p === "lib/db.ts")!.text;
    const fn = db.slice(db.indexOf("export async function writeCompletion"));
    expect(fn).toContain('from("completions")');
    expect(fn).not.toMatch(/\.(update|delete)\(/);
  });

  it("the completions route exports POST alone", () => {
    const route = source.find((s) => s.p === "app/api/completions/route.ts")!.text;
    expect(route).toMatch(/export function POST/);
    expect(route).not.toMatch(/export (async )?function (PUT|PATCH|DELETE)/);
  });

  it("the table refuses an update or a delete itself", () => {
    const first = sql(migrations[0]);
    expect(first).toMatch(/before update or delete on pitrow\.completions/);
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
  it("no code reaches past the pinned client, and Outlook is reached only through the stamped client", () => {
    for (const { p, text } of source) {
      expect(text, p).not.toMatch(/\.schema\(/);
      // The stamped client alone holds Grid's address.
      if (p === "lib/calendar-client.ts") continue;
      expect(text, p).not.toMatch(/\b(public|resume|coffee|health|cookbook|lando|grid|calendar)\.\w+/);
      expect(text, p).not.toMatch(/graph\.microsoft|api\/calendar/);
    }
    for (const n of migrations) {
      expect(sql(n), n).not.toMatch(/\bpublic\./);
    }
  });
});

describe("Never 5: a lost tap or a logged body", () => {
  it("nothing logs", () => {
    for (const { p, text } of source) expect(text, p).not.toMatch(/\bconsole\./);
  });

  it("every save goes through the outbox, whose failures stay on screen with a retry", () => {
    for (const f of ["app/DayCard.tsx", "app/Manage.tsx"]) {
      const text = source.find((s) => s.p === f)!.text;
      expect(text, f).not.toMatch(/\bfetch\(/);
      expect(text, f).toMatch(/\bsend\(/);
    }
    expect(source.find((s) => s.p === "app/outbox.tsx")!.text).toMatch(/Retry/);
  });
});

describe("the surface", () => {
  it("touch targets are at least 56px: nothing on the board is sized below min-h-14", () => {
    for (const f of ["app/DayCard.tsx", "app/Manage.tsx", "app/Week.tsx", "app/outbox.tsx"]) {
      const text = source.find((s) => s.p === f)!.text;
      expect(text, f).not.toMatch(/min-h-(?:[0-9]|1[0-3])\b|\bh-(?:[0-9]|1[0-3])\b/);
    }
  });

  it("the board refreshes every minute and on focus", () => {
    const week = source.find((s) => s.p === "app/Week.tsx")!.text;
    expect(week).toMatch(/REFRESH_MS = 60_000/);
    expect(week).toMatch(/addEventListener\("focus"/);
  });

  it("installs through /app.webmanifest, full screen", () => {
    expect(source.find((s) => s.p === "app/layout.tsx")!.text).toContain("/app.webmanifest");
    expect(source.find((s) => s.p === "app/app.webmanifest/route.ts")!.text).toContain('display: "fullscreen"');
  });
});

describe("the pitrow schema", () => {
  it("is two migrations, schema and tables first and grants second", () => {
    expect(migrations).toHaveLength(2);
    expect(migrations[0]).toMatch(/create_pitrow_schema/);
    expect(migrations[1]).toMatch(/grant_pitrow_schema_usage/);
    expect(migrations[0] < migrations[1]).toBe(true);
  });

  it("every table has RLS on in the file that creates it, and no migration adds a policy", () => {
    const first = sql(migrations[0]);
    const tables = [...first.matchAll(/create table pitrow\.(\w+)/g)].map((m) => m[1]);
    expect(tables.sort()).toEqual(["chores", "completions", "people"]);
    for (const t of tables) expect(first, t).toMatch(new RegExp(`alter table pitrow\\.${t} enable row level security`));
    for (const n of migrations) expect(sql(n)).not.toMatch(/create policy/i);
  });

  it("the grants copy the cookbook's and the local stack exposes the schema", () => {
    const grants = sql(migrations[1]);
    expect(grants).toMatch(/GRANT USAGE ON SCHEMA pitrow TO anon, authenticated, service_role/);
    expect(grants).toMatch(/GRANT ALL ON ALL TABLES IN SCHEMA pitrow/);
    expect(grants).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA pitrow/);
    expect(readFileSync(join(REPO, "supabase/config.toml"), "utf8")).toMatch(/^schemas = \[.*"pitrow".*\]$/m);
  });

  it("the trigger function pins an empty search_path", () => {
    expect(sql(migrations[0])).toMatch(/completions_are_append_only[\s\S]*set search_path = ''/);
  });
});
