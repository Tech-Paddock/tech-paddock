# Worklogs

One file per agent, named for its branch with slashes flattened. The branch
`claude/coffee-brewing-assistant-hmvffw` writes to
`.claude/worklogs/claude-coffee-brewing-assistant-hmvffw.md`.

One file per agent is the whole trick: two agents never write the same path, so these can never
conflict with each other the way `CLAUDE.md` has.

**Read all of them before starting work:** `bash .claude/worklogs/read-all.sh`

## What goes in one

Not a second commit message. Commits in this repo already explain what was done and why, at length.
A worklog carries only what a commit cannot:

- what you are working on **right now**, before it is finished
- what you are blocked on
- a decision you made that affects somebody else's work
- what you need from the technical director

If an entry could have been a commit message, make it a commit message.

## Format

```markdown
# <branch-slug>
agent: <session name> · apps: <which> · shared files: <which, or none>

## <YYYY-MM-DD HH:MM> — claim
Working on: one line
Touching: paths
Depends on: a branch or PR, or nothing

## <YYYY-MM-DD HH:MM> — handoff
Landed: one line
Open: what is unfinished
Need from TD: a question, a decision, or nothing
```

Claim at the start of a session, hand off at the end. Add entries in between when something
changes that another agent would want to know before it reaches a pull request.

## Files that are not agent worklogs

- `_open-items.md` — the technical director's ledger. Read it; do not edit it.
- `read-all.sh` — the reader. Read it; do not edit it without the TD.
