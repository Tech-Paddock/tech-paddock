# Surface — site or app

**What shape a tool is.** Not what it looks like: whether it has an index, what its shell is, how you
arrive at it, and whether it is worth an icon on a home screen.

**Read this before designing a screen**, and before answering step 3 of `.claude/agents/STANDUP.md`.
Ledger item 7 existed because this was unwritten, and in that time Health had to invent the rule
this would have supplied.

**Surface is not the theme.** Palette, tokens, type, spacing and the shared component language are
TechPad Gen's, in every app. Surface is shell, navigation and whether there is an index — that is
architecture, and it is the technical director's. Settled 2026-09-18; the entry is in
`.claude/DECISIONS.md` and this file does not restate the reasoning.

**Joel, 2026-09-18:** *most tools are websites; Coffee is the only real app, and Health will be.* A
site is **a thin index grouped by verb wrapping one long page**. An app is **one screen, thumb-first,
no index**.

---

## The test

Three questions, in order. They usually agree; when they do not, the first one wins, because
frequency is what makes a home-screen icon worth its space.

1. **How often, and from where?** Many times a day, phone in hand, standing up, in the middle of
   doing something else → **app**. A few times a week, sitting down, with time → **site**.
2. **Do you arrive knowing what you want to do?** One specific thing, already decided → **app**.
   You came to look at what is there → **site**.
3. **Would you actually put it on your home screen?** If the honest answer is no, it is not an app,
   whatever else is true of it.

**A tool that fits neither is designed with Joel at standup**, and the answer goes into the draft
charter before anything is scaffolded.

## Page count is not the test, and the roster proves it

The obvious reading of *"one screen, no index"* is that an app is a tool with one page. **That is
wrong, and believing it will misclassify half the roster.** Measured against the code rather than
remembered: Coffee has exactly one route. So does the Resume Formatter. So does the Message Editor.
**Coffee is the app and the other two are sites**, and nothing about their route trees says so.

What separates them is **how you arrive**. You open Coffee standing at the grinder with a bag in your
hand, several times a day, to do the one thing you already decided to do on the way there. You open
the Resume Formatter when you are applying for something, once in a while, sitting down, and you
want to see what is in it. Same page count, different posture — and the posture is what decides the
shell.

So: **count how often it is opened and in what state of mind, never how many routes it has.**

## If it is an app

- **One screen.** A second screen needs a reason that survives being written down and is Joel's to
  approve. Health's grocery list set the precedent and the bar: it earned one because it is the same
  foods, one step before they are eaten — the same nouns, not new territory. The list has since
  moved to the Cookbook with the recipes (TEC-15); the bar did not move with it.
- **No index and no tabs.** There is nowhere else to go, because you did not come to browse. Anything
  secondary reaches the main screen as **a quiet footer link, never a tab** — Health's own
  formulation, and better than the one this guide would have supplied.
- **Thumb-first.** The primary action sits in the reachable half of the screen. Assume one hand.
- **It opens in its working state**, not on a menu asking what you would like to do.
- **Home-screen install is part of the design, so it is Safari's.** Adding a web app to the iOS home
  screen only works from Safari, which is the one place `CLAUDE.md` admits Safari on purpose.

## If it is a site

- **A thin index grouped by verb**, not by entity. The index answers *what am I here to do*, not
  *what objects exist*.
- **One long page over many routes.** For a single-user tool with this much content, scrolling beats
  navigating: a route you have to find is worse than a section you scroll past.
- **Not thumb-first**, and that is not a licence to ignore the phone. It still has to work there; it
  just is not designed around one-handed use at a worktop.
- **No home-screen install.** A site you open occasionally does not earn an icon.

## Diagnostic routes are not surface

`/admin` and `/debug` are escape hatches, not navigation. **They never appear in an index, a tab bar
or a footer link**, they do not count toward the one-screen rule, and a tool does not become a site
by having one.

## The hub is neither, and there is exactly one

`apps/home` is an index **of tools**, embedding each one in an iframe. It is the single place where
an index is the whole product, which is why the site/app pair does not describe it and should not be
stretched to. **No new tool is ever a hub.** If a tool seems to need one, it is a site whose index is
doing more work than it should.

## Where the roster stands

| Tool | Surface | Why |
|---|---|---|
| Coffee | **App** | At the grinder, several times a day, one decided thing. Installed to the home screen. |
| Health | **App** | Just ate, phone in hand, log it and close. Its grocery list moved to the Cookbook (TEC-15). |
| Resume Formatter | **Site** | Occasional, sitting down, arriving to look at what is there. |
| Pipeline Tracker | **Site** | Reviewing a pipeline is surveying, not doing one decided thing. |
| Message Editor | **Site** | Composing is unhurried and desk-bound. Frozen, so this is a record rather than a plan. |
| Hub | Neither | The index of tools. There is one, and it is the technical director's. |

**The Cookbook is open and it is Joel's call at standup.** The technical director's read is **site**:
a cookbook is a collection, and for a collection the index *is* the product — you arrive to see what
you could cook, which is question 2 answering *site* plainly. The argument the other way is the
King Soopers hand-off, which is a phone-in-a-shop moment and reads *app*. **If both are true the tool
is two tools**, and that is the thing to settle at standup rather than to design around.

## Who decides, and when

**The technical director, settled at standup**, beside the name and the schema, and written into the
draft charter before a folder exists. It is expensive to change afterwards because it is the shell:
every screen is built inside the answer. **Using the existing surface costs nothing and needs
nobody** — an app that stays one screen and a site that stays one long page are both already
correct.
