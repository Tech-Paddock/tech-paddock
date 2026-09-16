"use client";

import { useEffect, useState } from "react";
import { LIVERIES, type Livery, type Mode, themeCookieString } from "@/lib/theme";

/**
 * The header control: which livery this app wears, what it is drawn from, and
 * the light/dark switch.
 *
 * Byte-identical in all five apps. It styles itself from plain classes in
 * lib/theme.css rather than utility classes, which is what lets the same file
 * drop into the hub (hand-written CSS) and the four tools (Tailwind) without
 * either one growing a second copy.
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

  function choose(next: Mode) {
    // The attribute first, so the repaint happens now. lib/theme.css keys every
    // token off [data-livery][data-mode]; there is nothing else to update, and
    // nothing to wait for a server round trip.
    document.documentElement.setAttribute("data-mode", next);
    document.cookie = themeCookieString(location.hostname, location.protocol, next);
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
