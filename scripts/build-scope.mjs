/**
 * What each app's build watches, and what it actually reads.
 *
 * ONE reader of `apps/<app>/vercel.json`, shared by CI and by `drift`, so the
 * two cannot disagree about what an app's scope is. CI used to keep its own
 * hardcoded path list, and that list had already drifted from Vercel's: it
 * never watched `packages/`, which every `ignoreCommand` did (TEC-10).
 *
 *   node scripts/build-scope.mjs <app>
 *
 * prints the paths that app's `ignoreCommand` diffs, space-separated, or
 * `ALWAYS` when it diffs nothing — no vercel.json, no ignoreCommand, or a
 * command with no `git diff` in it (the hub, which builds every production
 * merge). It exits 2 when the command has a diff this cannot parse. CI treats
 * a non-zero exit as "build it": a scope nobody can read fails open, never
 * shut, because a skipped build is the silent failure and an extra one is not.
 *
 * `buildReads` is the other half, for `drift`: which paths outside
 * `apps/<app>` that app's build touches, so a read its `ignoreCommand` does
 * not watch fails before the app silently stops rebuilding — the #145 class.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── What an app's ignoreCommand watches ──────────────────────────────────
   Returns { kind: "always" } | { kind: "paths", paths } | { kind: "unparseable", why }. */
export function watchedBy(app, root = repoRoot) {
  const file = join(root, "apps", app, "vercel.json");
  if (!existsSync(file)) return { kind: "always", why: "no vercel.json" };
  let cfg;
  try { cfg = JSON.parse(readFileSync(file, "utf8")); }
  catch { return { kind: "unparseable", why: "vercel.json is not valid JSON" }; }
  const cmd = cfg.ignoreCommand;
  if (typeof cmd !== "string") return { kind: "always", why: "no ignoreCommand" };
  if (!/\bgit\s+diff\b/.test(cmd)) return { kind: "always", why: "ignoreCommand diffs nothing" };
  const diffs = [...cmd.matchAll(/git diff --quiet HEAD\^ HEAD -- ([^|;&]+?)\s*\|\|/g)];
  if (diffs.length !== 1 || (cmd.match(/\bgit\s+diff\b/g) || []).length !== 1) {
    return { kind: "unparseable", why: "expected exactly one `git diff --quiet HEAD^ HEAD -- <paths> ||`" };
  }
  const paths = diffs[0][1].trim().split(/\s+/).map((p) => p.replace(/^["']|["']$/g, "").replace(/\/+$/, ""));
  if (!paths.length || paths.some((p) => !p || /[$`*?]/.test(p))) {
    return { kind: "unparseable", why: `pathspec is not a plain list of paths: ${diffs[0][1].trim()}` };
  }
  return { kind: "paths", paths };
}

/* Does a watched pathspec cover a repo-relative path? "" is the repo root. */
export const covers = (watched, path) =>
  watched.kind === "always" ||
  (watched.kind === "paths" && path !== "" && watched.paths.some((p) => path === p || path.startsWith(p + "/")));

/* ── What an app's build reads outside its own folder ─────────────────────
   Static and deliberately conservative. The build's entry points are
   next.config.* and every `node <file>` in the prebuild/build/postbuild
   scripts. Each JS file reached is scanned for path construction —
   join()/resolve() and one-line helpers wrapping them, such as
   `const R = (...p) => join(repoRoot, ...p)` — evaluated argument by argument
   and CUT at the first argument that is not a string literal, so
   `join(appsDir, e.name, ".env.example")` reads as all of `apps`. A path that
   lands on a .js/.mjs file is followed, as are relative imports, which is how
   the hub's prebuild reaches drift-check.mjs and stamp-shared.mjs. Source
   files are scanned for relative imports and tsconfig `paths` escaping the
   folder.

   It cannot see: a path assembled any other way (template strings,
   concatenation, a variable passed through a function), paths handed to git
   (history is not a file), network reads, and anything Next.js itself pulls
   from outside the folder by configuration this does not parse. */
export function buildReads(app, root = repoRoot) {
  const appDir = join(root, "apps", app);
  const reads = new Set();
  const seen = new Set();
  const entries = [];

  for (const f of ["next.config.mjs", "next.config.js", "next.config.ts"]) {
    if (existsSync(join(appDir, f))) entries.push(join(appDir, f));
  }
  try {
    const scripts = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")).scripts || {};
    for (const s of ["prebuild", "build", "postbuild"]) {
      for (const m of (scripts[s] || "").matchAll(/\bnode\s+([^\s&|;]+)/g)) entries.push(resolve(appDir, m[1]));
    }
  } catch { /* no package.json: nothing to follow */ }

  const record = (abs) => {
    const rel = relative(root, abs).split(sep).join("/");
    if (rel.startsWith("..")) return;
    if (rel === `apps/${app}` || rel.startsWith(`apps/${app}/`)) return;
    reads.add(rel);
  };

  const scan = (file) => {
    if (seen.has(file) || !existsSync(file) || !/\.(m?js|cjs)$/.test(file)) return;
    seen.add(file);
    record(file);
    const src = readFileSync(file, "utf8");
    const vars = new Map();
    const here = dirname(file);
    const helpers = new Map(); // name -> base variable

    const evalArg = (a) => {
      a = a.trim();
      const lit = a.match(/^(["'])([^"'`$]*)\1$/);
      if (lit) return { lit: lit[2] };
      if (/^dirname\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)$/.test(a)) return { abs: here };
      if (/^import\.meta\.dirname$/.test(a)) return { abs: here };
      if (vars.has(a)) return { abs: vars.get(a) };
      return null;
    };
    const evalCall = (args, base) => {
      const parts = splitArgs(args);
      let acc = base;
      let i = 0;
      if (acc === undefined) {
        const first = parts.length ? evalArg(parts[0]) : null;
        if (!first || first.abs === undefined) return null;
        acc = first.abs; i = 1;
      }
      for (; i < parts.length; i++) {
        const v = evalArg(parts[i]);
        if (!v || v.lit === undefined) break;
        acc = join(acc, v.lit);
      }
      return acc;
    };

    // Assignments first, in source order, so later lines can use earlier names.
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g)) {
      const [, name, rhs] = m;
      const helper = rhs.match(/^\(\s*\.\.\.(\w+)\s*\)\s*=>\s*(?:join|resolve)\(\s*([A-Za-z_$][\w$]*)\s*,\s*\.\.\.\1\s*\)/);
      if (helper && vars.has(helper[2])) { helpers.set(name, vars.get(helper[2])); continue; }
      const direct = evalArg(rhs.trim());
      if (direct?.abs) { vars.set(name, direct.abs); continue; }
      const call = rhs.match(/^(?:join|resolve)\((.*)\)\s*$/);
      if (call) { const p = evalCall(call[1]); if (p) vars.set(name, p); }
    }

    // Every call site, nested ones included: `readFileSync(join(...))` must
    // still see the join, so the argument list is cut by balance, not regex.
    for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\(/g)) {
      const fn = m[1];
      if (fn !== "join" && fn !== "resolve" && !helpers.has(fn)) continue;
      const args = balanced(src, m.index + m[0].length);
      if (args === null) continue;
      let p = null;
      if (fn === "join" || fn === "resolve") p = evalCall(args);
      else if (helpers.has(fn)) p = evalCall(args, helpers.get(fn));
      if (p) { record(p); scan(p); }
    }
    for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
      const p = resolve(here, m[1]); record(p); scan(p);
    }
  };
  for (const e of entries) scan(e);

  // The app's own source: relative imports that climb out of the folder.
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(m?[jt]sx?|css)$/.test(e)) {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|@import\s+|require\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
          record(resolve(dirname(p), m[1]));
        }
      }
    }
  };
  if (existsSync(appDir)) walk(appDir);

  try {
    const ts = JSON.parse(readFileSync(join(appDir, "tsconfig.json"), "utf8"));
    const base = resolve(appDir, ts.compilerOptions?.baseUrl || ".");
    for (const targets of Object.values(ts.compilerOptions?.paths || {})) {
      for (const t of targets) record(resolve(base, t.replace(/\/?\*$/, "")));
    }
  } catch { /* tsconfig with comments or none: the import scan above still ran */ }

  return [...reads].sort();
}

/* The text between an opening paren (already consumed) and its match. */
function balanced(src, start) {
  let depth = 1, q = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === "\\") i++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") q = ch;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return src.slice(start, i);
  }
  return null;
}

/* Split a call's argument list on top-level commas. */
function splitArgs(s) {
  const out = []; let depth = 0, cur = "", q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = process.argv[2];
  if (!app) { console.error("usage: node scripts/build-scope.mjs <app>"); process.exit(64); }
  const w = watchedBy(app);
  if (w.kind === "unparseable") { console.error(`apps/${app}: ${w.why}`); process.exit(2); }
  console.log(w.kind === "always" ? "ALWAYS" : w.paths.join(" "));
}
