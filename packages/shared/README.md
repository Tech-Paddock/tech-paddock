# packages/shared

The canonical copy of every file that must be identical in every app. Edit it here, then:

```
node scripts/stamp-shared.mjs          # write the copies
node scripts/stamp-shared.mjs --check  # verify, write nothing
```

`drift` fails a copy that disagrees, and CI runs `drift`.

## Files

| File | Why it is shared |
|---|---|
| `lib/auth.ts` | Session cookie, advisory attempts counter, `safeEqual`. A mismatch silently rejects valid sessions elsewhere. |
| `lib/password.ts` | bcrypt wrapper. Node-only; never import it from the gate file. |
| `lib/login.ts` | Handler behind every `POST /api/login` (re-exported by each route). Node-only. |
| `lib/logout.ts` | Handler behind every `POST /api/logout`. Clears the domain-wide cookie, so it logs out of every app. |
| `lib/safe-redirect.ts` | Where a successful login may redirect. Pure; imported by client login pages. |
| `lib/theme.css` | The token system. |
| `lib/theme.ts` | The other half of the theme; drifts silently if unstamped. |
| `next.config.mjs` | Security headers, including `frame-ancestors`. |
| `app/ThemeControl.tsx` | Light/dark switch and the message that carries it into the hub's frames. |
| `app/LogoutControl.tsx` | The header's Log out; reports a failure. |

Each copy lands at the same path under `apps/<app>/`. The login path is stamped because a fix
applied to some copies of the password gate is a hole that looks closed.

## Not shared, deliberately

- **Login pages:** styled per app. They call `login.ts` and `safe-redirect.ts`.
- **`lib/supabase.ts`:** differs per app; `apps/home` has none and must stay credential-free.
- **The gate file** (`proxy.ts` on Next 16): shared auth plumbing, one version in every app.
  `drift` fails a second version.

## Why copies, not imports

There is no root `package.json`, by design: each app is its own npm project and Vercel Root
Directory, and the CI matrix derives from the folders. Copies keep that independence at the cost of
one command.

## The banner

`stamp-shared` adds a three-line banner to each copy naming this directory and the command. It is
not in the canonical file, so `--check` compares each copy against banner + canonical.

## Adding a file

Only if it is byte-identical in every app today (measure it), or if its copies differing is the bug.
Add a row to `MANIFEST` in `scripts/stamp-shared.mjs`, move the canonical copy here, stamp, run
`drift`. Manifest files are `.ts`, `.tsx`, `.css` or `.mjs`; another type needs a case in `banner()`.

Every app's `ignoreCommand` watches `packages`, so a change here rebuilds every app.
