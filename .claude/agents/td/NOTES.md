# Technical Director — notes

What is true now, and the traps. Branch and pull request state is never written here; read it live.

## State

- **Shape:** one TD at a time + up to three builders per issue (started by the owner's `/build`) + CI. Each app's `RULES.md` and `NOTES.md` sit in its folder. Linear
  labels: `owner:Owner`, `owner:TD`, `app:<folder>`; the parking lot is the `Parked` label.
- **Every app is on Next 16 with `proxy.ts`,** one gate copy.
- **`apps/showcase`'s scaffold waits on the owner showing you the uploader.**
- **Linear writes don't prompt.** Deletes, label retirement and diff tools still ask.
- **Health prices recipe lines from Cookbook's `GET /api/servings`**, forwarding only
  `paddock_session`. A `SESSION_SECRET` mismatch between `tp-health` and `tp-cookbook` reads as
  "Couldn't reach the Cookbook", not a login bug.
- **The guard tells the main session from a helper by `agent_id`;** only the main session writes to
  a pull request.
- **Migration history is clean:** repo and `list_migrations` differ by exactly `20260908235234`,
  withheld because it seeds personal data.
- **This container cannot reach `*.techpaddock.io`.** Use Vercel runtime logs, or ask the owner.

## Traps

- **The guard runs from this session's checkout.** Edit `.claude/hooks/` in a separate worktree.
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
- **Remote branches cannot be deleted or renamed from here.** The proxy refusal looks like a network
  blip; stop after one try. Merged branches auto-delete; the owner deletes stale ones.
- **A container restart kills the builder.** Unpushed work survives in `.claude/worktrees/agent-*`
  until the container goes; brief a fresh builder to carry it over.
- **Parallel builders can pick the same migration timestamp.** Check before merging.
- **CI runs on push only** (TEC-158); a pull request shows the push run's checks. If `main`'s
  required checks ever stop showing on a pull request, that change is the first suspect. Read checks
  with `pull_request_read` → `get_check_runs`, not a curl loop.
- **A stacked branch conflicts once its base squash-merges.** See `DECISIONS.md`.
- **The hosted API renames migrations.** Read `list_migrations` back and rename the file on the
  branch; a stacked branch carrying the old name brings it back.
- **The Supabase connector cannot run destructive SQL.** `apply_migration` or `execute_sql` with a
  `DROP` times out at 60s, while additive DDL goes through at once; a timed-out drop may still
  land later. Design around the DROP (a function-backed check, widened by `create or replace`, as
  `lando.details_ok`) and give a swap `lock_timeout`; the owner's SQL Editor run is the last resort,
  after a read-back shows it did not land (`supabase/README.md`, owner 2026-10-24).
- **Dropping an exposed schema takes down every app** (PGRST002) until the API's schema list loses
  it. The live list is under Project Settings → API; the Integrations → Data API page can show a
  clean list while the API still serves the old one. Clean that list first, prove it (rename the
  schema and watch the API stay up), then drop.
- **A helper worktree refuses git inside a loop, a variable or `git -C`.** Run each git plainly.
- **Finished work hides in other sessions.** At kickoff, `list_sessions` and `git branch -r`.
- **Cost is context × turns.** Brief tightly; end the session once branches are merged.
- **Deployment and the builder start with an approval click** on top of `/deploy` and `/build`; the
  hook cannot tell otherwise that the owner asked. Auto mode shows the owner the click (seen on a
  Deployment start, 2026-10-26).
- **Smoke** (`.github/workflows/smoke.yml`) probes each app signed out after every production
  deploy and on demand (Actions → Smoke → Run workflow). All apps passed on 2026-10-26. A red run
  is post-merge news, not a blocked merge.
- **Resuming a helper with `SendMessage` does not ask again;** the guard's matcher is `Agent|Task`.
  `/deploy` relies on it to resume a Deployment held by the lock.
