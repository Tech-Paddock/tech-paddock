# Coffee

Photograph a bag, get the roaster's own brewing instructions for that coffee, keep a
searchable library. Lives at `coffee.techpaddock.io`.

## The flow

Photograph the bag → the photo is downscaled in the browser → Claude reads roaster and
coffee name off the label → **you confirm** → Claude searches for brewing instructions →
save.

The confirm step is not ceremony. A misread roaster name sends the search somewhere
useless, and it doubles as the manual-entry path when a photo can't be read at all.

## The search is three tiers

1. `coffee_specific` — instructions published for this exact coffee, on its product page.
2. `roaster_generic` — failing that, the roaster's general brew guide, **from their own
   site only**.
3. `none` — neither exists. A correct answer, and a recorded one.

Which tier answered is stored and shown, because a house pour-over ratio is useful but is
not what the roaster decided about this particular lot.

## No invented recipes

A model with web search will happily produce a plausible 1:16 / 205F / 3:00 recipe for a
page that says nothing about brewing, and unlike a bad message draft you would actually
brew it. So nothing is stored unless the model also produced the sentence it came from and
the URL that sentence was on.

That rule is enforced in `lib/guide.ts`, not in the prompt — the prompt can only ask.
`validateGuide` drops any parameter without a backing quote, rejects quotes citing pages
the model never reported reading, refuses anything read off a site that isn't the
roaster's, and demotes a `coffee_specific` claim to `roaster_generic` unless the
instructions were genuinely read on the product page. The quotes are shown in the UI next
to the parsed values, so a misparse is visible rather than silent.

## Install it on an iPhone

Open `coffee.techpaddock.io` in Safari, Share → **Add to Home Screen**. It launches full screen
with its own icon and no browser chrome, which is the point when you are holding a bag in one hand.

Two things worth knowing:

- **An installed app has its own cookie jar.** The session you have in Safari does not come with
  it, so you log in once more inside the installed app. That is iOS, not a bug, and it does not
  affect the shared `.techpaddock.io` cookie anywhere else.
- **It is reached directly, not through the hub's iframe.** Which is the point of installing it,
  and it sidesteps the hub's mobile login bug rather than fixing it.

There is no web app manifest, so this is iOS only. Android install would need one, and a manifest
is fetched without credentials — it would be caught by the password gate and the install would
silently never offer itself. Allowing it through means editing `middleware.ts`, which is
byte-identical in five apps and is not Coffee's to change.

## Development

```
npm install
npm test       # brew-method normalization and guide validation
npm run dev
```

**The search step cannot be exercised locally from a Claude Code sandbox** — roaster
domains are blocked by the egress proxy. The tests cover the validation logic against
recorded response shapes; the search itself has to be verified on a deploy preview with a
real bag.

## Setup

1. Run `supabase/migrations/0001_coffee_schema.sql` against the shared Supabase project.
2. Vercel project `coffee`, Root Directory `apps/coffee`.
3. Env vars per `.env.example`. `SESSION_SECRET` must match the other apps exactly.
4. Cloudflare DNS for `coffee.techpaddock.io`.
