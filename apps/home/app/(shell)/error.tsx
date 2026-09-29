"use client";

/**
 * What the shell shows when a page inside it throws, instead of a bare 500.
 *
 * The chrome is the layout above this boundary, so the sidebar survives and
 * every tool stays one click away. It names the failure rather than guessing:
 * the message in production is Next's digest, which is what finds the log line.
 */
export default function ShellError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="shell-error">
      <p className="eyebrow">Something broke</p>
      <h1>This page could not be rendered</h1>
      <p className="description">
        The tools are still reachable from the sidebar. {error.digest ? `Digest ${error.digest} — ` : ""}
        {error.message}
      </p>
      <button type="button" className="tab" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
