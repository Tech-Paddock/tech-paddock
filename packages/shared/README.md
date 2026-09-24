# packages/shared

**The canonical copy of every file that has to be identical in all seven apps.** Edit it here, then:

```
node scripts/stamp-shared.mjs          # write the copies
node scripts/stamp-shared.mjs --check  # verify them, write nothing
```

`drift` fails a copy that disagrees, and CI runs `drift`, so a forgotten stamp is caught at the gate
rather than in production.

---

## What is here, and what is deliberately not

| File | Lands at | Why it is shared |
|---|---|---|
| `lib/auth.ts` | `apps/<app>/lib/auth.ts` | The session cookie, the advisory attempts counter and `safeEqual`. A mismatch does not throw — it silently rejects valid sessions on every other app. |
| `lib/password.ts` | `apps/<app>/lib/password.ts` | The bcrypt wrapper. Node-only; never import it from `middleware.ts`. |
| `lib/login.ts` | `apps/<app>/lib/login.ts` | The handler behind every app's `POST /api/login`, which each `app/api/login/route.ts` re-exports. Node-only, like `password.ts`. |
| `lib/safe-redirect.ts` | `apps/<app>/lib/safe-redirect.ts` | Where a successful login may send you. Pure; the login pages are client components and import it in the browser. |
| `lib/theme.css` | `apps/<app>/lib/theme.css` | The token system. Drift here is loud — one app looking wrong beside another in an iframe. |
| `lib/theme.ts` | `apps/<app>/lib/theme.ts` | The other half of the theme, and **the file that could drift silently** until this landed. |
| `next.config.mjs` | `apps/<app>/next.config.mjs` | The security headers, including `frame-ancestors`. A missing header changes nothing anybody can see. |
| `app/ThemeControl.tsx` | `apps/<app>/app/ThemeControl.tsx` | The light/dark switch, and the message that carries it into the hub's frames. |

### Why the login path is stamped too

The login handler and the redirect rule were hand-copied into every app until 2026-09-24, in three
slightly different versions of the route and six of the page. The page's `router.push(from)` was
an open redirect in all seven, and worse, since Next hands a `javascript:` URL to `location.assign`.
Fixing that meant seven edits, and a fix applied to six of them is a hole that looks closed. They
are half of the password gate, so they get the same treatment as the other half: one canonical
file, and `drift` failing a copy that disagrees.

**The login pages themselves are not stamped** — each is styled for its own app, and the styling
is TechPad Gen's. The logic they share is these two files; the pages only call them. The editor's
route wraps the handler rather than re-exporting it, because a successful login is also when it
runs its model check.

**`lib/supabase.ts` is not here and must not be.** It is a genuinely different file in each app, and `apps/home`
has none at all — the hub holds no database credential, which is a property worth protecting rather
than a gap to fill.

**`middleware.ts` is not here and must not be.** It is three deliberate variants: a base copy, plus
`editor`'s scoped `/api/draft` bypass and `tracker`'s `/api/summary` bypass and its `/api/cron/*`
bearer check. `drift`
measures that shape directly, and a fourth variant fails it on purpose — that is a fourth version of
the password gate. Collapsing it to one file here would talk past that check while looking tidy.

## Why copies rather than imports

Because there is no root `package.json`, and there is deliberately not going to be one. Each app is
its own npm project, reached by its own Vercel project through that project's Root Directory, and
**the CI matrix is derived from the folders on disk**. A workspace install at the root would buy one
real `import` and cost the per-app independence all three of those rest on.

So the duplication stays. What changed is that it stopped being **one edit per app** — it is one edit
and a command, and a check that fails when somebody forgets the command.

## The banner is the load-bearing half

Every stamped copy opens with three lines naming this directory and the command. A check that fails
in CI teaches an agent not to edit a copy *after* they have already edited it; the banner teaches
them before. **It is added at stamp time and is not in the canonical file**, which is why
`--check` compares each copy against banner + canonical rather than canonical alone.

## Adding a file

Only if it is byte-identical in every app today — measure, do not assume — or, like the login path,
if its copies differing is itself the bug. Add a row to `MANIFEST` in
`scripts/stamp-shared.mjs`, move the canonical copy here, run the stamp, and run `drift`. Every file
in the manifest is `.ts`, `.tsx`, `.css` or `.mjs` and shares one block-comment syntax; a file type
that does not would need a case added to `banner()` rather than silently stamping a syntax error into
every app at once.

**Every app already watches `packages` in its `ignoreCommand`**, so a change here correctly rebuilds
all seven — which is the right answer, because a shared auth file does affect all seven.
