"use client";

import { useEffect, useState } from "react";
import { LIVERIES, isPaddockOrigin, type Livery, type Mode, themeCookieString } from "@/lib/theme";

/**
 * The header control: which livery this app wears, what it is drawn from, and
 * the light/dark switch.
 *
 * Byte-identical in all seven apps — stamped from packages/shared, not copied
 * by hand. It styles itself from plain classes in
 * lib/theme.css rather than utility classes, which is what lets the same file
 * drop into the hub (hand-written CSS) and the six tools (Tailwind) without
 * either one growing a second copy.
 *
 * **One switch per page, which takes both halves below.** The hub embeds the
 * tools, so without this a hub page showing a tool carried two switches inches
 * apart. The pair hides when framed — `[data-embedded] .pd-modes` in
 * lib/theme.css, off an attribute the layout stamps before paint — and the
 * livery badge stays, because it names which car that panel is wearing.
 * Hiding it is only safe because of the other half: the hub posts the new mode
 * into each frame, so the one remaining switch still governs the whole page.
 * **A tool added later that drops this file will ignore the hub's switch.**
 *
 * The pressed state resolves after mount rather than during render, and that is
 * not laziness. The headers that host it are mostly client components, so the
 * server-read cookie cannot be threaded in as a prop without making each of
 * them a server component first. Worse, when no cookie is set the answer is
 * whatever the operating system says, which the server cannot know at all —
 * rendering a guess and correcting it is a hydration mismatch. Starting at null
 * on both sides means server and client agree, and the state lands a frame
 * later. Nothing moves on screen when it does: the colours are already right,
 * because lib/theme.css chose them from the attribute and the media query
 * before any of this ran.
 */
/**
 * The two marks in the switch.
 *
 * **Drawn rather than typed.** The obvious alternative is the ☀/☾ characters,
 * and they are the wrong tool here: on most platforms they resolve to an emoji
 * font, which paints its own colours and ignores `currentColor` — so the pressed
 * state, which works by inverting the button's colour, would stop showing on the
 * one button that is pressed. These take their colour from the text colour they
 * replace, so every rule already written for the switch still applies, on the
 * inverted bar too.
 *
 * `aria-hidden` because the button carries the name. The label moved from the
 * visible text to `aria-label`, so the control still announces "Light, pressed"
 * with nothing to read on screen.
 */
function Sun() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.2M12 19.4v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.4 12h2.2M19.4 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 13.4A8.6 8.6 0 1 1 10.6 3.2a6.7 6.7 0 0 0 10.2 10.2z" />
    </svg>
  );
}

/**
 * The livery badge: two lines naming which car this app is wearing.
 *
 * **Split out of ThemeControl on 2026-09-19** so it can sit beside the page
 * title while the switch stays where it was. It renders no state and reads no
 * cookie — it is a label, and the only reason it lived in the control was that
 * the two used to be one block.
 *
 * It keeps `.pd-theme-id` and its children, so the rule that hides the switch
 * inside a frame still misses this on purpose: framed, a tool loses its switch
 * and keeps its badge, because with two liveries on one screen the label is
 * doing more work than usual, not less.
 */
export function LiveryBadge({ livery, onBar = false }: { livery: Livery; onBar?: boolean }) {
  const { name, source } = LIVERIES[livery];
  return (
    <span className={onBar ? "pd-theme-id pd-on-bar" : "pd-theme-id"}>
      <span className="pd-livery">{name}</span>
      <span className="pd-source">{source}</span>
    </span>
  );
}

export default function ThemeControl({ onBar = false }: { onBar?: boolean }) {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const stamped = document.documentElement.getAttribute("data-mode");
    if (stamped === "light" || stamped === "dark") {
      setMode(stamped);
      return;
    }
    setMode(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  // Follow a switch thrown in the page that embeds this one. The cookie is
  // shared across .techpaddock.io, but a frame that has already loaded read it
  // once and will not read it again — so the parent says so directly.
  //
  // The hub listens too, and nothing ever posts to the hub. That is the cost of
  // this file being one file rather than seven, and it is a dormant listener.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isPaddockOrigin(event.origin)) return;
      const data = event.data as { type?: unknown; mode?: unknown } | null;
      if (!data || data.type !== "paddock-mode") return;
      if (data.mode !== "light" && data.mode !== "dark") return;
      document.documentElement.setAttribute("data-mode", data.mode);
      setMode(data.mode);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function choose(next: Mode) {
    // The attribute first, so the repaint happens now. lib/theme.css keys every
    // token off [data-livery][data-mode]; there is nothing else to update, and
    // nothing to wait for a server round trip.
    document.documentElement.setAttribute("data-mode", next);
    document.cookie = themeCookieString(location.hostname, location.protocol, next);

    // Everything above changed *this* document. The hub embeds its tools
    // cross-origin, and none of it crosses that boundary: the frames are
    // already loaded, so they will not re-read the cookie until something
    // reloads them. Tell each one instead.
    //
    // Written as "every frame on this page" rather than "the tools", so the
    // same file works in all seven apps — the six tools contain no iframe and
    // this loop does nothing there.
    document.querySelectorAll("iframe").forEach((frame) => {
      try {
        // The frame's own origin, never "*". A wildcard would hand the mode to
        // whatever happened to be loaded in that slot.
        frame.contentWindow?.postMessage(
          { type: "paddock-mode", mode: next },
          new URL(frame.src).origin,
        );
      } catch {
        // A frame with no src, a relative src, or one that has been navigated
        // somewhere unparseable. Skipping it is correct: the only thing lost is
        // a colour change on a frame we cannot name.
      }
    });

    setMode(next);
  }

  return (
    <div className={onBar ? "pd-theme pd-on-bar" : "pd-theme"}>
      <span className="pd-modes" role="group" aria-label="Colour mode">
        <button
          type="button"
          aria-pressed={mode === "light"}
          aria-label="Light"
          title="Light"
          onClick={() => choose("light")}
        >
          <Sun />
        </button>
        <button
          type="button"
          aria-pressed={mode === "dark"}
          aria-label="Dark"
          title="Dark"
          onClick={() => choose("dark")}
        >
          <Moon />
        </button>
      </span>
    </div>
  );
}
