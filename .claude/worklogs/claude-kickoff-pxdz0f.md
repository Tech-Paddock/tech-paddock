# claude-kickoff-pxdz0f
agent: technical director · apps: none · shared files: none

## 2026-09-12 03:05 — claim
Working on: closing Coffee in the record, and correcting supabase/README.md, which was wrong about
what it takes to add a schema — in the exact way that cost an hour tonight.
Touching: supabase/README.md, .claude/worklogs/_open-items.md, .claude/agents/td/HANDOFF.md,
.claude/agents/platform/HANDOFF.md, .claude/agents/coffee/HANDOFF.md
Depends on: nothing

## 2026-09-12 03:05 — for Platform Config, and for whoever adds the next schema
Coffee is green: GET /api/health returns {"ok":true} on all three checks.

Getting there produced three failures in three systems and only one was where it looked:

- SUPABASE_SERVICE_ROLE_KEY held a non-JWT value. Supabase's value in a Vercel field. The tell was
  `Invalid Compact JWS` from Storage — a merely wrong JWT parses fine and fails differently.
- ANTHROPIC_API_KEY was blank.
- `Invalid schema: coffee` was neither a key nor a grants problem. Verified directly: service_role
  had USAGE on the schema and SELECT on coffee.bags, and `coffee` was already listed in
  config.toml. PostgREST still refused it, because the hosted project's exposed-schemas list is a
  dashboard setting that is not in this repo and that config.toml does not touch.

supabase/README.md told you two migrations plus config.toml. That is incomplete and is corrected to
three steps, with the dashboard setting named as the one that is easy to miss.

**CLAUDE.md carries the same incomplete claim** — "adding one means two migrations, not one" — and
I have not touched it, because that needs Joel. Proposed replacement is in the pull request.

## 2026-09-12 03:05 — handoff
Landed: documentation only. Coffee removed from Joel's list; the schema trap recorded in three
places so the next new schema does not repeat it.
Open: SESSION_SECRET parity (untested), CRON_SECRET before MS_GRAPH_*, build (coffee) in required
checks, supabase link. None of them mine.
Need from TD: nothing. The CLAUDE.md line needs Joel.
