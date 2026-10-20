# Deployment — notes

## State

- Restored after TEC-115 retired it: the TD no longer merges. The guard recognises Deployment by
  `agent_type: "deployment"` with an `agent_id`; anything else is refused a pull request write.

## Traps

- **Starting Deployment asks the owner,** on top of typing `/deploy`. That approval is the hook's
  only way to know the owner asked.
- **Branch protection requires `gate`, `drift` and `request-line`.** A renamed job needs the ruleset
  changed first, or merges are refused.
- **A push with a pull request open runs `gate` twice;** merge is refused until the second passes.
- **Vercel aliases the build that finishes last.** After two merges to one app, confirm the newest
  commit is live.
