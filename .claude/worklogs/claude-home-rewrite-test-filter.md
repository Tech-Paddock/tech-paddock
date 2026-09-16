# claude-home-rewrite-test-filter
agent: TechPad Gen · apps: none (documents only) · shared files: none

## 2026-09-16 01:05 — claim
Working on: repairing the history-rewrite safety test in my own handoff, which #68 silently broke,
and clearing the orphaned worklog #68 left behind.
Touching: `.claude/agents/techpad-gen/HANDOFF.md`, `.claude/worklogs/` (this file, and one deletion)
Depends on: nothing. No app code, no shared file, no schema, no migration.

## 2026-09-16 01:05 — I broke my own diagnostic, and only found it because Joel asked
Joel asked whether anything was uncommitted or unmerged. Nothing of mine was — the tree was clean
and all 47 files #68 touched were byte-identical to `origin/main`, checked by content rather than by
commit because a squash merge leaves git unable to match the commits. But the sweep turned up two
things worth writing down.

**The test in this handoff stopped discriminating, and #68 is the cause.** It said a branch is safe
once `git diff origin/main <branch> -- apps/tracker` comes back empty. #68 added `lib/theme.css`,
`lib/theme.ts`, `lib/livery.ts` and `app/ThemeControl.tsx` to every app and rewrote the colour
classes, so every branch cut before 2026-09-16 now differs under `apps/tracker` regardless of
whether it carries anything sensitive. Run against the five stale branches in this container it
flagged **all five**, including two that were provably clean. A test that answers yes to everything
answers nothing, and it would have read as diligence.

The fix narrows it to the three files the scrub actually touched —
`apps/tracker/lib/matchMeetings.ts` and `apps/tracker/tests/`. Against those, three of the five
branches carried the un-scrubbed entities and two were theme-only noise.

**This is the shape of the mistake worth remembering**: a change that is correct in itself quietly
invalidated a safety check written somewhere else, and nothing failed. No test covers a diagnostic
buried in a markdown file. The only reason it surfaced is that someone asked a question that made me
run it.

## 2026-09-16 01:05 — the branch that the harness itself points at
Of the three refs carrying un-scrubbed fixtures, one was `claude/techpad-gen-kickoff-qjnbws` — the
branch **this session's own harness prompt names as the branch to develop on**. Its remote is
deleted, so a push would not update anything; it would recreate the branch and republish the
personal information. That is the resurrected-branch incident already in the ledger, wearing a worse
costume.

Nothing went wrong, and the reason is worth naming rather than taking as luck: `CLAUDE.md` says to
cut a fresh branch once the change is agreed, so the kickoff branch was never pushed. The rule paid
for itself here. It is now stated in the handoff beside the test, because the next session will get
the same harness prompt and the same branch.

## 2026-09-16 01:05 — cleanup, on Joel's instruction
Joel: *"Yes to both"* — delete the stale local branches and reset local `main`, and fix the test.

Five local branches deleted, all with `[gone]` upstreams and all superseded:
`claude/home-theme-ownership` (#62), `claude/techpad-gen-admin-in-shell` (#59),
`claude/techpad-gen-handoff-current` (#58), `claude/techpad-gen-kickoff-qjnbws` (harness kickoff),
`claude/ui-livery-themes` (#68). Local `main` was stranded 56 commits back at **#32** on
pre-rewrite history and is reset to `origin/main`.

**Verified before deleting rather than after.** Every SHA was recorded first, and
`claude/ui-livery-themes` was confirmed fully merged by comparing each of its 47 files against
`origin/main` — 0 differed. A blanket `git diff origin/main <branch>` reported 30 differing files
and that number is misleading: none of them were files that branch touched. They are other agents'
newer work the branch predates. Acting on the 30 would have been acting on a number I had not
understood.

The container now holds two refs, `main` and this branch, and neither carries the un-scrubbed
fixtures.

## 2026-09-16 01:05 — one deletion beyond what was asked, and why
`.claude/worklogs/claude-ui-livery-themes.md` is deleted. Its branch merged as #68 and its remote is
gone, so the README's rule applies: a worklog dies with its branch. Its durable content already
lives in `HANDOFF.md` and in #68's commit messages, which is the condition the README sets before
deleting. Called out here because it was not part of what Joel said yes to — it is the standing
convention, not a new decision, and #69 had to clear fifteen of these at once because the rule was
skipped fifteen times in a row.

`claude-brief-status-footer.md` is left alone. It is not mine, and its branch may still be live.

## 2026-09-16 01:05 — handoff
Landed: the rewrite test narrowed to the three files that carry signal, the kickoff-branch trap
named beside it, the cleanup recorded, and one orphaned worklog removed.

Open: nothing from this change.

**Deployment: nothing, and nothing to verify.** No file under `apps/` is touched, so per-app build
scoping rebuilds no app at all. No environment variable, no dashboard setting, no migration, no DNS,
no required check. If this never merges, the only loss is that the next session inherits a safety
test that flags every branch equally — which is worse than no test, because it looks like one.
