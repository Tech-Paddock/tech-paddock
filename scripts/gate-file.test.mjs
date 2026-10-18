/**
 * The cases drift's gate-file checks (2, 2b, 2c) are held to. CI runs this in
 * the drift job, beside the hook tests:
 *
 *   node --test scripts/gate-file.test.mjs
 *
 * Each fixture is a throwaway app folder with just enough of an app to be
 * measured: a package.json, a lockfile and its gate files. The gate sources are
 * the repo's real ones, so a rename test is the codemod's actual rename and not
 * a toy.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GATE_FILES, gateFileFindings, gateHash, gateShape, majorOfRange, nextMajor, normaliseGate,
} from "./gate-file.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Each fixture source is in its middleware.ts form. An app already on Next 16
// has only proxy.ts, so the codemod's one change is undone to get it back.
const real = (app) => {
  const dir = join(ROOT, "apps", app);
  if (existsSync(join(dir, "middleware.ts"))) return readFileSync(join(dir, "middleware.ts"), "utf8");
  return readFileSync(join(dir, "proxy.ts"), "utf8")
    .replace(/export async function proxy\(/, "export async function middleware(");
};
const BASE = real("home");
const EDITOR = real("editor");
const TRACKER = real("tracker");
// Exactly what `npx @next/codemod middleware-to-proxy` did on the spike branch.
const asProxy = (src) => src.replace(/export async function middleware\(/, "export async function proxy(");

const ROOTDIR = mkdtempSync(join(tmpdir(), "gate-file-"));
let n = 0;
/** An app folder: `next` as declared, locked and installed, plus `files`. */
function app({ declared = "^14.2.15", locked = "14.2.35", installed = null, files = {} } = {}) {
  const dir = join(ROOTDIR, `app${n++}`);
  mkdirSync(dir, { recursive: true });
  if (declared !== undefined)
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: declared === null ? {} : { next: declared } }));
  if (locked) writeFileSync(join(dir, "package-lock.json"), JSON.stringify({ packages: { "node_modules/next": { version: locked } } }));
  if (installed) {
    mkdirSync(join(dir, "node_modules", "next"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "next", "package.json"), JSON.stringify({ version: installed }));
  }
  for (const [rel, src] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), src);
  }
  return dir;
}
const NEXT16 = { declared: "^16.4.2", locked: "16.4.2" };
const bad = (dir) => gateFileFindings(dir).bad;

test("a 14 app with middleware.ts passes", () => {
  assert.deepEqual(bad(app({ files: { "middleware.ts": BASE } })), []);
});

test("a 14 app with only proxy.ts fails — 14 ignores it and serves everything", () => {
  const b = bad(app({ files: { "proxy.ts": asProxy(BASE) } }));
  assert.ok(b.some((s) => /^no middleware\.ts/.test(s)), b.join("\n"));
  assert.ok(b.some((s) => /^proxy\.ts — Next 14 ignores proxy\.ts/.test(s)), b.join("\n"));
});

test("a 16 app with proxy.ts passes", () => {
  assert.deepEqual(bad(app({ ...NEXT16, files: { "proxy.ts": asProxy(BASE) } })), []);
});

test("a 16 app with only middleware.ts fails", () => {
  const b = bad(app({ ...NEXT16, files: { "middleware.ts": BASE } }));
  assert.ok(b.some((s) => /^no proxy\.ts/.test(s)), b.join("\n"));
  assert.ok(b.some((s) => /^middleware\.ts — on Next 16 the gate is proxy\.ts/.test(s)), b.join("\n"));
});

test("both gate files fail, on either major", () => {
  const files = { "middleware.ts": BASE, "proxy.ts": asProxy(BASE) };
  assert.deepEqual(bad(app({ files })).length, 1);
  assert.match(bad(app({ files }))[0], /^proxy\.ts/);
  assert.deepEqual(bad(app({ ...NEXT16, files })).length, 1);
  assert.match(bad(app({ ...NEXT16, files }))[0], /^middleware\.ts/);
});

test("no gate file at all fails", () => {
  assert.match(bad(app())[0], /^no middleware\.ts — Next 14 runs only middleware\.\*, so every route it serves is public/);
  assert.match(bad(app(NEXT16))[0], /^no proxy\.ts/);
});

test("the .js/.mjs/… alternates fail under either name and either major", () => {
  for (const f of GATE_FILES.filter((f) => !f.endsWith(".ts"))) {
    for (const v of [{}, NEXT16]) {
      const want = v === NEXT16 ? "proxy.ts" : "middleware.ts";
      const b = bad(app({ ...v, files: { [want]: BASE, [f]: BASE } }));
      assert.equal(b.length, 1, `${f} beside ${want}: ${b.join("; ")}`);
      assert.ok(b[0].startsWith(`${f} — `), b[0]);
    }
  }
  assert.ok(GATE_FILES.includes("proxy.ts") && GATE_FILES.includes("proxy.js") && GATE_FILES.includes("middleware.tsx"));
});

test("src/ variants fail under either name", () => {
  for (const f of ["src/middleware.ts", "src/proxy.ts", "src/proxy.js"]) {
    const b = bad(app({ files: { "middleware.ts": BASE, [f]: BASE } }));
    assert.deepEqual(b, [`${f} — a second password gate nobody reviewed`]);
  }
  const b = bad(app({ ...NEXT16, files: { "proxy.ts": BASE, "src/app/page.tsx": "" } }));
  assert.deepEqual(b, ["src/app/ — with the app under src/, Next.js ignores the root proxy.ts"]);
});

test("the major comes from every source, and they must agree", () => {
  assert.deepEqual(nextMajor(app({ installed: "14.2.35" })).major, 14);
  // A half-done upgrade: package.json says 16, the lockfile still installs 14.
  assert.match(nextMajor(app({ declared: "^16.4.2", locked: "14.2.35" })).error, /sources disagree/);
  // Stale node_modules: the local build is not the build CI and Vercel run.
  assert.match(nextMajor(app({ ...NEXT16, installed: "14.2.35" })).error, /sources disagree/);
  // No lockfile: package.json alone decides.
  assert.equal(nextMajor(app({ declared: "16.4.2", locked: null })).major, 16);
  // A disagreement fails 2b even when the file present matches one of them.
  assert.match(bad(app({ declared: "^16.4.2", locked: "14.2.35", files: { "proxy.ts": BASE } }))[0], /sources disagree/);
});

test("a range that pins no major, or no next at all, fails rather than guessing", () => {
  for (const r of ["latest", ">=14", "14 || 16", "*", "canary"]) {
    assert.equal(majorOfRange(r), null, r);
    assert.match(bad(app({ declared: r, locked: null, files: { "middleware.ts": BASE } }))[0], /pins no major/);
  }
  for (const [r, m] of [["14.2.35", 14], ["^14.2.15", 14], ["~16.4.2", 16], ["16.x", 16], ["16", 16], ["16.0.0-canary.3", 16], ["=15.5.4", 15]])
    assert.equal(majorOfRange(r), m, r);
  assert.match(bad(app({ declared: null, files: { "middleware.ts": BASE } }))[0], /declares no `next`/);
});

test("Next 15 still runs middleware.ts", () => {
  assert.deepEqual(bad(app({ declared: "^15.5.4", locked: "15.5.4", files: { "middleware.ts": BASE } })), []);
  assert.match(bad(app({ declared: "^15.5.4", locked: "15.5.4", files: { "proxy.ts": BASE } })).join(";"), /Next 15 ignores proxy\.ts/);
});

test("the function rename is the only thing normalised", () => {
  assert.equal(normaliseGate(BASE), normaliseGate(asProxy(BASE)));
  assert.notEqual(normaliseGate(BASE), BASE);
  assert.notEqual(normaliseGate(BASE), normaliseGate(BASE.replace("/api/login", "/api/logn")));
  assert.equal(normaliseGate("export function proxy (r) {}"), "export function gate (r) {}");
});

/** check 2 over a roster: `[name, appDir]` pairs. */
const shape = (roster) => gateShape(roster.map(([a, dir]) => [a, gateHash(dir)]));
const STANDARD = () => [
  ["coffee", app({ files: { "middleware.ts": BASE } })],
  ["editor", app({ files: { "middleware.ts": EDITOR } })],
  ["tracker", app({ files: { "middleware.ts": TRACKER } })],
];

test("today's shape passes: a base copy plus editor's and tracker's", () => {
  const r = shape([...STANDARD(), ["home", app({ files: { "middleware.ts": BASE } })]]);
  assert.equal(r.state, "ok", r.detail);
  assert.match(r.detail, /2 on the base copy/);
});

test("a migrated app stays in the base group, and a migrated editor keeps its own variant", () => {
  const r = shape([
    ...STANDARD().filter(([a]) => a !== "editor"),
    ["resume", app({ ...NEXT16, files: { "proxy.ts": asProxy(BASE) } })],
    ["editor", app({ ...NEXT16, files: { "proxy.ts": asProxy(EDITOR) } })],
  ]);
  assert.equal(r.state, "ok", r.detail);
  assert.match(r.detail, /coffee\+resume \| editor \| tracker/);
});

test("an app whose gate file cannot be read fails instead of dropping out", () => {
  // The spike's false pass: resume moved to proxy.ts and check 2 went on
  // reading `ok` with resume simply not in the comparison.
  for (const dir of [
    app({ ...NEXT16 }),                                   // no gate at all
    app({ ...NEXT16, files: { "middleware.ts": BASE } }), // the file 16 does not run
    app({ files: { "proxy.ts": asProxy(BASE) } }),        // the file 14 does not run
    app({ declared: "latest", locked: null, files: { "middleware.ts": BASE } }),
  ]) {
    const r = shape([...STANDARD(), ["resume", dir]]);
    assert.equal(r.state, "fail", r.detail);
    assert.match(r.detail, /^no readable gate file.*resume:/);
  }
});

test("a fourth variant, a shared bypass, and no base copy each fail", () => {
  const fourth = shape([...STANDARD(), ["health", app({ files: { "middleware.ts": BASE + "\n// changed\n" } })]]);
  assert.equal(fourth.state, "fail");
  assert.match(fourth.detail, /a fourth version/);

  const shared = shape([...STANDARD(), ["coffee2", app({ files: { "middleware.ts": EDITOR } })]]);
  assert.equal(shared.state, "fail");
  assert.match(shared.detail, /must each have a variant of their own/);

  const none = shape(STANDARD().filter(([a]) => a !== "coffee"));
  assert.equal(none.state, "fail");
  assert.match(none.detail, /nothing is running the base copy/);
});
