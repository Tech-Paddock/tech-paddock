# packages/shared

**The canonical copy of every file that has to be identical in all six apps.** Edit it here, then:

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
| `lib/auth.ts` | `apps/<app>/lib/auth.ts` | The session cookie. A mismatch does not throw — it silently rejects valid sessions on the other five. |
| `lib/password.ts` | `apps/<app>/lib/password.ts` | The bcrypt wrapper. Node-only; never import it from `middleware.ts`. |
| `lib/theme.css` | `apps/<app>/lib/theme.css` | The token system. Drift here is loud — one app looking wrong beside another in an iframe. |
| `lib/theme.ts` | `apps/<app>/lib/theme.ts` | The other half of the theme, and **the file that could drift silently** until this landed. |
| `next.config.mjs` | `apps/<app>/next.config.mjs` | The security headers, including `frame-ancestors`. A missing header changes nothing anybody can see. |

**`lib/supabase.ts` is not here and must not be.** It is five genuinely different files, and `apps/home`
has none at all — the hub holds no database credential, which is a property worth protecting rather
than a gap to fill.

**`middleware.ts` is not here and must not be.** It is three deliberate variants: a base copy, plus
`editor`'s scoped `/api/draft` bypass and `tracker`'s `/api/summary` and `/api/cron/*`. `drift`
measures that shape directly, and a fourth variant fails it on purpose — that is a fourth version of
the password gate. Collapsing it to one file here would talk past that check while looking tidy.

## Why copies rather than imports

Because there is no root `package.json`, and there is deliberately not going to be one. Each app is
its own npm project, reached by its own Vercel project through that project's Root Directory, and
**the CI matrix is derived from the folders on disk**. A workspace install at the root would buy one
real `import` and cost the per-app independence all three of those rest on.

So the duplication stays. What changed is that it stopped being **six edits** — it is one edit and a
command, and a check that fails when somebody forgets the command.

## The banner is the load-bearing half

Every stamped copy opens with three lines naming this directory and the command. A check that fails
in CI teaches an agent not to edit a copy *after* they have already edited it; the banner teaches
them before. **It is added at stamp time and is not in the canonical file**, which is why
`--check` compares each copy against banner + canonical rather than canonical alone.

## Adding a file

Only if it is byte-identical in every app today — measure, do not assume. Add a row to `MANIFEST` in
`scripts/stamp-shared.mjs`, move the canonical copy here, run the stamp, and run `drift`. Every file
in the manifest is `.ts`, `.css` or `.mjs` and shares one block-comment syntax; a file type that does
not would need a case added to `banner()` rather than silently stamping a syntax error into six apps
at once.

**Every app already watches `packages` in its `ignoreCommand`**, so a change here correctly rebuilds
all six — which is the right answer, because a shared auth file does affect all six.
