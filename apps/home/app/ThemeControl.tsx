"use client";

import { useEffect, useState } from "react";
import { LIVERIES, isPaddockOrigin, type Livery, type Mode, themeCookieString } from "@/lib/theme";

/**
 * The header control: which livery this app wears, what it is drawn from, and
 * the light/dark switch.
 *
 * Byte-identical in all five apps. It styles itself from plain classes in
 * lib/theme.css rather than utility classes, which is what lets the same file
 * drop into the hub (hand-written CSS) and the four tools (Tailwind) without
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
 * not laziness. Four of the five headers sit inside client components, so the
 * server-read cookie cannot be threaded in as a prop without making each of
 * them a server component first. Worse, when no cookie is set the answer is
 * whatever the operating system says, which the server cannot know at all —
 * rendering a guess and correcting it is a hydration mismatch. Starting at null
 * on both sides means server and client agree, and the state lands a frame
 * later. Nothing moves on screen when it does: the colours are already right,
 * because lib/theme.css chose them from the attribute and the media query
 * before any of this ran.
 */
export default function ThemeControl({
  livery,
  onBar = false,
}: {
  livery: Livery;
  onBar?: boolean;
}) {
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
  // this file being one file rather than five, and it is a dormant listener.
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

    // Everything above changed *this* document. The hub embeds the four tools
    // cross-origin, and none of it crosses that boundary: the frames are
    // already loaded, so they will not re-read the cookie until something
    // reloads them. Tell each one instead.
    //
    // Written as "every frame on this page" rather than "the tools", so the
    // same file works in all five apps — the four tools contain no iframe and
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

  const { name, source } = LIVERIES[livery];

  return (
    <div className={onBar ? "pd-theme pd-on-bar" : "pd-theme"}>
      <span className="pd-theme-id">
        <span className="pd-livery">{name}</span>
        <span className="pd-source">{source}</span>
      </span>
      <span className="pd-modes" role="group" aria-label="Colour mode">
        <button type="button" aria-pressed={mode === "light"} onClick={() => choose("light")}>
          Light
        </button>
        <button type="button" aria-pressed={mode === "dark"} onClick={() => choose("dark")}>
          Dark
        </button>
      </span>
    </div>
  );
}
