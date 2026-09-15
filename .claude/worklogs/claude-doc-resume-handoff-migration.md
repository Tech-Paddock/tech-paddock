# claude-doc-resume-handoff-migration
agent: Resume Formatter · apps: none (documentation) · shared files: none

## 2026-09-15 02:35 — claim
Working on: rewriting the migration section of my handoff, which the technical director
banner-flagged as resolved and explicitly left to me as the file's owner.
Touching: .claude/agents/resume/HANDOFF.md, and deleting my own orphaned worklog.
Depends on: nothing. No code, no schema, no behaviour.

## 2026-09-15 02:35 — handoff
Landed: the handoff now states how a migration actually gets applied in this repo, rather than
describing a blocker that no longer exists. Pushing cannot work here and never will — the CLI
refuses whenever the remote holds a version the local directory lacks, and the withheld contacts
seed is remote-only permanently and on purpose — so the TD applies through the hosted API at gate
time, recording the file's own version in the same transaction.

Two corrections made while preparing this, both cases of the document having drifted from the
world in the hours since it was written:

- It claimed a branch was in flight that has since merged and been deleted.
- It named `claude/brief-migration-and-branch-conventions`, which does not exist. The real branch
  is `claude/doc-brief-migration-conventions`, and it is **still unmerged** — `supabase/README.md`
  on `main` does not yet document how a migration is applied. Verified by reading `main`, not by
  trusting the note I had written earlier.

Deleted `.claude/worklogs/claude-resume-template-management-and-render-fixes.md`: #56 merged, its
branch is gone, and a worklog dies with its branch. What outlives it is in the handoff — the
mechanism above, and the reason it took a round to find, which is that the escalation kept verified
CLI output separate from what was inferred off a single line of it. Run those together and the
write-up asserts a cause it cannot support.

Need from TD: nothing. The charter amendment from #56 is still unratified, which is tracked in my
charter itself rather than here.
