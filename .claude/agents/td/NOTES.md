# Technical Director — notes

What is true now, and the traps. Branch and pull request state is never written here; read it live.

## State

- **Shape:** one TD at a time + builders (started by the owner's `/build`) + Deployment (on `/deploy`) + CI. Each app's `RULES.md` and `NOTES.md` sit in its folder. Linear
  labels: one of the `type` group (Feature, Enhancement, Bug, Owner task), `app:<folder>`; the
  parking lot is the `Parked` label. The `owner:` labels and `Phone check` retired (TEC-238).
- **Every app is on Next 16 with `proxy.ts`,** one gate copy.
- **Without a session, the gate lets through** the login page, its endpoint, its icons and Next's
  `/_next/` assets, and `/api/cron/prices` with `Authorization: Bearer <CRON_SECRET>` (TEC-132,
  owner-approved). The cron path is in every app's gate and fails closed; only `tp-cookbook` has
  the secret and the route. `GET /api/version` (exact path and method) is open too, in every app
  (TEC-57, owner-approved); the route is stamped from `packages/shared` and returns only the commit.
- **`apps/showcase` is yours to scaffold when the owner wants it** (TEC-99). The owner cleared reading
  `Tech-Paddock/teamusauploader` on 2026-10-18; the demo uses fake data and a neutral name.
- **Linear writes don't prompt.** Deletes, label retirement and diff tools still ask.
- **Health prices recipe lines from Cookbook's `GET /api/servings`**, forwarding only
  `paddock_session`. A `SESSION_SECRET` mismatch between `tp-health` and `tp-cookbook` reads as
  "Couldn't reach the Cookbook", not a login bug.
- **The guard knows Deployment by `agent_type: "deployment"` with an `agent_id`;** only Deployment
  writes to a pull request. The main session, the builder and a main session claiming the type are
  all refused.
- **The guard also refuses, for every role (TEC-221):** deleting a remote branch, pushing to any
  branch but `claude/…` (tags only as `refs/tags/…`), `gh repo` / `secret` / `variable` / `release`
  writes, any `gh api` write (a field without `-X GET` is a POST), and printing the GitHub token
  (`gh auth token`, `gh/hosts.yml`). On the owner's PC `gh` is the owner's own login, so this is
  the only stop.
- **A builder or Deployment start is not held in auto mode (TEC-220, parked).** The guard asks;
  auto mode approves it without the owner. Only the rule "start one on the owner's command" holds.
- **Migration history is clean:** repo and `list_migrations` differ by exactly `20260908235234`,
  withheld because it seeds personal data.
- **This container cannot reach `*.techpaddock.io`.** Use Vercel runtime logs, or ask the owner.
- **TD sessions run on the owner's PC,** in a `bridge` environment whose name carries `:td:`
  (the `~/paddock/td` folder). The cloud environment named `PADDOCK_ROLE=td` remains for scheduled
  tasks; its name sets no variable. Kickoff reads the environment with `get_session`.
- **A scheduled task carries its own repositories and connectors,** set in its edit dialog at
  claude.ai/code/routines. A run with neither still reports Succeeded and does nothing. The Weekly
  rules-drift audit says "Audit did not run" when it cannot audit (TEC-162).

## Traps

- **A brief that names an issue outside the plan makes the guard ask the owner** to start that
  helper (2026-11-10: two builder prompts). In a plan run, name only the plan's issues in a brief;
  describe older work in words, without its TEC number.
- **What only a phone can prove is not proven by jsdom** (TEC-255 broke every Save, fixed in
  TEC-258): native pickers, `showPicker()`, keyboards, gestures. File an owner task for a
  phone check before such a change is called done, or choose a design that needs no phone-only behaviour.
- **A demo must look like the app it changes** (owner, 2026-11-09: "Sometimes it's hard to tell if a
  feature is correct because the [rest] of the app looks off"). Build it from the app's own
  `lib/theme.css`, `globals.css` and the component's real markup and Tailwind classes, read from
  the source, not redrawn. Keep everything around the change exactly as it ships. Change only the
  part under review, and say on the page which part that is.
- **The guard runs from this session's checkout.** Edit `.claude/hooks/` in a separate worktree.
- **A container's local `main` can sit far behind `origin/main`.** Sessions start detached at the
  remote head; `git checkout main` in the main checkout swaps the guard and the skills for old
  copies. Cut branches from `origin/main` (`git switch -c <branch> origin/main`).
- **On the owner's PC, new sessions start from `~/paddock/td`'s local `main`.** A SessionStart hook
  (TEC-262) fast-forwards it when it is clean and on `main`, but only after the new session's
  worktree is made, so a session can still start one merge behind. If it is dirty or off `main`,
  the hook skips it: compare it with `origin/main` at kickoff and say so.
- **A project env read cannot see team-shared variables.** `list_user_events` (the audit log) shows
  every change, shared ones included.
- **The firewall cannot be read or written through the API** (`Seawall Config not found`).
- **Runtime logs hold no request lines.** To see whether a feature ran, count rows with
  `execute_sql`: counts and sources only, never content.
- **Linear's pull request automations are off** (every row No action, owner, 2026-10-26). A pull
  request still links its issue, but only Deployment and the TD set statuses.
- **The auto-mode classifier can refuse work under `.claude/`.** It clears once the owner's own
  words name the change. Never route around it or probe the guard by editing it live.
- **A Linear patch matches stored text.** Copy the anchor from `get_issue`, tags and all.
- **Remote branches cannot be deleted or renamed from here.** The guard refuses a delete; in a cloud
  session the proxy refuses a rename too, and that refusal looks like a network blip: stop after one
  try. Merged branches auto-delete; the owner deletes stale ones.
- **A container restart kills the builder.** Unpushed work survives in `.claude/worktrees/agent-*`
  until the container goes; brief a fresh builder to carry it over.
- **Parallel builders can pick the same migration timestamp.** Check before merging.
- **Two merges seconds apart can skip an app's deploy** (seen 2026-11-08, #387 then #388). Vercel
  builds only the newest `main` commit, and each `ignoreCommand` reads that commit alone, so the
  earlier merge's app never builds. Brief Deployment to let each app's production deploy start
  before the next merge, or to confirm every merged app is READY on a commit that contains it.
- **CI runs on push only** (TEC-158); a pull request shows the push run's checks. If `main`'s
  required checks ever stop showing on a pull request, that change is the first suspect. Read checks
  with `pull_request_read` → `get_check_runs`, not a curl loop.
- **A stacked branch conflicts once its base squash-merges.** See `DECISIONS.md`.
- **The hosted API renames migrations.** Read `list_migrations` back and rename the file on the
  branch; a stacked branch carrying the old name brings it back.
- **The Supabase connector cannot run destructive SQL.** `apply_migration` or `execute_sql` with a
  `DROP` or `DELETE` times out at 60s on an approval prompt, while additive DDL goes through at
  once. So the owner runs every `DROP` or `DELETE` in the SQL Editor from Deployment's block
  (`supabase/README.md`, owner 2026-11-02). Brief a destructive issue that way, and still design
  around the DROP where you can (a function-backed check, as `lando.details_ok`).
- **Dropping an exposed schema takes down every app** (PGRST002) until the API's schema list loses
  it. The live list is under Project Settings → API; the Integrations → Data API page can show a
  clean list while the API still serves the old one. Clean that list first, prove it (rename the
  schema and watch the API stay up), then drop.
- **A helper worktree refuses git inside a loop, a variable or `git -C`.** Run each git plainly.
- **Finished work hides in other sessions.** At kickoff, `list_sessions` and `git branch -r`.
- **Cost is context × turns.** Brief tightly; end the session once branches are merged.
- **A typed `/build`, `/deploy` or `/execute-plan` is the approval** (TEC-237). The prompt hook
  writes its record to `.claude/state/` (`build-`, `deploy-`, `plan-approved.json`); for 12 hours,
  in that session, the guard starts that command's helpers without a click. Any other start asks.
  No tool writes those files, and a shell command that names one is refused.
- **Only the owner's prompt writes a record.** If a `send_message` from another session that began
  `/deploy` ever reached the prompt hook, it would count; so TD-to-TD messages open with plain words.
- **Smoke** (`.github/workflows/smoke.yml`) probes each app signed out after every production
  deploy and on demand (Actions → Smoke → Run workflow). All apps passed on 2026-10-26. A red run
  is post-merge news, not a blocked merge.
- **Resuming a helper with `SendMessage` does not ask again;** the guard's matcher is `Agent|Task`.
  A lock holder relies on it to fold another session's branches into its running Deployment.
