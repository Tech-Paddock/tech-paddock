#!/usr/bin/env node
/**
 * The UserPromptSubmit hook behind `/execute-plan` (TEC-179).
 *
 *   node .claude/hooks/plan-gate.mjs < hook-input.json
 *
 * Claude Code runs it on every prompt the owner submits, and never on a tool
 * call, so what it records is the owner's own act. For a prompt that starts
 * `/execute-plan` it compares the prompt with the command `/summarize-plan`
 * last showed in this chat (`.claude/state/plan.json`):
 *
 *   match      writes `.claude/state/plan-approved.json`; the guard then lets
 *              the plan's builders and Deployment start without a click
 *   mismatch   blocks the prompt and returns the summarized command
 *   no plan    blocks the prompt and says `/summarize-plan` comes first
 *
 * Any other prompt passes untouched. It fails safe rather than closed: if it
 * crashes, the prompt goes through with no approval written, and every start
 * asks the owner as before. planGate in decide.mjs holds the logic;
 * guard.test.mjs holds the cases.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planGate, stateDir } from "./decide.mjs";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const r = planGate(input);
    if (r?.block) {
      process.stdout.write(`${JSON.stringify({ decision: "block", reason: r.block })}\n`);
    } else if (r?.approve) {
      const dir = stateDir(input);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "plan-approved.json"), `${JSON.stringify(r.approve, null, 2)}\n`);
    }
  } catch (e) {
    process.stderr.write(`The /execute-plan hook failed (${e?.message ?? e}); no plan approval was recorded, so each start will ask.\n`);
  }
});
