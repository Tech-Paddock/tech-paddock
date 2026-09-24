/**
 * The cases the PreToolUse guard is held to. CI runs this in the drift job:
 *
 *   node --test .claude/hooks/guard.test.mjs
 *
 * Every case that got through, or was wrongly refused, when the guard was a
 * grep is here by name, so it cannot quietly come back.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decide, lex, nextSteps, stripSql, targetsMain } from "./decide.mjs";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HOOKS, "..", "..");

const git = (dir, ...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A throwaway repository, on `branch`, configured as asked. */
function repo({ branch = "claude/feature", merge = null, pushDefault = "simple", remotePush = null, detached = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "guard-"));
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  git(dir, "-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "x");
  if (branch !== "main") git(dir, "switch", "-q", "-c", branch);
  git(dir, "remote", "add", "origin", "https://example.com/r.git");
  if (merge) {
    git(dir, "config", `branch.${branch}.remote`, "origin");
    git(dir, "config", `branch.${branch}.merge`, `refs/heads/${merge}`);
  }
  if (pushDefault) git(dir, "config", "push.default", pushDefault);
  if (remotePush) git(dir, "config", "remote.origin.push", remotePush);
  if (detached) git(dir, "switch", "-q", "--detach");
  return dir;
}

const FEATURE = repo({ merge: "claude/feature" });

const bash = (command, cwd = FEATURE) => decide({ tool_name: "Bash", tool_input: { command }, cwd });
const verdict = (d) => d?.decision ?? "allow";
const mcp = (tool, input) => verdict(decide({ tool_name: tool, tool_input: input }));

function expectAll(cases, run) {
  for (const [input, want] of cases) {
    const got = run(input);
    assert.equal(verdict(got), want, `${JSON.stringify(input)} → ${verdict(got)}${got ? `: ${got.reason}` : ""}`);
  }
}

test("pushes that land on main are refused, in every spelling", () => {
  expectAll(
    [
      ["git push origin main", "deny"],
      ["git push origin +main", "deny"], // got through the grep
      ["git push origin HEAD:main", "deny"],
      ["git push origin HEAD:refs/heads/main", "deny"], // got through the grep
      ["git push origin claude/feature:refs/heads/main", "deny"],
      ["git push origin refs/heads/main", "deny"],
      ["git push origin heads/main", "deny"],
      ["git push origin :main", "deny"],
      ["git push origin --delete main", "deny"],
      ["git push -d origin main", "deny"],
      ["git push --force origin main", "deny"],
      ["git push -uf origin main", "deny"],
      ["git push origin 'refs/heads/*:refs/heads/*'", "deny"],
      ["git push origin '*:*'", "deny"],
      ["git -C . push origin main", "deny"], // got through the grep
      ["git -c core.quotepath=off push origin main", "deny"],
      ["git --no-pager push origin main", "deny"],
      ["git push --all origin", "deny"], // got through the grep
      ["git push --mirror origin", "deny"], // got through the grep
      ["git push --branches", "deny"],
      ["cd /tmp && git push origin main", "deny"],
      ["false || git push origin main", "deny"],
      ["git status; git push origin main", "deny"],
      ["(git push origin main)", "deny"],
      ["echo $(git push origin main)", "deny"],
      ["echo `git push origin main`", "deny"],
      ["sh -c 'git push origin main'", "deny"],
      ["bash -lc \"git push origin main\"", "deny"],
      ["eval git push origin main", "deny"],
      ["FOO=1 git push origin main", "deny"],
      ["env GIT_TRACE=1 git push origin main", "deny"],
      ["timeout 60 git push origin main", "deny"],
      ["nohup git push origin main &", "deny"],
      ["/usr/bin/git push origin main", "deny"],
      ["git push origin main 2>&1 | tail -3", "deny"],
      ["git push origin claude/feature main", "deny"],
    ],
    (c) => bash(c),
  );
});

test("pushes of a branch that is not main go ahead", () => {
  expectAll(
    [
      ["git push -u origin claude/feature", "allow"],
      ["git push origin claude/main-fix", "allow"],
      ["git push origin main:claude/copy-of-main", "allow"],
      ["git push origin HEAD:claude/feature", "allow"],
      ["git push origin HEAD", "allow"],
      ["git push -u origin HEAD", "allow"],
      ["git push --force-with-lease origin claude/feature", "allow"],
      ["git push origin --delete claude/old", "allow"],
      ["git push origin v1.0.0", "allow"],
      ["git push --dry-run origin main", "allow"],
      ["git push -n origin main", "allow"],
      ["git push -o ci.skip origin claude/feature", "allow"],
      ["git push origin claude/feature 2>&1 | tail -3", "allow"],
      ["for i in 1 2 3; do git push -u origin claude/feature && break; sleep $((2 ** i)); done", "allow"],
    ],
    (c) => bash(c),
  );
});

test("commands that only mention main or a push are not pushes", () => {
  expectAll(
    [
      ["git fetch origin main && git push -u origin claude/feature", "allow"], // refused by the grep
      ["git diff main && git push origin claude/feature", "allow"], // refused by the grep
      ["git switch main && git pull && git switch claude/feature && git push origin claude/feature", "allow"],
      ["echo 'git push origin main'", "allow"],
      ['git commit -m "never git push origin main"', "allow"],
      ["git log --grep='push origin main'", "allow"],
      ["grep -rn 'git push' .claude/", "allow"],
      [`git commit -F - <<'EOF'\nThe hook refuses git push origin main\nand git push --all.\nEOF`, "allow"],
      [`git commit -m "$(cat <<'EOF'\nsubject (with a paren\n\ngit push origin main is refused)\nEOF\n)" && git push -u origin claude/feature`, "allow"],
      ["pushd apps && ls && popd", "allow"],
    ],
    (c) => bash(c),
  );
});

test("a push the guard cannot read is refused rather than guessed", () => {
  expectAll(
    [
      ['git push origin "$BRANCH"', "deny"],
      ["git push origin $(git branch --show-current)", "deny"],
      ["git push origin HEAD:$B", "deny"],
      ["echo main | xargs git push origin", "deny"],
      ['cd "$DIR" && git push', "deny"],
      ["git --git-dir=/elsewhere/.git push", "deny"],
    ],
    (c) => bash(c),
  );
});

test("a bare push is judged by the branch it would push", () => {
  const onMain = repo({ branch: "main" });
  const tracksMain = repo({ merge: "main" }); // how the harness cuts branches
  const matching = repo({ pushDefault: "matching" });
  const configured = repo({ remotePush: "refs/heads/*:refs/heads/*" });
  const detached = repo({ detached: true });
  const own = repo({ merge: "claude/feature" });
  const untracked = repo();
  assert.equal(verdict(bash("git push", onMain)), "deny");
  assert.equal(verdict(bash("git push origin", onMain)), "deny");
  assert.equal(verdict(bash("git push origin HEAD", onMain)), "deny");
  assert.equal(verdict(bash("git push -u origin @", onMain)), "deny");
  assert.equal(verdict(bash("git push", tracksMain)), "deny");
  assert.equal(verdict(bash("git push", matching)), "deny");
  assert.equal(verdict(bash("git -c push.default=matching push", own)), "deny");
  assert.equal(verdict(bash("git push", configured)), "deny");
  assert.equal(verdict(bash("git push", detached)), "allow"); // git refuses this itself
  assert.equal(verdict(bash("git push", own)), "allow");
  assert.equal(verdict(bash("git push", untracked)), "allow");
  assert.equal(verdict(bash("git push -u origin HEAD", tracksMain)), "allow");
  // The directory is followed through cd and -C, and a subshell's cd stays in it.
  assert.equal(verdict(bash(`cd ${onMain} && git push`, own)), "deny");
  assert.equal(verdict(bash(`git -C ${onMain} push`, own)), "deny");
  assert.equal(verdict(bash(`cd ${own} && git push`, onMain)), "allow");
  assert.equal(verdict(bash(`(cd ${own} && git push) && git push`, onMain)), "deny");
  assert.equal(verdict(bash(`(cd ${onMain}) && git push`, own)), "allow");
  assert.equal(verdict(bash(`cd "$X" && sh -c 'git push'`, own)), "deny");
});

test("the migration history cannot be rewritten from a shell", () => {
  expectAll(
    [
      ["supabase migration repair --status reverted 20260908235234", "deny"],
      ["npx supabase migration repair --status applied 1", "deny"], // got through the grep
      ["npx -y supabase@latest migration repair 1", "deny"], // got through the grep
      ["supabase --debug migration repair 1", "deny"],
      ["pnpm dlx supabase migration repair 1", "deny"],
      ["./node_modules/.bin/supabase migration repair 1", "deny"],
      [`psql "$DB" -c "delete from supabase_migrations.schema_migrations where version = '1'"`, "deny"],
      [`psql "$DB" <<'SQL'\nUPDATE supabase_migrations.schema_migrations SET name = 'x';\nSQL`, "deny"],
      ["supabase migration list", "allow"],
      ["supabase migration new add_thing", "allow"],
      [`psql "$DB" -c "select version from supabase_migrations.schema_migrations where name like '%update%'"`, "allow"],
      ['git commit -m "why we never run supabase migration repair"', "allow"],
      ['git commit -m "stop the delete from schema_migrations"', "allow"],
      ["grep -rn schema_migrations supabase/ | head", "allow"],
    ],
    (c) => bash(c),
  );
});

test("GitHub: pull requests wait for Joel, and nothing commits to main", () => {
  const body = 'Requested by Joel on 2026-09-24 — "close out"\n\n## Deployment\nNothing.';
  expectAll(
    [
      [["create_pull_request", { title: "x", body, head: "claude/x", base: "main" }], "ask"],
      [["create_pull_request", { title: "x", body: "no request line", head: "claude/x" }], "deny"],
      [["create_pull_request", { title: "x", body, draft: true }], "deny"],
      [["merge_pull_request", { pullNumber: 1, merge_method: "squash" }], "ask"],
      [["merge_pull_request", { pullNumber: 1 }], "deny"],
      [["merge_pull_request", { pullNumber: 1, merge_method: "merge" }], "deny"],
      [["enable_pr_auto_merge", { pullNumber: 1 }], "ask"], // got through
      [["update_pull_request", { pullNumber: 1, title: "y" }], "ask"], // got through
      [["update_pull_request", { pullNumber: 1, body }], "ask"],
      [["update_pull_request", { pullNumber: 1, body: "rewritten without the line" }], "deny"],
      [["update_pull_request_branch", { pullNumber: 1 }], "ask"],
      [["pull_request_review_write", { method: "submit_pending", event: "APPROVE" }], "ask"], // got through
      [["push_files", { branch: "main", files: [] }], "deny"], // got through
      [["create_or_update_file", { branch: "refs/heads/main", path: "x" }], "deny"], // got through
      [["delete_file", { path: "x" }], "deny"],
      [["push_files", { branch: "claude/x", files: [] }], "ask"],
      [["pull_request_read", { pullNumber: 1 }], "allow"],
      [["add_issue_comment", { issue_number: 1, body: "x" }], "allow"],
    ],
    ([name, input]) => decide({ tool_name: `mcp__github__${name}`, tool_input: input }),
  );
});

test("Supabase: reads and apply_migration go ahead; the rest waits for Joel", () => {
  const sql = (query) => mcp("mcp__Supabase__execute_sql", { project_id: "p", query });
  assert.equal(sql("select count(*) from coffee.bags"), "allow");
  assert.equal(sql("select * from x where status = 'deleted' -- update later"), "allow");
  assert.equal(sql("select updated_at from x"), "allow");
  assert.equal(sql("select * from supabase_migrations.schema_migrations order by version"), "allow");
  assert.equal(sql("insert into coffee.bags (name) values ('x')"), "ask");
  assert.equal(sql("ALTER TABLE health.entries ADD COLUMN x int"), "ask");
  assert.equal(sql('grant select on "shared"."contacts" to anon'), "ask");
  assert.equal(sql("with d as (delete from x returning *) select * from d"), "ask");
  assert.equal(sql("delete from supabase_migrations.schema_migrations where version = '1'"), "deny"); // got through
  assert.equal(sql('INSERT INTO "supabase_migrations"."schema_migrations" (version) VALUES (\'1\')'), "deny");
  assert.equal(mcp("mcp__Supabase__apply_migration", { name: "x", query: "create table x ()" }), "allow");
  assert.equal(mcp("mcp__Supabase__apply_migration", { name: "x", query: "delete from supabase_migrations.schema_migrations" }), "deny");
  assert.equal(mcp("mcp__Supabase__list_tables", {}), "allow");
  assert.equal(mcp("mcp__Supabase__get_advisors", {}), "allow");
  assert.equal(mcp("mcp__Supabase__query_logs", {}), "allow");
  assert.equal(mcp("mcp__Supabase__generate_typescript_types", {}), "allow");
  for (const t of ["create_project", "pause_project", "restore_project", "create_branch", "delete_branch", "merge_branch", "reset_branch", "rebase_branch", "deploy_edge_function", "some_future_tool"]) {
    assert.equal(mcp(`mcp__Supabase__${t}`, {}), "ask", t);
  }
});

test("Vercel: reads go ahead; changes and credentials wait for Joel", () => {
  for (const t of ["list_projects", "get_project", "list_deployments", "get_runtime_logs", "search_vercel_documentation", "get_firewall_config", "filter_project_envs", "web_fetch_vercel_url"]) {
    assert.equal(mcp(`mcp__Vercel__${t}`, {}), "allow", t);
  }
  for (const t of ["create_project", "update_project", "pause_project", "unpause_project", "create_project_env", "edit_project_env", "add_project_domain", "update_record", "update_firewall_config", "put_firewall_config", "request_promote", "request_rollback", "create_deployment", "buy_domain", "get_auth_token", "get_project_token", "get_project_env", "some_future_tool"]) {
    assert.equal(mcp(`mcp__Vercel__${t}`, {}), "ask", t);
  }
  // Names are a read; values are a credential.
  assert.equal(mcp("mcp__Vercel__filter_project_envs", { decrypt: "true" }), "ask");
});

test("Linear: an issue has an owner, an agent, and ends with Next steps that name who acts", () => {
  const good = "What and why.\n\n## Next steps\n\n1. **Joel:** decide.\n2. **TD:** build it.\n   * a detail\n3. **Done:** checked.\n";
  const save = (input) => mcp("mcp__Linear__save_issue", input);
  const create = (extra) => save({ team: "TEC", title: "t", labels: ["owner:TD", "agent:TD"], description: good, ...extra });
  assert.equal(create({}), "allow");
  assert.equal(create({ labels: ["owner:Joel", "agent:Health", "Parked"] }), "allow");
  assert.equal(create({ labels: ["agent:TD"] }), "deny");
  assert.equal(create({ labels: ["owner:TD"] }), "deny");
  assert.equal(create({ labels: ["owner:TD", "owner:Joel", "agent:TD"] }), "deny");
  assert.equal(create({ labels: ["1f4adc9b-38dc-4f83-9c67-6cdfaae4d47a", "agent:TD"] }), "deny");
  assert.equal(create({ description: undefined }), "deny");
  assert.equal(create({ description: "No section at all." }), "deny");
  assert.equal(create({ description: "## Next steps\n\n1. **TD:** x\n\n## Notes\n\nlater" }), "deny");
  assert.equal(create({ description: "## Next steps\n\nJust prose, no steps." }), "deny");
  assert.equal(create({ description: "## Next steps\n\n1. **TD:** x\n2. Verify it in the logs." }), "deny");
  assert.equal(create({ description: "## Next steps\n\n1. The technical director builds it." }), "allow");
  assert.equal(create({ description: "## Next steps\n\n1. **Nobody:** nothing until it is un-parked." }), "allow");
  assert.equal(create({ description: "```\n## Next steps\n1. TD: x\n```\n" }), "deny");
  assert.equal(create({ description: "## Next steps\n\n1. Check /api/health answers." }), "deny");

  assert.equal(save({ id: "TEC-1", state: "Done" }), "allow");
  assert.equal(save({ id: "TEC-1", addLabels: ["Parked"] }), "allow");
  assert.equal(save({ id: "TEC-1", removeLabels: ["owner:TD"], addLabels: ["owner:Joel"] }), "allow");
  assert.equal(save({ id: "TEC-1", removeLabels: ["owner:TD"] }), "deny");
  assert.equal(save({ id: "TEC-1", removeLabels: ["agent:TD"] }), "deny");
  assert.equal(save({ id: "TEC-1", labels: ["owner:TD"] }), "deny");
  assert.equal(save({ id: "TEC-1", description: good }), "allow");
  assert.equal(save({ id: "TEC-1", description: "Rewritten, and the steps are gone." }), "deny");
  assert.equal(save({ id: "TEC-1", patch: [{ op: "replace", old_string: "old", new_string: "new" }] }), "allow");
  assert.equal(save({ id: "TEC-1", patch: [{ op: "replace", old_string: "## Next steps\n\n1. x", new_string: "" }] }), "deny");
  assert.equal(save({ id: "TEC-1", patch: [{ op: "replace_range", from: "## Next steps", to: "3.", new_string: "## Next steps\n\n1. **TD:** y\n" }] }), "allow");
  assert.equal(save({ id: "TEC-1", patch: [{ op: "append", text: "\n\n## Notes\n\nx" }] }), "deny");
  assert.equal(save({ id: "TEC-1", patch: [{ op: "insert_before", anchor: "## Next steps", text: "## Notes\n\nx\n\n" }] }), "allow");
  assert.equal(mcp("mcp__Linear__list_issues", {}), "allow");
  assert.equal(mcp("mcp__Linear__save_comment", { body: "x" }), "allow");
});

test("helpers", () => {
  assert.ok(targetsMain("main") && targetsMain("refs/heads/main") && targetsMain("heads/main") && targetsMain("refs/heads/*"));
  assert.ok(!targetsMain("claude/main") && !targetsMain("refs/tags/main") && !targetsMain("mainline"));
  assert.deepEqual(nextSteps("## Next steps\n1. **Joel:** go"), []);
  assert.equal(stripSql("select 'it''s -- not a comment' /* x */ from t -- y"), "select  ''    from t ");
  assert.deepEqual(
    lex("a && b | c; d\ne").map((s) => s.words[0]),
    ["a", "b", "c", "d", "e"],
  );
  // Never throws, whatever it is handed.
  for (const s of ['"', "'", "$(", "`", "(((", ")))", "<<", "<<EOF\n", "\\", "a\\\nb", "x>&", "&>", "#", "$((1+2))", "a <(b) >(c)"]) {
    assert.doesNotThrow(() => lex(s), s);
    assert.doesNotThrow(() => bash(`git push ${s}`), s);
  }
});

/* ------------------------------------------------------------------------- */
/* The commands exactly as settings.json runs them                           */
/* ------------------------------------------------------------------------- */

const settings = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf8"));
const hookFor = (tool) => {
  const entry = settings.hooks.PreToolUse.find((e) => new RegExp(e.matcher).test(tool));
  return entry?.hooks[0].command;
};

function run(command, input, { env = {}, shell = "/bin/sh" } = {}) {
  const r = spawnSync(shell, ["-c", command], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env },
  });
  const out = r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
  return { status: r.status, decision: out?.permissionDecision ?? "allow", reason: out?.permissionDecisionReason, stderr: r.stderr };
}

test("settings.json sends each tool to the guard it needs, and no other", () => {
  for (const t of ["Bash", "mcp__github__create_pull_request", "mcp__github__merge_pull_request", "mcp__github__enable_pr_auto_merge", "mcp__github__pull_request_review_write", "mcp__github__push_files", "mcp__github__create_or_update_file", "mcp__github__delete_file", "mcp__github__update_pull_request_branch", "mcp__Supabase__execute_sql", "mcp__Supabase__create_project", "mcp__Vercel__create_project_env", "mcp__Linear__save_issue"]) {
    assert.ok(hookFor(t), `${t} has no hook`);
  }
  for (const t of ["Read", "Edit", "mcp__github__get_me", "mcp__github__list_branches", "mcp__Linear__list_issues", "mcp__Linear__save_comment", "mcp__Notion__notion-search"]) {
    assert.equal(hookFor(t), undefined, `${t} should not be guarded`);
  }
});

test("end to end: the real commands deny, ask and allow", () => {
  for (const shell of ["/bin/sh", "/bin/bash"]) {
    const push = (command) => run(hookFor("Bash"), { tool_name: "Bash", tool_input: { command }, cwd: FEATURE }, { shell });
    assert.equal(push("git push origin main").decision, "deny", shell);
    assert.equal(push("git push -u origin claude/feature").decision, "allow", shell);
    assert.equal(push("ls -la").decision, "allow", shell);
    assert.equal(push("ls -la").status, 0, shell);
    const pr = run(hookFor("mcp__github__merge_pull_request"), { tool_name: "mcp__github__merge_pull_request", tool_input: { merge_method: "squash" } }, { shell });
    assert.equal(pr.decision, "ask", shell);
    const env = run(hookFor("mcp__Vercel__create_project_env"), { tool_name: "mcp__Vercel__create_project_env", tool_input: {} }, { shell });
    assert.equal(env.decision, "ask", shell);
  }
});

test("end to end: it fails closed", () => {
  const bashHook = hookFor("Bash");
  const mcpHook = hookFor("mcp__github__merge_pull_request");
  const pushInput = { tool_name: "Bash", tool_input: { command: "git push origin main" }, cwd: FEATURE };
  const quiet = { tool_name: "Bash", tool_input: { command: "ls" }, cwd: FEATURE };
  const merge = { tool_name: "mcp__github__merge_pull_request", tool_input: {} };

  // No guard file where settings.json looks for it.
  const empty = mkdtempSync(join(tmpdir(), "guard-empty-"));
  assert.equal(run(bashHook, pushInput, { env: { CLAUDE_PROJECT_DIR: empty } }).status, 2);
  assert.equal(run(mcpHook, merge, { env: { CLAUDE_PROJECT_DIR: empty } }).status, 2);

  // No node on the PATH: only cat, which the Bash hook needs to read its input.
  const bin = mkdtempSync(join(tmpdir(), "guard-bin-"));
  symlinkSync(execFileSync("sh", ["-c", "command -v cat"], { encoding: "utf8" }).trim(), join(bin, "cat"));
  assert.equal(run(bashHook, pushInput, { env: { PATH: bin } }).status, 2);
  assert.equal(run(mcpHook, merge, { env: { PATH: bin } }).status, 2);
  // …though a command that cannot be a push still runs, without node.
  assert.equal(run(bashHook, quiet, { env: { PATH: bin } }).status, 0);

  // Input the guard cannot read.
  const r = spawnSync("/bin/sh", ["-c", mcpHook], { input: "not json", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } });
  assert.equal(r.status, 2);

  // A guard that cannot load its rules: a module that fails to load exits 1.
  const broken = mkdtempSync(join(tmpdir(), "guard-broken-"));
  mkdirSync(join(broken, ".claude", "hooks"), { recursive: true });
  copyFileSync(join(HOOKS, "guard.mjs"), join(broken, ".claude", "hooks", "guard.mjs"));
  assert.equal(run(mcpHook, merge, { env: { CLAUDE_PROJECT_DIR: broken } }).status, 2);
});
