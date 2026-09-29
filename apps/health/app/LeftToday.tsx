"use client";

import Link from "next/link";
import { MACRO_KEYS, MACRO_LABELS, type Macros } from "@/lib/macros";
import { remaining, targetMacros, type Split } from "@/lib/targets";

/**
 * What a target can be on screen. **Four states, and "failed" is not "none"**:
 * a budget that could not be read must never look like one that was never set,
 * or the card quietly disappears and nothing says why.
 */
export type TargetState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "none" }
  | { status: "set"; target: Split };

const UNIT: Record<keyof Macros, string> = { kcal: " kcal", protein_g: "g", carbs_g: "g", fat_g: "g" };

/**
 * "Left today" — the one place a target shows (Joel, 2026-09-29: no past-days
 * view). It sits on the log screen because checking what is left is the same
 * moment as logging.
 *
 * **Over target is `--danger`, locally, not `--sev-warn`**: every livery maps
 * `--sev-warn` onto the accent, so "over" would read the same as the bar above
 * it (TEC-12). That is TechPad Gen's to settle; this is the flagged copy.
 */
export default function LeftToday({
  target, eaten, onRetry,
}: { target: TargetState; eaten: Macros | null; onRetry: () => void }) {
  return (
    <section aria-labelledby="left-today" className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-baseline gap-2">
        <h2 id="left-today" className="text-sm font-semibold">Left today</h2>
        <Link href="/targets" className="ml-auto text-xs text-ink-soft underline decoration-dotted underline-offset-2">
          {target.status === "set" ? "Change target" : "Targets"}
        </Link>
      </div>

      {target.status === "loading" ? (
        <p className="mt-2 text-sm text-ink-soft">Reading your target…</p>
      ) : target.status === "failed" ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-danger">
          <span>Couldn&rsquo;t read your target, so nothing here is counted. {target.message}</span>
          <button type="button" onClick={onRetry} className="rounded border border-line px-2 py-1 text-xs text-ink">
            Try again
          </button>
        </div>
      ) : target.status === "none" ? (
        <p className="mt-2 text-sm text-ink-soft">
          No target set.{" "}
          <Link href="/targets" className="text-ink underline decoration-dotted underline-offset-2">Set one</Link>
          {" "}and this shows what is left of it.
        </p>
      ) : eaten === null ? (
        <p className="mt-2 text-sm text-ink-soft">Reading today…</p>
      ) : (
        <Remaining target={target.target} eaten={eaten} />
      )}
    </section>
  );
}

function Remaining({ target, eaten }: { target: Split; eaten: Macros }) {
  const left = remaining(target, eaten);
  const goal = targetMacros(target);
  return (
    <dl className="mt-2 grid grid-cols-4 gap-2">
      {MACRO_KEYS.map((key) => {
        const n = Math.round(left[key]);
        const over = n < 0;
        return (
          <div key={key} className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-ink-soft">{MACRO_LABELS[key]}</dt>
            <dd className={`text-base font-semibold ${over ? "text-danger" : ""}`}>
              {Math.abs(n)}{UNIT[key]}
              <span className="block text-[11px] font-normal">{over ? "over" : "left"}</span>
            </dd>
            <dd className="text-[11px] text-ink-soft">
              {Math.round(eaten[key])} of {Math.round(goal[key])}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
