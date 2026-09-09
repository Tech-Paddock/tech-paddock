# Paddock — Home

The `techpaddock.io` root — a minimal landing page with a menu linking out to the other tools.
No auth, no database: just static links, since there's nothing here worth protecting.

Part of [Paddock](../../CLAUDE.md) — see that file for the full system architecture and the
other tools (Message Editor, Pipeline Tracker, Resume Formatter).

## Local setup

```bash
npm install
npm run dev
```

No environment variables needed.

## What's built

- Single static page listing all three tools, linking to whichever are actually live
  (currently just Message Editor) and marking the rest "coming soon"

## Not yet built

- Not deployed — needs its own Vercel project (Root Directory `apps/home`) pointed at the
  bare `techpaddock.io` domain (not a subdomain)
- Links are hardcoded — update `app/page.tsx` as Pipeline Tracker and Resume Formatter go live
