#!/usr/bin/env node
/**
 * Stamp the shared files from packages/shared into every app.
 *
 *   node scripts/stamp-shared.mjs            write every copy
 *   node scripts/stamp-shared.mjs --check    verify, write nothing, exit 1 on drift
 *
 * ## Why copies at all, when the whole point is to stop copying
 *
 * Because there is no root package.json and there is deliberately not going to
 * be one. Each app is its own npm project, pointed at by its own Vercel project
 * through that project's Root Directory, and the CI matrix is derived from the
 * folders on disk. A workspace install at the root would give us one real
 * import — and take the per-app independence all three of those rest on.
 *
 * So the copies stay, and what changes is that they stop being one edit per
 * app. One canonical file, a script that writes it outward, and a drift check
 * that fails a copy which has stopped agreeing. The duplication becomes
 * mechanical rather than remembered, which is the part that was actually
 * costing us: lib/auth.ts drifting does not throw, it silently rejects valid
 * sessions on every other app.
 *
 * ## The banner is the load-bearing half
 *
 * A check that fails in CI teaches an agent not to edit a copy after they have
 * already edited it. The banner teaches them before. It names the canonical
 * path and the command, so the recovery is obvious at the moment of temptation
 * rather than twenty minutes later in a red pipeline.
 *
 * It is prepended at stamp time and is NOT in the canonical file, so `--check`
 * compares each copy against banner + canonical rather than canonical alone.
 *
 * ## What is deliberately NOT here
 *
 * `lib/supabase.ts` is a genuinely different file per app, and one app has none
 * — the hub holds no database credential and that is a property worth keeping.
 * `middleware.ts` is three deliberate variants, and drift already measures that
 * shape; collapsing it here would be a fourth version of the password gate
 * wearing a helpful-looking script. Neither belongs in this manifest, and an
 * agent adding one should read those two checks in scripts/drift-check.mjs
 * first.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => join(repoRoot, ...p);

/* The manifest maps a canonical file to where it lands inside each app. It is a
   map rather than a flat list because next.config.mjs sits at the app root
   while the rest sit under lib/, and a list would have quietly assumed lib/. */
export const MANIFEST = [
  { from: "lib/auth.ts", to: "lib/auth.ts" },
  { from: "lib/password.ts", to: "lib/password.ts" },
  { from: "lib/theme.css", to: "lib/theme.css" },
  { from: "lib/theme.ts", to: "lib/theme.ts" },
  { from: "next.config.mjs", to: "next.config.mjs" },
  { from: "app/ThemeControl.tsx", to: "app/ThemeControl.tsx" },
  // The login path. The handler behind every app's /api/login, and the rule for
  // where a successful login may send you. Both were hand-copied into every app
  // until 2026-09-24, so a fix to either was one edit per app.
  { from: "lib/login.ts", to: "lib/login.ts" },
  { from: "lib/safe-redirect.ts", to: "lib/safe-redirect.ts" },
  // The logout path (TEC-73, 2026-09-26): the handler behind every app's
  // /api/logout and the header control that calls it. Only the hub could log
  // out before; the cookie is domain-wide, so one handler serves every app.
  { from: "lib/logout.ts", to: "lib/logout.ts" },
  { from: "app/LogoutControl.tsx", to: "app/LogoutControl.tsx" },
];

export const SHARED_DIR = "packages/shared";

/* Derived from disk, never hardcoded — the same rule the CI matrix and the
   drift roster follow. A seventh app gets stamped by existing, which is the
   whole promise: adding a folder is enough. */
export const appsOnDisk = (root = repoRoot) => {
  const dir = join(root, "apps");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => statSync(join(dir, d)).isDirectory())
    .sort();
};

/* Every file in the manifest is .ts, .tsx, .css or .mjs, and all four take the
   same block-comment syntax. A file type that does not would need a case added
   here rather than silently stamping a syntax error into every app at once.

   .tsx brought one wrinkle the others did not: ThemeControl.tsx opens with a
   "use client" directive, and this banner lands above it. A block comment
   before a directive is legal and Next.js honours it — verified by building
   apps/home with the banner in place before the manifest entry was added. If
   it were ever NOT honoured the component would silently become a server
   component, so it is checked rather than assumed. It fails at build, loudly,
   because the component calls useState. */
export const banner = (from) =>
  `/* Stamped from ${SHARED_DIR}/${from} — do not edit this copy.\n` +
  ` * Edit the canonical file, then run: node scripts/stamp-shared.mjs\n` +
  ` * drift fails a copy that disagrees, and CI runs drift. */\n`;

export const stamped = (root, from) =>
  banner(from) + readFileSync(join(root, SHARED_DIR, from), "utf8");

/* One place that answers "what should apps/<app>/<to> contain", used by both
   modes here and by the drift check, so the check can never drift from the
   writer it is checking. */
export function expected(root = repoRoot) {
  const out = [];
  for (const app of appsOnDisk(root)) {
    for (const { from, to } of MANIFEST) {
      out.push({ app, from, to, rel: `apps/${app}/${to}`, want: stamped(root, from) });
    }
  }
  return out;
}

function main() {
  const check = process.argv.includes("--check");
  const apps = appsOnDisk();

  if (apps.length === 0) {
    console.error("no apps/ directory — nothing to stamp");
    process.exit(1);
  }
  for (const { from } of MANIFEST) {
    if (!existsSync(R(SHARED_DIR, from))) {
      console.error(`canonical file missing: ${SHARED_DIR}/${from}`);
      process.exit(1);
    }
  }

  const drifted = [];
  const written = [];

  for (const { rel, want } of expected()) {
    const abs = R(rel);
    const have = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    if (have === want) continue;

    if (check) {
      drifted.push(`${rel} — ${have === null ? "missing" : "differs from canonical"}`);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, want);
    written.push(rel);
  }

  const total = apps.length * MANIFEST.length;

  if (check) {
    if (drifted.length) {
      console.error(`stamp --check FAILED — ${drifted.length} of ${total} copies disagree:\n`);
      for (const d of drifted) console.error(`  ${d}`);
      console.error(`\nRun: node scripts/stamp-shared.mjs`);
      process.exit(1);
    }
    console.log(`stamp --check ok — ${total} copies across ${apps.length} apps match ${SHARED_DIR}`);
    return;
  }

  if (written.length === 0) {
    console.log(`nothing to do — ${total} copies across ${apps.length} apps already match`);
    return;
  }
  console.log(`stamped ${written.length} of ${total} copies across ${apps.length} apps:`);
  for (const w of written) console.log(`  ${w}`);
}

/* Run main() only when invoked as a script, not when drift-check imports this.
   Both sides are resolved through realpath: Node reports import.meta.url as the
   real path, while argv[1] is whatever path was typed. Through a symlinked
   checkout the two never matched, main() never ran, and `--check` exited 0
   having checked nothing, which is a silent pass on the one command that
   exists to fail. */
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) main();
