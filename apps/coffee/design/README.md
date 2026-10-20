# Icon source

`apple-touch-icon.svg` is the source of `app/apple-touch-icon.png`.

- Keep it out of `app/`. A file there named `icon.svg` or `apple-icon.svg` becomes a metadata route
  behind the gate, and iOS then uses a screenshot of the login page as the icon.

## Rendering

- Output is 180×180 with no alpha channel; iOS composites transparency onto black and the corners
  turn ragged.
- Render at 4× and box-downsample to 180:

      chrome --headless --screenshot --window-size=960,960 --force-device-scale-factor=1

- Request a window larger than needed and crop; the viewport can come back short.
- Check the bottom-left pixel is the field colour.

## Colours

Every value is a token from the `jps` block of `lib/theme.css`:

| Part | Token | Value |
|---|---|---|
| Field | `--tone-4-bg` | `#1c1a12` |
| Cone and rim | `--tone-2-bg`, dark-mode `--accent` | `#c9a227` |
| The two rules | `--pinstripe` | `#a8842a` |
| Drop | `--tone-4-ink` | `#f0dfa8` |

- The two rules hold the icon's edge against a dark wallpaper. Keep them.
- Do not replace them with a full inset border; its top edge merges with the cone into a handle.
