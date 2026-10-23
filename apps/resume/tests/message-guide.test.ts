import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verdictFor, type VerdictInput } from "@/lib/verdict";
import type { ChangeAction } from "@/lib/reskin/types";
import {
  ACTION_GUIDE,
  CHANGE_LOG_GUIDE,
  PANEL_GUIDE,
  SEVERITY_GUIDE,
  VERDICT_GUIDE,
  guideEntry,
  type GuideEffect,
} from "@/lib/messageGuide";

/**
 * The guide in the Diagnostics rail (TEC-134) must not drift from the verdict.
 * These run the verdict itself on each category and hold the guide to what it
 * does, so a new category, or a note that starts failing, breaks a test here
 * rather than leaving the guide wrong.
 */

const clean: VerdictInput = { coverage: { missing: [] }, findings: [], changeLog: [] };

/** What the verdict did with an input, in the guide's terms. */
function effectOf(input: VerdictInput): { effect: GuideEffect; said: string[] } {
  const v = verdictFor(input);
  if (v.reasons.length > 0) return { effect: "fails", said: v.reasons };
  if (v.notes.length > 0) return { effect: "note", said: v.notes };
  return { effect: "none", said: [] };
}

/** Every change-log action, read from `storedRender.ts`'s own list so the test
 *  needs no copy of it. The Record in `messageGuide.ts` is the compile-time half. */
function knownActions(): ChangeAction[] {
  const src = readFileSync(join(__dirname, "..", "lib", "storedRender.ts"), "utf8");
  const block = src.match(/KNOWN_ACTIONS[^=]*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error("KNOWN_ACTIONS not found in lib/storedRender.ts");
  return [...block[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1] as ChangeAction);
}

const one = (action: string, section = "Professional Experience"): VerdictInput => ({
  ...clean,
  changeLog: [{ section, action }],
});

/** A minimal input for each verdict entry. */
const TRIGGERS: Record<string, VerdictInput> = {
  missing: { ...clean, coverage: { missing: ["SQL, dbt, Looker"] } },
  blocking: { ...clean, findings: [{ severity: "blocking", message: "A text box." }] },
  warning: { ...clean, findings: [{ severity: "warning", message: "An image." }] },
  "input-dropped": one("input-dropped", "Publications"),
  "section-partly": {
    ...clean,
    changeLog: [
      { section: "Career Highlights", action: "replaced" },
      { section: "Career Highlights", action: "not-found-in-input" },
    ],
  },
  "section-empty": one("not-found-in-input", "Summary"),
  "template-trimmed": one("template-trimmed"),
  "input-not-read": one("input-not-read", "Career Highlights"),
  feathered: one("feathered"),
};

describe("the message guide", () => {
  it("has a trigger for every verdict entry, and a verdict entry for every trigger", () => {
    expect(Object.keys(TRIGGERS).sort()).toEqual(VERDICT_GUIDE.map((g) => g.key).sort());
  });

  it.each(VERDICT_GUIDE.map((g) => [g.key, g] as const))("says what the verdict does for %s", (key, entry) => {
    const { effect, said } = effectOf(TRIGGERS[key]);
    expect(effect).toBe(entry.effect);
    // A finding's message is its own text; the guide quotes the label instead.
    if (key !== "blocking" && key !== "warning") {
      expect(said.some((s) => s.includes(entry.reads))).toBe(true);
    }
  });

  it("explains every change-log action the verdict can be given", () => {
    expect(Object.keys(ACTION_GUIDE).sort()).toEqual([...knownActions()].sort());
  });

  /** The test the brief asks for: a verdict that starts weighing an action (or
   *  stops) disagrees with the guide's entry for it. */
  it.each(knownActions())("matches the verdict on the action %s alone", (action) => {
    expect(guideEntry(ACTION_GUIDE[action]).effect).toBe(effectOf(one(action)).effect);
  });

  it("explains every finding severity", () => {
    for (const severity of ["blocking", "warning"] as const) {
      const entry = guideEntry(SEVERITY_GUIDE[severity]);
      const { effect } = effectOf({ ...clean, findings: [{ severity, message: "x" }] });
      expect(entry.effect).toBe(effect);
    }
  });

  /** Belt and braces against a category added to `verdict.ts` itself: every
   *  action or severity it compares against has an entry that votes or notes. */
  it("has a voting entry for every literal verdict.ts keys off", () => {
    const src = readFileSync(join(__dirname, "..", "lib", "verdict.ts"), "utf8");
    const actions = [...src.matchAll(/action === "([a-z-]+)"/g)].map((m) => m[1]);
    const wrote = src.match(/WROTE_SOURCE = new Set\(\[([^\]]*)\]/)?.[1] ?? "";
    const severities = [...src.matchAll(/severity === "([a-z-]+)"/g)].map((m) => m[1]);
    expect(actions.length).toBeGreaterThan(0);
    expect(severities.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(ACTION_GUIDE).toHaveProperty(a);
      expect(["fails", "note"]).toContain(guideEntry(ACTION_GUIDE[a as ChangeAction]).effect);
    }
    for (const a of [...wrote.matchAll(/"([a-z-]+)"/g)].map((m) => m[1])) expect(ACTION_GUIDE).toHaveProperty(a);
    for (const s of severities) expect(SEVERITY_GUIDE).toHaveProperty(s);
  });

  it("covers the panels a person reads on Diagnostics", () => {
    expect(PANEL_GUIDE.map((g) => g.key)).toEqual(["not-carried-across", "ats-check", "no-verdict"]);
  });

  it("explains template-trimmed's three Professional Experience causes", () => {
    const causes = guideEntry("template-trimmed").causes ?? [];
    expect(causes.filter((c) => c.startsWith("In Professional Experience"))).toHaveLength(3);
  });

  it("gives every entry a meaning and a check, with unique keys", () => {
    const all = [...VERDICT_GUIDE, ...PANEL_GUIDE, ...CHANGE_LOG_GUIDE];
    expect(new Set(all.map((g) => g.key)).size).toBe(all.length);
    for (const g of all) {
      expect(g.means.length).toBeGreaterThan(0);
      expect(g.check.length).toBeGreaterThan(0);
    }
  });
});
