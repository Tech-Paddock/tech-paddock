# Deployment — notes

## State

- Restored after TEC-115 retired it: the TD no longer merges. The guard recognises Deployment by
  `agent_type: "deployment"` with an `agent_id`; anything else is refused a pull request write.

## Traps

- **Starting Deployment asks the owner,** on top of typing `/deploy`. That approval is the hook's
  only way to know the owner asked.
- **Branch protection requires `gate`, `drift` and `request-line`.** A renamed job needs the ruleset
  changed first, or merges are refused.
- **CI runs on push only** (TEC-158): a pull request shows its head's push run, so `gate` runs once.
  `request-line` runs on the pull request itself.
- **Vercel aliases the build that finishes last.** After two merges to one app, confirm the newest
  commit is live.
- **Vercel calls need the team's id.** Read it with `list_teams` (slug `tech-paddock`); a guessed or
  placeholder id is refused with a 403.
- **Smoke runs on each production deployment** (`.github/workflows/smoke.yml`). Read its run for the
  merge commit with `actions_list` before calling a deploy live; `gh run view --log` is refused
  through the proxy, so read the jobs list instead.
- **Unassign a Linear issue with JSON `null`.** The strings `"null"`, `""` and `"none"` are refused.
- **Your worktree refuses a `gh` command it cannot read,** such as one with a long `--jq` filter.
  Run it plainly, or use the GitHub MCP reads.
