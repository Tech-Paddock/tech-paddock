# Standing up a new agent

**Ad-hoc on purpose.** This runs maybe twice a year, so it is a protocol to read and execute, not
automation to maintain. The technical director opens this file the moment Joel says he wants a new
agent, and works it top to bottom.

It is a document rather than a script because the steps that can actually hurt are the ones outside
the repo — a Vercel project, a DNS record, a dashboard setting — and none of them has an undo.

---

## First, the two things only Joel decides

1. **The name.** It fixes three things at once: the folder `apps/<name>`, the subdomain, and the
   Vercel project. Changing it later means touching DNS, so settle it before any folder exists.
2. **Does it need its own Postgres schema?** If yes, that is **two migrations and one dashboard
   setting** — read `supabase/README.md` before writing either. A new schema inherits no grants at
   all, and the failure looks like a credentials problem.

## What is already automatic — do not build these

- **The CI matrix** derives the roster from `apps/` at run time. Create the folder and it builds.
- **Branch protection** requires one fixed name, `gate`. Nothing to add per app, ever.
- **The Garage** reads `apps/` at build time, so the new app appears in Declared on its own.

Adding the folder is enough to be built, measured and reported. That is the whole of the rails.

## In the repo

1. **`.claude/agents/<agent>/RULES.md` and `HANDOFF.md`.** The charter is the specification for the
   work, and **Joel approves it before the agent runs under it.** An empty handoff is correct on day
   one — say the area does not exist yet.
2. **A kickoff block in `.claude/agents/KICKOFF.md`**, after the common block. Nothing loads a
   charter; the kickoff is what makes the agent open it.
3. **Two rows in `CLAUDE.md`** — the *Who you are* table and the domain map. **That is a `CLAUDE.md`
   edit, so Joel approves it**, in the same pull request as the rest.
4. **The app folder**, copied from the nearest existing app. Three files are copied **verbatim** —
   `lib/auth.ts`, `lib/password.ts`, `lib/theme.css`. `middleware.ts` takes the **base** copy unless
   there is a reviewed reason not to: a fourth variant fails `drift` deliberately, because that is a
   fourth version of the password gate.
5. **`.env.example`** — variable names and how to generate them, never a value.
6. **`/api/health`.** Add `/api/summary` only if the tool belongs on the hub's glance; then it needs
   a line in `SOURCES` in `apps/home/lib/glance.ts`, which is **TechPad Gen's file** — a ledger row,
   not an edit you make.
7. **Fix the roster counts in prose.** `grep -rni '\b(five|six|seven)\b' CLAUDE.md README.md .claude/`
   — every one of them is true right up until this day, and this is the day. Prefer removing the
   count to incrementing it; the next standup should find nothing here. `drift` does not catch all
   of them.

## Outside the repo — Joel's, and there is no undo

8. **The Vercel project**, with Root Directory set to `apps/<name>`.
9. **Its environment variables.** `SESSION_SECRET` **byte-identical** to the others or the shared
   cookie silently stops working on every app, which reads as a login bug.
10. **The DNS record**, a CNAME like the rest.
11. **The exposed-schemas list in the Supabase dashboard**, if step 2 said yes. It is not in this
    repo and it is the step that gets missed.
12. **Redeploy.** Vercel bakes the environment in at build time, so a variable set after a build is
    not in the running deployment.

## Then verify, rather than assume

- `node scripts/drift-check.mjs` — the new agent should appear under freshness, the new app should
  be owned, and the middleware check should still be `ok`.
- `/admin` — the app shows in Declared, and Reported once it is deployed.
- Open the subdomain in a private window and confirm it asks for the password.

Finish by putting the new agent on the ledger with whatever it is waiting for, and give Joel the
kickoff block to paste.
