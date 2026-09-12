# claude-coffee-install-on-ios
agent: Coffee · apps: apps/coffee · shared files: none

## 2026-09-12 03:50 — claim
Working on: make Coffee installable on the iPhone home screen
Touching: apps/coffee/app/{layout.tsx,globals.css,apple-touch-icon.png,favicon.ico}, apps/coffee/README.md, .claude/agents/coffee/RULES.md
Depends on: nothing — cut from main, independent of the two open Coffee PRs (#39, #40)

## 2026-09-12 03:52 — decision another agent needs
**iOS only, and that is a boundary rather than a shortcut.** A web app manifest would make this
work on Android too, but a manifest is fetched without credentials: the password gate returns the
login redirect, and the install silently never offers itself. Allowing it through means adding
paths to the allowlist in `middleware.ts` — byte-identical in five apps, and not mine.

**If every tool should be installable, this pattern is TechPad Gen's**, not Coffee's. I have set it
up in a way that generalises (nothing here is Coffee-specific except the icon) but I have not
generalised it, and I have not touched a shared file.

The icon is a static import on purpose. Next's `app/apple-icon.png` convention serves from a gated
route; iOS would get the login redirect and use a screenshot of the page as the home screen icon.
`/_next/static` is the one prefix the middleware matcher excludes, and a static import lands there.

## 2026-09-12 03:52 — handoff
Landed: apple-touch-icon, the apple-mobile-web-app tags, safe-area insets for the notch and home
indicator, and a favicon (the app had been serving a 404 for `/favicon.ico`). Verified against the
built HTML rather than assumed — the icon resolves to `/_next/static/media/`.
Open: not verified on a real iPhone. Everything here is checkable from the build output except
whether iOS actually takes the icon, which needs a deploy and a phone.
Need from TD: a view on whether installability should become a project-wide pattern.
