---
name: drift-check
description: The nightly rules-drift audit, run now — drift and guard tests, every RULES.md and NOTES.md against the code on main, migrations, live deploys and the issue queue — as one report. Read-only. The owner types /drift-check, or /drift-check <app> for one app.
disable-model-invocation: true
---

# Drift check

The same audit as the routine "Issues - Nightly Drift Check", run on demand in this session. Keep
the two in step: a change to one is a change to the other, in the same request.

Read-only: no file edit, branch, commit, push, pull request, issue write, or Supabase or Vercel
write. Filing what it finds is a separate request.

## Scope

- **None:** everything below.
- **An app folder under `apps/`:** step 2 reads that app's `RULES.md` and `NOTES.md` only, and steps
  3–5 are narrowed to that app (its schema's migrations, its Vercel project, issues with
  `app:<app>`). Step 1 always runs whole.
- Anything else: name the app folders and stop.

## Check first

Read `main` as it is on GitHub, never this checkout's local `main`: `git fetch`, then read files
with `git show origin/main:<path>`, or in a throwaway worktree at `origin/main` that you remove
afterwards. Never `git checkout main` here; it swaps the guard. You need `gh` (issues in
`Tech-Paddock/paddock-issues`) and the Supabase and Vercel connectors. If any is missing, the first
line of the reply is "Audit did not run: <what is missing>". Then stop.

## The audit

1. **Checks:** in the `origin/main` worktree, run `node scripts/drift-check.mjs` and
   `node --test .claude/hooks/guard.test.mjs scripts/smoke-check.test.mjs`. Report anything that
   fails or warns.
2. **Rules against code:** read CLAUDE.md, `.claude/agents/td/RULES.md` and `NOTES.md`,
   `.claude/agents/deployment/RULES.md` and `NOTES.md`, every `apps/*/RULES.md` and `NOTES.md`,
   `supabase/README.md` and `.claude/DECISIONS.md`. Check each rule against the code on `origin/main`,
   and list every place they disagree, with the file and line, what the rule says, what the code
   does, and which one looks wrong. A `NOTES.md` holding a to-do is a finding too. Split the reading
   across read-only helpers (`Explore`), one per app or two, run in parallel. Before reporting a
   helper's "the code is wrong", read the code yourself.
3. **Migrations:** compare `supabase/migrations/` on `origin/main` with Supabase `list_migrations`
   and list any difference. The withheld seed version `20260908235234` is expected.
4. **Deploys:** every Vercel production deployment is READY, and `GET /api/version` on each live app
   returns a commit that contains that app's last merge. Name any that doesn't.
5. **Issues** in `Tech-Paddock/paddock-issues` (`gh issue list`), each mismatch:
   - an issue still open when its work is merged (a merged pull request in `tech-paddock` that names
     it);
   - a `status:in-review` issue with no pushed branch or open pull request;
   - an issue without exactly one type label (Feature, Enhancement, Bug or Owner task);
   - an open issue with no `status:` label, or a closed one that still has one;
   - an assignee on anything but an `Owner task`.

   Label names may differ in case. Linear is a read-only archive; don't check it.

## The reply

One short report. Open with a `---` line, then "Audit ran: <n> findings" or "Audit ran: clean".
List the findings most serious first: code that is wrong, then broken checks or deploys, then stale
docs, then issue hygiene. Each finding is a file and line, or a link. If there are no findings, say
what you checked. End by asking whether to file them: one Bug per wrong piece of code, and one issue
for the stale docs.
