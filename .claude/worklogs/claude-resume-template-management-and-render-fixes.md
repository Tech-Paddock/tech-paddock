# claude-resume-template-management-and-render-fixes
agent: Resume Formatter · apps: apps/resume · shared files: none

## 2026-09-14 22:15 — claim
Working on: a batch of five fixes Joel asked for on apps/resume — dropzone uploads, template
download, Career Highlights table rendering, template header handling, archive + delete.
Touching: apps/resume/{app,lib,tests}, supabase/migrations/<new>, .claude/agents/resume/RULES.md
Depends on: nothing. No open branches, no claims by anyone else.

Branched from `main` at 872f3aa, after the TD's squash. The kickoff branch this session was
assigned is legacy and Joel has retired it; this branch is named for the change, cut after the
change was agreed.

## 2026-09-14 22:15 — decision that affects someone else
`resume.templates` stops being append-only. Joel asked for deletion so a duplicate upload can be
removed, and approved archive alongside it. Hard delete is refused when any render references the
template — `renders.template_id` is `not null references resume.templates(id)` with no delete
action, so history cannot be destroyed by it. My charter said "templates are never deleted"; it is
amended in this PR. **TD: that charter amendment needs ratifying.** Joel approved the behaviour;
nobody has approved the charter edit.

## 2026-09-14 22:15 — note for the TD
Not a blocker for this branch, just verified while working: both template .docx files Joel supplied
carry name, phone, email and LinkedIn in `word/header1.xml`. The newer one omits `<w:titlePg/>`, so
Word does not display that header and it reads as gone while still being in the file. Anything that
ingests a .docx and assumes "not visible" means "not present" is wrong. No fixture in this repo
contains it — every fixture I add is a synthetic rebuild.

## 2026-09-14 22:32 — handoff
Landed: template download / archive / guarded delete, drag-and-drop uploads everywhere, and three
renderer bugs found in Joel's real files — Jobright's markdown-table Career Highlights rendering
verbatim pipes, the highlights table built in the wrong shape, and a template with its name in
`header1.xml` producing a render with no type hierarchy at all (headings came out smaller than body
text). 86 tests, up from 60. Verified end to end on the real documents: one table, four cells, no
pipe syntax, coverage 100%, ATS audit clean.
Open: nothing in this branch. The ATS-checker item is still the top of my handoff and untouched.
Need from TD: **ratify the charter amendment.** `resume.templates` is no longer append-only —
Joel approved deletion for duplicate uploads, deletion is refused for any template a render points
at, and `.claude/agents/resume/RULES.md` is updated in this PR. Nobody has approved that edit.

## 2026-09-14 23:05 — for the TD: the migration history is drifted and the CLI is refusing to push

Raised because it is global, not because it blocks me — though it does block me. Joel ran the CLI
locally, since no agent holds the access token, and the findings below are his output rather than
anything I inferred from reading files.

### Verified — this is `migration list` output, not inference

Six versions match on both sides: `20260906152749`, `20260909004741`, `20260910051549`,
`20260910215015`, `20260911034533`, `20260911144519`.

**Five are remote-only:**

| Version | What it is |
|---|---|
| `20260908235234` | The withheld seed-contacts data. Correct and permanent, per `supabase/README.md`. |
| `20260911202805` | coffee, as actually applied |
| `20260911202901` | coffee, as actually applied |
| `20260912034941` | coffee, as actually applied |
| `20260912213501` | coffee, as actually applied |

**Five are local-only:**

| File | |
|---|---|
| `20260911203000_coffee_schema.sql` | same change as `20260911202805` |
| `20260911203100_grant_coffee_schema_usage.sql` | same change as `20260911202901` |
| `20260912031500_coffee_background_search.sql` | same change as `20260912034941` |
| `20260912200000_coffee_brews_shelf_and_bag_fields.sql` | same change as `20260912213501` |
| `20260914221259_resume_template_archive.sql` | mine, never applied |

So **the four coffee migrations exist twice** — once in the repo, once in the database, under
different version stamps. The repo's four are stamped at exact round minutes (20:30:00, 20:31:00,
03:15:00, 20:00:00); the database's four carry realistic clock times (20:28:05, 20:29:01, 03:49:41,
21:35:01). Round numbers are not what the CLI generates.

A dry-run push refuses, with:

```
Remote migration versions not found in local migrations directory.
```

Nothing was written. Joel has not sent the remainder of that output yet.

### The ledger's expectation for item 5 is wrong, and was already wrong when written

`_open-items.md` says to expect "eight local matching remote with `20260908235234` remote-only."
The real answer is six matching. Re-deriving it for 2026-09-11 23:45, when there were eight local
files, two of them were already the round-numbered coffee pair — so it was six then too. The drift
predates the ledger entry that was meant to describe it. Worth knowing that the expectation was
never checked against the CLI, only written down.

### Inference, labelled as such — confirm before anyone acts on it

I think that refusal is a hard stop rather than a warning, and that it fires because the remote
holds versions the local directory does not. If that is right, then **pushing migrations can never
succeed in this repo**, because `20260908235234` is deliberately and permanently remote-only.
Renaming the coffee files would not change it. That would also explain the drift without blaming
anyone: hit an unusable push, apply the SQL another way, write the repo file afterwards with a
plausible timestamp.

**I have not confirmed this.** I have one line of output and no database access. It wants checking
against the full CLI output and the CLI's own documentation before it turns into a decision. The
`/api/summary` entry under "Mistakes" is the precedent for why: verify from the source, not from a
plausible reading.

### What I have not done, and will not

- **The history-rewriting CLI subcommand is off the table.** `CLAUDE.md` forbids it and the hook
  blocks it. The CLI itself suggests it for exactly this error, with `--status reverted`; pointed at
  `20260908235234` that would erase the record of a gap chosen to keep seven real names out of this
  repo. (Writing this paragraph tripped the hook, which greps for the phrase — the guard is doing
  its job even on prose.)
- **No renaming of the coffee files.** They are shared `supabase/` history and Platform's, not
  `apps/resume`. It is probably also not the fix, per the inference above.
- **No applying my migration by hand to get unblocked.** It is thirty lines and the dashboard would
  take a minute, but doing that without recording the version reproduces this exact drift, and
  recording it by hand is the forbidden subcommand under another name. That decision is not mine to
  take quietly at the moment it is most tempting.

### What needs deciding, and it is global

1. **How does this project apply a migration at all?** If pushing is structurally unavailable there
   is no documented working path — `supabase/README.md` covers `link`, `migration list` and
   `db pull`, and never says how anything gets applied. That silence is the root cause, and it is a
   README change as much as a process one.
2. **What happens to the four duplicated coffee migrations?** The repo and the database disagree
   about the history. Whatever the answer, it should leave the record honest rather than tidy.
3. **Is `20260908235234` worth the cost now the cost is visible?** It was the right call when it was
   made and it keeps real names out of the repo. Nobody knew it might also be what makes the CLI
   unusable. That trade-off is worth reopening deliberately — not reversing on my say-so, and not
   left implicit.

### Impact on this branch

PR #56 is green, mergeable and correct. It cannot be **deployed** until this is settled: the app
selects `archived_at`, and if the code goes live before the column exists, `/api/templates` 500s and
takes the Templates tab and the Reformat template lookup with it. The PR's Deployment section now
says so, instead of describing a push that does not work.

Merging is safe. Deploying is not. Those are different events, which is the whole reason that
section exists.
