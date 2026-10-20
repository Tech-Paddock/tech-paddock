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
 * The owner retired the Pipeline Tracker on 2026-10-20. Its `tracker` schema and
 * `resume.renders.thread_id` are dropped in a later migration, so any code that
 * still reads or writes either breaks the day that migration lands. This keeps
 * them gone. Comments are stripped first, so history can still be explained.
 */
describe("the Resume Formatter no longer reaches the Pipeline Tracker", () => {
  const code = [...sources(join(root, "app")), ...sources(join(root, "lib"))].map((file) => ({
    file,
    text: readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, ""),
  }));

  it("holds no client for the tracker schema", () => {
    const offenders = code.filter(({ text }) =>
      /schema:\s*["']tracker["']|clientFor\(\s*["']tracker["']\)|\.schema\(\s*["']tracker["']\)|getTrackerClient/.test(text)
    );
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it("names neither pipeline_threads nor renders.thread_id", () => {
    const offenders = code.filter(({ text }) => /pipeline_threads|thread_id/.test(text));
    expect(offenders.map((o) => o.file)).toEqual([]);
  });
});
