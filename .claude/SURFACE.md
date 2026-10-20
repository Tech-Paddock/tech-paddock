# Surface — site or app

Surface is a tool's shell: whether it has an index, how you arrive, and whether it earns a
home-screen icon. It is not the theme (palette, tokens, type, components), which lives in
`apps/home`. Surface is architecture and the TD's call; the owner can overrule it.

Read this before designing a screen or settling a new app's surface (the `new-app` skill).

- **Site:** a thin index grouped by verb, wrapping one long page.
- **App:** one screen, thumb-first, no index.

## The test

Ask in order. When the answers disagree, the first wins.

1. **How often, and from where?** Many times a day, phone in hand, mid-task → app. A few times a
   week, sitting down → site.
2. **Do you arrive knowing what to do?** One decided thing → app. Looking at what is there → site.
3. **Would it go on the home screen?** If not, it is not an app.

A tool that fits neither is designed with the owner before scaffolding, and the answer goes in its
draft `RULES.md`. A tool that seems to be both may be two tools.

**Count how often it is opened and in what state of mind, never its routes.** Coffee, Resume
Formatter and Message Editor each have one route; only Coffee is an app.

## App rules

- **One screen.** A second screen needs a written reason and the owner's approval. The bar: the same
  nouns one step earlier or later, not new territory.
- **No index, no tabs.** Secondary views are a quiet footer link.
- **Thumb-first.** The primary action sits in the reachable half; assume one hand.
- **Opens in its working state,** not a menu.
- **Home-screen install is part of the design.** On iOS it is done from Safari.

## Site rules

- **A thin index grouped by verb,** not entity. It may be a tab bar when each tab is a verb and one
  long page (Cookbook: Recipes · Add · King Soopers list).
- **One long page over many routes.**
- **Works on a phone,** but is not designed around one-handed use.
- **No home-screen install by default.** The owner can grant one; the site's shape does not change.

## Diagnostic routes

`/admin` and `/debug` never appear in an index, tab bar or footer, and do not count toward the
one-screen rule. Exception: The Garage is a tab on home beside the Pit Wall; `/admin` redirects to it.

## The hub

`apps/home` is the index of tools, embedding each in an iframe. It is neither site nor app, and
there is exactly one. A tool that seems to need a hub is a site whose index does too much.

## Roster

| Tool | Surface | Why |
|---|---|---|
| Coffee | App | At the grinder, several times a day, one decided thing. Installed. |
| Health | App | Just ate, phone in hand: log it and close. |
| Resume Formatter | Site | Occasional, sitting down, to see what is there. |
| Cookbook | Site | A collection to browse; tabs are the verb index. Installable (TEC-102); app is TEC-109. |
| Pipeline Tracker | Site | Surveying a pipeline. Parked. |
| Message Editor | Site | Unhurried, desk-bound composing. Parked. |
| Showcase | Site | Opened once by a visitor. Public; rules in the TD's `RULES.md`. |
| Hub | Neither | The index of tools. |

Surface is settled with the name and schema, before a folder exists, because every screen is built
inside it. Keeping the existing surface needs no approval.
