# Spec — the Pit Wall

**Author:** technical director · **Builder:** TechPad Gen · **Status:** agreed with Joel 2026-09-15,
not started. **Prototype:** https://claude.ai/artifact/4kQTnxzKTHTMHJDjppZDpM

The prototype is the design. Its two JavaScript arrays are the data contract below, and its filters
work — open it before reading further.

---

## The one job

**"What needs me, right now, with several agents out."**

Not a report. Not a dashboard of everything knowable. Joel runs multiple agent sessions at once and
cannot see any of them; tonight two agents worked for an hour and he learned about it when the merge
commits appeared. The page exists to close that gap, and every design argument below resolves toward
that sentence.

It replaces a thing that already happened by hand: on 2026-09-14 he had seven open items, could not
see them, and the TD assembled them into a one-off page and read them out. **That is the product.**

## Where it lives

- `/` — the hub landing — becomes **Pit Wall**, and carries this page.
- `/admin` becomes **The Garage**, unchanged in function: declared versus reported, the machinery.

**Labels only.** Not folder renames. `apps/home` stays `apps/home`; renaming the folder would drag
in the Vercel Root Directory, the CI matrix and the domain map, and that is its own change on its own
day.

**The rename ships with the page, not before it.** A nav item reading "Pit Wall" above four app tiles
is a label promising something the page does not do — the confidently-wrong-document failure rendered
in UI. The name arrives when the thing does.

## Layout

Three parts, in this order:

1. **Agent strip** — one tile per agent, across the top. Name, a liveness dot, time since last seen.
   Clicking a tile filters the board to that agent.
2. **The board** — one ranked list, ordered by *who is blocked*: `BOX` (needs Joel) → `AGENT` (needs
   an agent) → `CLEAR` (true, no action). **Ordered by state first, not by recency.** An old blocker
   deserves more prominence than a new one, not less.
3. **Feed** — reverse chronological, behind a tab. Recency is a poor proxy for urgency, so it does
   not compete for the top of the page.

Filters across state, agent and source, applying to both board and feed.

## Data contract

```ts
type Source = "github" | "vercel" | "repo" | "worklog" | "supabase";

type Item = {
  state:  "box" | "agent" | "clear";   // who is blocked — the sort key
  source: Source;                      // where this was read from. never optional
  agent:  AgentId | null;              // null = belongs to the platform, not a person
  title:  string;                      // one line, no trailing period
  detail: string;                      // one sentence of why it matters
  ref:    string;                      // "#56", a file, a migration version, or "—"
  at:     string;                      // ISO 8601. the UI renders the age, never the raw stamp
};

type Event = {
  at:     string;                      // ISO 8601
  kind:   "good" | "note" | "bad";
  source: Source;
  agent:  AgentId | null;
  title:  string;
  detail?: string;                     // an agent's own words, quoted, never paraphrased
};
```

**`source` is mandatory on every row and is rendered on every row.** That is not decoration. It is
what makes a claim auditable: a reader can tell at a glance whether "the migration is applied" came
from the database or from a document that says so.

## The five sources, and what each is allowed to answer

| Source | Answers | Phase |
|---|---|---|
| `github` | merges, open pull requests, branches ahead of `main`, CI results | 1 |
| `vercel` | deployment failures and app liveness | 1 |
| `repo` | the TD ledger's open items, handoffs | 1 |
| `worklog` | what an agent wrote about its own work, as prose | 1 |
| `supabase` | what an agent is doing **right now**, and errors hit mid-session | 2 |

**The division that matters.** The first four describe what has *landed* or what is *written down*.
Only `supabase` can describe what is *happening*, because the repo structurally cannot: it knows
only what has been committed **and pushed**. An agent forty minutes into a task has produced nothing
any of the first four can see.

**Deployment errors only, for now.** Runtime error capture is a logging feature wearing a pit wall's
clothes and is explicitly out of scope.

## Rules the page must obey

1. **Never claim more than the source supports.** `/admin` already sets this standard — *"anything
   that cannot be reached says so rather than guessing."* An unreachable source renders as `unknown`
   with the reason, never as zero and never as absent.
2. **Say how old the data is, always.** A visible as-of stamp. Cached data is never presented as
   live.
3. **Read-only.** No writes, no ticking items off, no leaving notes. This is deliberate and it is
   architectural, not laziness: **the repo is the only channel between agents.** Anything captured
   here that an agent needs would have to reach the repo, which means a commit path from a web app —
   a far larger change than it looks, and one that would quietly create a second source of truth.
4. **Never duplicate what GitHub already shows.** The value is agent prose sitting next to machine
   status. "tp-tracker is green" is on Vercel already; "tracker's handoff says `CRON_SECRET` is
   parked and un-parking it in the wrong order publishes an endpoint" exists nowhere but this repo.
   The combination is the whole product.
5. **Worklogs stay prose.** Joel's call, 2026-09-15. Render them; do not parse them into fields and
   do not ask agents to write Markdown for a machine. The parser stays deliberately dumb — surface
   sections, never interpret them — so the format never becomes a contract that constrains every
   agent.

## Phase one — no schema, no new write path

Everything except `supabase` rows. Three read-only integrations and the repo.

- Server-side only. **No token ever reaches the browser**, per the shared-foundation rule; the page
  is already a server component and must stay one.
- **Cache each source for 60 seconds**, keyed per source. **Refresh forces revalidation** — a
  refresh button that returns cached data is a lie with a spinner on it.
- A failing source degrades that section to `unknown` and leaves the rest of the page working. One
  dead API must not blank the wall.

### Environment variables — Joel's manual lift

Both on `tp-home`, and **a dashboard change does not reach a running deployment**: Vercel bakes the
environment in at build time, so set them, then redeploy, then verify.

| Name | What it needs |
|---|---|
| `GITHUB_TOKEN` | fine-grained, this repo only, read-only: Contents, Metadata, Pull requests, Actions |
| `VERCEL_TOKEN` | read-only, scoped to the `tech-paddock` team |

Neither exists today. Until both are set the page should render, with those sections `unknown` and
saying why — which is also how it gets built before the tokens arrive.

## Phase two — telemetry

A Supabase table agents write to, in a new `paddock` schema. **Remember that a new schema inherits no
grants at all**, so this is two migrations, not one — see `supabase/README.md`.

Sketch, not final:

```sql
create table paddock.telemetry (
  id          uuid primary key default gen_random_uuid(),
  agent       text not null,
  kind        text not null,          -- started | heartbeat | pushed | error | note
  detail      text,
  at          timestamptz not null default now()
);
```

**The rule that stops it becoming a second source of truth: this table holds telemetry, never
record.** "Coffee reported an error at 02:14" belongs here. "The migration is applied" never does —
that lives in the repo and the database's own migration history. **If a row here is ever the only
place something is true, the mistake has been made.**

Open and genuinely undecided: **how agents write to it.**

- *Supabase MCP from the agent session* — preferred, but there is no `.mcp.json` in the repo, so
  access is account-level and **must be confirmed rather than assumed.**
- *A hub API route with a shared secret* — **avoid.** It needs a `middleware.ts` carve-out, which is
  the `/api/cron/*` shape that already fails **open** in tracker when its secret is unset.
- *A CI job mirroring pushes* — fires only on push, so it cannot see in-flight work, which is the
  entire point.

**Phase two is not a rescue for phase one.** If the board is not useful without telemetry, telemetry
will not save it.

## Open questions for TechPad Gen

1. The strip's "last seen" has no source until phase two. Render the tile with the field blank, or
   hide the strip entirely until it can be filled? **Blank with an explicit `—` is the house style**,
   but it is your page.
2. Does the board belong on `/` above the app tiles, or does it replace them, with the tiles moving
   into the sidebar you already built?
3. The theme is yours now — the prototype uses your tokens, but the severity treatment (a red wash on
   `BOX` rows) is new and is a theme decision, not mine to make.

## Deployment

- **What happens by itself on merge:** Vercel rebuilds and redeploys `tp-home`. With per-app CI
  scoping in place, only `build (home)` does real work.
- **What a human has to do, in order:** set `GITHUB_TOKEN` and `VERCEL_TOKEN` on `tp-home`, then
  **redeploy** — the variables are not live until a build picks them up.
- **How to verify it is genuinely live:** open `techpaddock.io`, confirm the nav reads **Pit Wall**
  and **The Garage**, and that the board shows real rows rather than `unknown` for GitHub and Vercel.
  A section still reading `unknown` after the redeploy means the token is missing or wrongly scoped,
  and the page should say which.
- **What breaks if the steps are skipped:** nothing breaks. The page degrades to the repo-sourced
  rows and states plainly that the other sources are unreachable.
