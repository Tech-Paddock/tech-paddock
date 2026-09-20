import type { Config } from "tailwindcss";

/**
 * Colour is no longer written here.
 *
 * It used to be: four hexes, compiled in at build time, so `bg-paper` became
 * `background-color: #FBF4EC` and there was no way for a theme to reach it.
 * Every value now comes from lib/theme.css, which is byte-identical in all five
 * apps and keyed off [data-livery][data-mode] on <html>.
 *
 * The triplet form is not a style choice. Tailwind can only interpolate an
 * alpha into a bare `R G B`, so `rgb(var(--ink-rgb) / <alpha-value>)` is what
 * keeps the 83 existing uses of text-ink/60 and its siblings compiling. A hex
 * or an `rgb(...)` string silently drops the opacity modifier instead.
 *
 * This file is identical in all four tools. apps/home has no Tailwind at all.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Ground and surfaces
        paper: "rgb(var(--paper-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        raised: "rgb(var(--surface-raised-rgb) / <alpha-value>)",

        // Type. ink-invert is for type sitting on a field of the opposite
        // polarity; accent-ink is specifically for type on the accent.
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft-rgb) / <alpha-value>)",
        "ink-invert": "rgb(var(--ink-invert-rgb) / <alpha-value>)",

        line: "rgb(var(--line-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        "accent-ink": "rgb(var(--accent-ink-rgb) / <alpha-value>)",
        pinstripe: "rgb(var(--pinstripe-rgb) / <alpha-value>)",

        // Severity. Picked against both grounds rather than inherited from one
        // — stock red-600 and amber-500 measure 2-3:1 on a dark surface.
        urgent: "rgb(var(--sev-urgent-rgb) / <alpha-value>)",
        warn: "rgb(var(--sev-warn-rgb) / <alpha-value>)",
        info: "rgb(var(--sev-info-rgb) / <alpha-value>)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",

        // The header bar, which inverts on light themes and does not on dark
        // ones. Reading these rather than bg-ink/text-paper is what stops the
        // bar going cream-on-black the moment the polarity flips.
        bar: "rgb(var(--bar-rgb) / <alpha-value>)",
        "bar-ink": "rgb(var(--bar-ink-rgb) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
