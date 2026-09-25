import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // No test here measures time; none asserts that anything is fast. Vitest's
    // default 5s timeout therefore only ever turned machine load into a
    // failure — one run failed while six builds and five other suites shared
    // the machine, and passed on rerun (TEC-31). The docx round trips and the
    // route tests' fresh module imports are the slow ones. A generous ceiling
    // keeps a hung test from hanging CI without making pass or fail depend on
    // what else the machine is doing.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
