/**
 * One plain sentence per drift check, so a drifting row says what it means
 * rather than only what was measured.
 *
 * **The drift check's own sentence wins.** `explain` on a check is the
 * technical director's to supply from `scripts/drift-check.mjs`, and once it
 * does, this table is only the fallback. Until then the sentence is chosen by
 * the check's family — the start of its name — and a check this table does
 * not recognise gets no sentence rather than a wrong one.
 */
import type { DriftCheck } from "./platform";

const FAMILIES: [RegExp, string][] = [
  [
    /^identical: /,
    "Every app carries its own copy of this file, and all of them must be byte-for-byte the same. One that differs breaks something across apps without raising an error.",
  ],
  [
    /^stamped copies match/,
    "Each app's shared files are copied from packages/shared. A copy that differs was edited by hand — fix the original and re-run the stamp script.",
  ],
  [
    /^middleware\.ts/,
    "The password gate comes in three deliberate versions. Anything else means an app's gate has changed shape.",
  ],
  [/^password gate/, "Every app must sit behind the password gate. An app without one is public."],
  [
    /^(CI derives|one stable gate|each app's build|each ignoreCommand|every build watches)/,
    "How CI and Vercel decide what to build. Out of line, an app can skip a build it needed or ship untested.",
  ],
  [
    /^budget: /,
    "This file has a line limit so it stays readable in one sitting. Drift warns within ten lines of the limit and fails past it — compact it before adding to it.",
  ],
  [
    /^fresh: /,
    "An agent's handoff must be rewritten after its area changes. A stale one means the next session starts from an out-of-date picture.",
  ],
  [/^every app has an owning agent/, "Every app folder needs an agent that owns it, or nobody is looking after it."],
  [/^migration versions/, "Wherever a migration is cited by its version, that migration must exist."],
  [/stays retired/, "Retired on purpose. Bringing it back would split the same information across two places again."],
  [
    /computable facts/,
    "A number that can be measured is measured, not typed into a document — a typed number goes stale and nothing says so.",
  ],
];

export function explainDrift(check: DriftCheck): string | null {
  if (check.explain) return check.explain;
  return FAMILIES.find(([pattern]) => pattern.test(check.name))?.[1] ?? null;
}

/**
 * How far a budget has drifted, read from its `used / cap` detail. Null for
 * any other check, and for a detail in a shape this does not recognise — the
 * row then shows the detail as it came.
 */
export function budgetDistance(check: DriftCheck): string | null {
  if (!check.name.startsWith("budget: ")) return null;
  const m = check.detail.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const used = Number(m[1]);
  const cap = Number(m[2]);
  const spare = cap - used;
  if (spare < 0) return `${used} of ${cap} lines — ${-spare} over`;
  return `${used} of ${cap} lines — ${spare} to spare`;
}
