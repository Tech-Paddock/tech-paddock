# Icon source

`apple-touch-icon.svg` is what `app/apple-touch-icon.png` was rendered from. It is kept here, and
deliberately **not** under `app/` — every folder in there is a route segment, and a file named
`icon.svg` or `apple-icon.svg` would be picked up by Next's metadata convention and served from a
route that sits behind the password gate. That is the failure the static import in `app/layout.tsx`
exists to avoid: iOS fetches the icon unauthenticated, gets the login redirect, and falls back to a
screenshot of the login page as the home screen icon.

## Re-rendering it

The PNG is 180×180 with **no alpha channel**. iOS composites a transparent icon onto black, so an
alpha channel turns the rounded corners ragged. Chromium is pre-installed; render the SVG at 4×
and box-downsample to 180 so the edges are anti-aliased:

    chrome --headless --screenshot --window-size=960,960 --force-device-scale-factor=1

Ask for a window larger than the square you need and crop: the viewport can come back shorter than
requested, and the page background then leaks into the bottom of the image. Check the bottom-left
pixel is the field colour before shipping.

## The colours are not chosen, they are tokens

Every value is read from `lib/theme.css`'s `jps` block, which is the livery this app wears:

| Part | Token | Value |
|---|---|---|
| Field | `--tone-4-bg` | `#1c1a12` |
| Cone and rim | `--tone-2-bg`, and the dark-mode `--accent` | `#c9a227` |
| The two rules | `--pinstripe` | `#a8842a` |
| Drop | `--tone-4-ink` | `#f0dfa8` |

**The two rules are not decoration.** A near-black tile loses its edge against a dark wallpaper, and
Joel runs his phone in dark mode. They are the only thing that holds the icon's boundary there, and
they are the John Player Special device rather than a border invented for the job. A version with a
full inset border was tried first and read as a handbag: the border's top edge merged with the cone
into a handle.
