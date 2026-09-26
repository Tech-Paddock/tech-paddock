import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/**
 * TEC-26. The Message Editor is the only writer of `shared.contacts`
 * (supabase/README.md). This app once exported a `shared` client whose comment
 * promised contact deduplication, and nothing called it — a guarantee nobody
 * provided, waiting for the next session to build on it. It is gone, and this
 * keeps it gone: reaching `shared` from here is a contract change, not an edit.
 */
describe("the Resume Formatter holds no client for the shared schema", () => {
  it("names the shared schema nowhere in app or lib code", () => {
    const offenders = [...sources(join(root, "app")), ...sources(join(root, "lib"))].filter((file) =>
      /schema:\s*["']shared["']|clientFor\(\s*["']shared["']\)|\.schema\(\s*["']shared["']\)|getSharedClient/.test(
        readFileSync(file, "utf8").replace(/\/\/.*$/gm, "")
      )
    );
    expect(offenders).toEqual([]);
  });
});
