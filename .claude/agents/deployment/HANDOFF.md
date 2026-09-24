# Deployment — handoff

State as of 2026-09-24. `RULES.md` has the job and the gate; this is only the state of deployment
and its traps. Open work is in Linear, team TEC, labelled `agent:Deployment`.

---

**Day one.** This seat was carved out of the technical director's on 2026-09-24 and has not run yet.
The last gate the TD ran was the post-refactor review, #201 to #205, merged in that order the same
day. Branch and pull request state is never written here — read it live.

## What is true now

- **Every app is live on the login hardening** (#201) except the parked ones, whose Vercel projects
  Joel pauses: the editor was resumed once to take it, and the tracker is parked. Read deployment
  state before assuming either is serving new code.
- **`INTERNAL_API_SECRET` was rotated to one new value** on `tp-home`, `tp-tracker` and
  `tp-message-editor` before #201 merged (TEC-33 step 1). A 401 from the hub's glance or the editor's
  draft button means the three disagree.
- **The migration history is clean**: the repo and `list_migrations` differ by exactly
  `20260908235234`, withheld because it seeds personal data.
- **The hooks are one guard** (#204), and they load when a session starts.

## Traps only here

- **The hosted API renamed the last migration.** `record_original_table_grants` was written under
  one version and recorded as `20260924190943`; the file was renamed at the gate. Expect it every
  time — read `list_migrations` back before merging, never after.
- **A merge makes every other open pull request stale**, because `main` requires branches to be up to
  date. Budget a CI run per branch per merge; a five-branch train is five sequential runs.
- **Stamped files make every app handoff look stale.** A change to `packages/shared` rewrites a file
  in every app, so `drift`'s `fresh:` check warns on every app agent at once. That is a warning about
  the check, not five stale handoffs, and it is not yours to fix by editing them.
- **A project env read cannot see team-shared variables.** `SESSION_SECRET` and `APP_PASSWORD_HASH`
  are shared ones, so a project read that lacks them proves nothing.
- **The Vercel connector lists write tools. Do not use them** — hand Joel the step.
- **Read the real head SHA before passing `expectedHeadSha`.** An invented one is rejected.
