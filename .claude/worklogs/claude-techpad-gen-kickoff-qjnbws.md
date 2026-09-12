# claude-techpad-gen-kickoff-qjnbws
agent: TechPad Gen · apps: home · shared files: none

## 2026-09-12 00:20 — claim
Working on: re-theming the hub to a John Player Special black-and-gold livery, agreed with Joel.
Touching: `apps/home/app/globals.css`, `apps/home/app/HomeShell.tsx`, `apps/home/app/layout.tsx`.
Depends on: nothing. No open PRs, no other worklogs on any branch.

Branch naming, declared rather than hidden: `CLAUDE.md` wants a branch named for the change, and
this one is named for the kickoff. My session instructions pin me to this branch and forbid pushing
elsewhere, so I am using it. It is genuinely fresh — zero commits, no prior work, not reused — so
the rule it protects against (one branch across fifteen unrelated PRs) is not in play. Flagging it
so the next reader does not have to wonder.

## 2026-09-12 00:20 — decision that affects others
The hub's four tile colours are currently the same hexes as each tool's own Tailwind `accent`
(editor `#A6051A`, tracker `#6E7175`, resume `#00352F`, coffee `#FF8000`), duplicated by hand in
five files. Moving the hub to a gold ramp **breaks that correspondence**: a gold tile will open an
app that is still Ferrari red inside the iframe.

I am not touching the four tool apps — those are other agents' folders. So the tools keep their
current liveries and the hub no longer colour-matches them. If the intent is repo-wide old-school
F1, that is four separate changes by four agents, each needing its own agreement. Raising it here
rather than doing it quietly.

Same category: the tools' pages stay light, so selecting one puts a white iframe inside near-black
chrome. Cross-origin iframes cannot be styled by the parent, so there is no fix from the hub side.
Accepted cost of theming one app in a five-app suite, not a bug.

## 2026-09-12 00:55 — handoff
Landed: the JPS re-theme, `apps/home` only. `npx tsc --noEmit` and `npm run build` both clean, and
I rendered every state in Chromium rather than trusting the CSS.

Four bugs the theme flip exposed, all fixed here — recording them because each is the same class of
trap and the next dark-theme change in this repo will hit it again:
- `.nav-item.active` was backgrounded with `--paper`. The token name survived the flip; its meaning
  inverted. Active nav would have read as recessed.
- `.topbar-badge` was backgrounded with `--accent-ink` — still resolves, to near-black, on a
  near-black bar. An invisible badge with no error.
- `.password-field input` set no background or colour and had been inheriting the user agent's
  white-on-black by luck. A white box on a black card.
- `.topbar-badge` also carries `icon`, and `filter: grayscale(1)` desaturates the element's
  *background*, not just the glyph — so the new gold badge rendered grey. Only visible once the
  badge stopped being near-black. Caught in a screenshot, not in review.

Open: nothing in this change. The hub no longer colour-matches the tools (see the decision entry
above) — that is a deliberate, declared consequence, not an oversight.

Need from TD: nothing to unblock this. Two things to be aware of. (1) Whether the four tool apps
should follow onto old-school liveries is Joel's call and four other agents' work; I have not
touched them. (2) This cannot be verified on `techpaddock.io` while deploys are broken — the live
hub still serves `92c1ec1`, which predates `HomeShell.tsx` entirely, so production is running a
different program from `main`, not merely an older one.

## 2026-09-12 00:20 — reverting prior work, deliberately
PR #19 flipped the topbar *from* near-black *to* an accent fill. This change flips it back. That is
intentional, not a regression: the ground/accent relationship inverts when the page goes dark, and
white-on-gold measures 2.42:1 (fails WCAG AA) where gold-on-black is 8.18:1.

## 2026-09-12 01:40 — claim (second change on this branch)
Working on: an admin/diagnostics page at `/admin` in the hub. Agreed with Joel: declared-vs-reported,
hub only for now, and designed so that no new agent instruction is needed.
Touching: `apps/home/` only — `app/admin/`, `lib/platform.ts`, `lib/diagnostics.ts`,
`lib/declared.generated.ts`, `scripts/collect-declared.mjs`, `app/HomeShell.tsx`, `app/globals.css`.
Depends on: nothing.

Declared for anyone reading before I open the PR: **I am not touching any other app's folder, and
not `middleware.ts` anywhere.** The page therefore reports "unknown" for things it genuinely cannot
reach, and names what would fix each one. That list is the handoff to Platform and the TD, below.

## 2026-09-12 01:40 — what this page cannot see, and who can fix it
Recording this here because it is the useful half of the result and it is not mine to build.

The hub can prove liveness for any app by fetching its `/login`, which is public on all five. It
cannot see inside any app it has no carve-out for. Specifically:

- **`/api/health` exists only on `resume` and `coffee`**, and on both it sits behind the password
  gate with no internal-secret carve-out, so the hub gets 401. `editor`, `tracker` and `home` have
  no health route at all.
- **Fixing that needs a `middleware.ts` carve-out per app**, exactly like tracker's existing
  `/api/summary` one. `middleware.ts` is auth plumbing — the TD's, not mine, and not any app
  agent's to do unilaterally.
- **`SESSION_SECRET` consistency across the five projects cannot be checked by any page**, and
  should not be: nothing may echo it. The only safe signal is behavioural — log in on the hub, then
  open a tool without being asked again. Worth stating because it is item 2 on the TD's list and a
  dashboard will never answer it.

Correction for the TD while I am here: `CLAUDE.md` says `middleware.ts` is byte-identical in five
apps. It is not — there are three distinct versions, because `editor` and `tracker` carry
deliberate carve-outs. `lib/auth.ts` and `lib/password.ts` are genuinely identical; I verified all
three by checksum. The rule is still right; its stated reason is out of date.

## 2026-09-12 18:20 — handoff, and what I need from the TD
Landed: `/admin` (`9bd079e`), on top of the JPS re-theme (`417dbdc`). Both unmerged, no PR yet.
`tsc --noEmit` and `next build` clean; rendered at desktop and 390px.

**The full scoping note is in `.claude/agents/techpad-gen/HANDOFF.md`** — Joel asked for it there so
he can work through it with the TD. Summarised here because this is the channel the ledger says to
use, and because three items need someone other than me.

Need from TD — decisions:

1. **Whether `/admin` becomes the pit wall.** If it renders agent notes, the source should be the
   files agents already keep (`_open-items.md`, the `HANDOFF.md`s, live worklogs) rather than a new
   place to type. Three sub-decisions in the handoff: note latency, note lifetime, markdown
   rendering.
2. **The one that is genuinely Joel's, not the TD's:** showing notes from *unmerged* branches means
   the hub reading the GitHub API at request time, which would put a read-only token in the hub —
   **the first key it has ever held**, and a direct exception to a property `RULES.md` says to
   protect. I have not built toward it in either direction.
3. **Whether a sixth app is created for this.** My recommendation in the handoff is no: `/admin` is
   already a route in `apps/home` and needs no Vercel project, no DNS record and no new variable. A
   sixth app would add a sixth copy of the auth plumbing and a CI-matrix entry, and would still not
   be reachable when the platform is down, because it shares the account and the gate.

Need from TD — work that is not mine:

4. **A middleware carve-out for `/api/health` per app.** Shared auth plumbing, so the TD's. Until it
   exists the admin page reports unknown for every tool's database and keys, which is most of what
   an admin page is for.
5. **`/api/health` in `editor`, `tracker` and `home`** — one change per app agent, pattern already
   exists at `apps/coffee/app/api/health/route.ts`.
6. **A public `/api/version` per app** returning the deployed commit SHA. Highest value item on the
   list: it would have made the deployment outage visible in seconds. Needs a decision on whether it
   is public or behind the internal secret.

For the ledger (not editing it, as instructed):

7. `CLAUDE.md`'s claim that `middleware.ts` is byte-identical across five apps is **false** — three
   distinct versions, because `editor` and `tracker` carry deliberate carve-outs. `lib/auth.ts` and
   `lib/password.ts` are genuinely identical. Checksummed all three.
8. **"Verify `SESSION_SECRET` on all five projects" can never be closed by a page.** Nothing may echo
   it. The only safe check is behavioural. Worth rewording so it stops reading as a pending task a
   dashboard will one day answer.

Open, not started: the mobile login bug (both cheap explanations now ruled out — see handoff), no
`test` script in `apps/home`, and the deferred Pit Wall type pass.

## 2026-09-12 21:20 — Joel approved the scoping list; here it is scoped
Joel said yes to the whole "For Joel to take to the technical director" section of
`.claude/agents/techpad-gen/HANDOFF.md`. Breaking it into requests the TD can act on or hand out.

Put here rather than only in the handoff because `read-all.sh` reads worklogs from unmerged
branches, so this reaches the next session without waiting for #43 to merge. The handoff carries the
same list marked approved, for after it lands.

**None of this is mine to build.** Each item names whose it is.

### Request 1 — TD: a `/api/health` carve-out in four apps
`middleware.ts`, so the TD's. Pattern already exists and is reviewed: tracker's `/api/summary`
bypass. Exact-path match, `x-internal-secret` header, fails closed.

| app | has `/api/health` | needs carve-out |
|---|---|---|
| editor | no | yes |
| tracker | no | yes |
| resume | **yes** | yes |
| coffee | **yes** | yes |

`resume` and `coffee` need *only* the carve-out — the routes are already written and are currently
unreachable from the hub, returning 401. That makes them the cheapest two to do first and the
cheapest proof the mechanism works end to end.

`home` needs neither: the hub reports on itself without a network call, deliberately.

Worth doing as one change per app rather than one change across four, so each carve-out is reviewed
on its own. This is the file where a bad edit publishes an endpoint rather than breaking a login —
#47's wording, and the reason it is gated.

### Request 2 — editor and tracker agents: a `/api/health` route
Pattern: `apps/coffee/app/api/health/route.ts`. Each app reports on its own dependencies; the hub
only aggregates. Nothing for the hub to change — `/admin` already renders whatever comes back and
currently shows these as unknown with the reason.

### Request 3 — a public `/api/version` per app
The highest-value item on the list, and today is the evidence: four documents each asserted a
different production commit and nothing in the repo could settle it. Vercel exposes
`VERCEL_GIT_COMMIT_SHA` to an app but never to a sibling, so no page can show deploy drift without
this.

One line per app. **Decision needed: public, or behind the internal secret.** Recommendation:
public. It exposes a commit hash of a private repo and nothing else, and public is what lets an
external monitor notice an outage — which is the actual use case, since `/api/health` sits behind
the password gate where no monitor can reach it.

### Request 4 — whether `/admin` becomes the pit wall
Approved in principle. Three things still to settle before anyone builds it, all in the handoff:
latency (a note on a branch is invisible until merged and deployed), lifetime (a worklog dies with
its branch, so durable notes belong in a `HANDOFF.md`), and rendering (markdown would be the hub's
first dependency added purely to display something).

**One part of this is NOT covered by Joel's yes and I am not treating it as approved.** Showing
notes from unmerged branches means the hub reading the GitHub API at request time, which puts a
read-only token in the hub — the first key it has ever held, and a direct exception to a property
`RULES.md` tells me to protect. That needs Joel saying it specifically. Until he does, the
buildable version is the one that renders `main` only and accepts the latency.

### Not in the list, but noted
#50 was closed unmerged at 21:08, so the draft rule and its four enforcement mechanisms did not
land. Joel has separately told the TD he wants agents to commit but never open pull requests, with
him opening them. If that supersedes #50 it changes the end of every agent's workflow, so it is
worth the TD writing down which of the two is in force before the next change is built.
