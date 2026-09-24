#!/usr/bin/env node
/**
 * The PreToolUse guard every agent session in this repo runs.
 *
 *   node .claude/hooks/guard.mjs < hook-input.json
 *
 * Claude Code hands over the tool call on stdin. decide.mjs works out whether
 * a rule applies; this prints the decision, if there is one, as the JSON
 * Claude Code reads:
 *
 *   deny   the call does not happen, and the reason goes back to the agent
 *   ask    the call waits for Joel's click
 *
 * and prints nothing when the call may go ahead.
 *
 * ## It fails closed
 *
 * Claude Code treats exit code 2 as a refusal and any other non-zero exit as a
 * warning it shows and then ignores. So a hook that crashes lets the call
 * through, which is how every hook here behaved whenever `jq` was missing.
 * This exits 2 on input it cannot read and on any error of its own. The
 * commands in settings.json refuse by themselves when `node` or this file is
 * missing, and turn any other failure of this process into exit 2 as well —
 * a module that fails to load exits 1, which would otherwise be a pass.
 *
 * There is deliberately no "am I the main module?" test here: under a
 * symlinked path that test can come out false, the guard then prints nothing,
 * and nothing is how a guard says yes.
 *
 * The cases it is held to are in guard.test.mjs, which CI runs.
 */

import { decide } from "./decide.mjs";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const d = decide(JSON.parse(raw));
    if (d) {
      const out = {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: d.decision,
          permissionDecisionReason: d.reason,
        },
      };
      process.stdout.write(`${JSON.stringify(out)}\n`);
    }
  } catch (e) {
    process.stderr.write(
      `The repo's PreToolUse guard failed (${e?.message ?? e}), so it refuses rather than let the call through unchecked. Tell the technical director; the guard is .claude/hooks/guard.mjs.\n`,
    );
    process.exitCode = 2;
  }
});
