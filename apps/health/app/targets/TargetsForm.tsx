"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { localDate } from "@/lib/meals";
import { MACRO_LABELS } from "@/lib/macros";
import {
  GRAM_KEYS, KCAL_PER_GRAM, kcalOf, setCalories, setMacro,
  type GramKey, type Split, type Target,
} from "@/lib/targets";

type Loaded =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; current: Target | null };

const EMPTY: Split = { protein_g: 0, carbs_g: 0, fat_g: 0 };

/**
 * The day's calories and how they split. **Grams are the truth**; calories are
 * 4 per gram of protein and carbohydrate and 9 per gram of fat, so the calorie
 * field is a way of moving the grams, not a fourth number to keep in step.
 *
 * Change the calories and the unlocked macros share the difference; change a
 * macro and the calories hold while the other unlocked macros give or take.
 * **Nothing goes below zero** — when a number cannot be honoured, the split
 * stops at zero and the screen says what it actually reaches. The locks are
 * saved with the target, so they are remembered (Joel, 2026-09-29).
 *
 * A new target applies **from today**, never backdated; the days before keep
 * the one they had. No model is called from here.
 */
export default function TargetsForm() {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [split, setSplit] = useState<Split>(EMPTY);
  const [locked, setLocked] = useState<GramKey[]>([]);
  // What is being typed, so "1" on the way to "1800" is not rebalanced at 1.
  const [typing, setTyping] = useState<{ field: GramKey | "kcal"; text: string } | null>(null);
  const [clamped, setClamped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoaded({ status: "loading" });
    try {
      const today = localDate(new Date());
      const response = await fetch(`/api/targets?date=${today}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The server didn't answer.");
      const current = (body.target ?? null) as Target | null;
      if (current) {
        setSplit({ protein_g: current.protein_g, carbs_g: current.carbs_g, fat_g: current.fat_g });
        setLocked(current.locked);
      }
      setLoaded({ status: "ready", current });
    } catch (e) {
      setLoaded({ status: "failed", message: e instanceof Error ? e.message : "The server didn't answer." });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Applies what was typed and returns the split it produced, for a save in the same tick. */
  function finish(): Split {
    let next = split;
    const n = typing ? Number(typing.text) : NaN;
    if (typing && typing.text.trim() !== "" && Number.isFinite(n)) {
      const r = typing.field === "kcal" ? setCalories(split, n, locked) : setMacro(split, typing.field, n, locked);
      next = r.split;
      setSplit(next);
      setClamped(r.clamped);
      setSaved(null);
    }
    setTyping(null);
    return next;
  }

  function toggleLock(key: GramKey) {
    setLocked((current) => current.includes(key) ? current.filter((k) => k !== key) : [...current, key]);
    setSaved(null);
  }

  async function save() {
    const toSave = finish();
    if (kcalOf(toSave) <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...toSave, locked, effective_from: localDate(new Date()) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Couldn't save that target.");
      const target = body.target as Target;
      setLoaded({ status: "ready", current: target });
      setSaved(`Saved. It applies from today, ${target.effective_from}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that target.");
    } finally {
      setBusy(false);
    }
  }

  // A target that could not be read is not a missing one. Offering a blank
  // form here would invite overwriting a budget nobody could see.
  if (loaded.status === "loading") return <p className="text-sm text-ink-soft">Reading your target…</p>;
  if (loaded.status === "failed") {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-lg border border-danger/60 bg-surface p-3 text-sm text-danger">
        <p>Couldn&rsquo;t read your target, so it can&rsquo;t be changed yet. {loaded.message}</p>
        <button type="button" onClick={() => void load()} className="self-start rounded border border-line px-3 py-1.5 text-ink">
          Try again
        </button>
      </div>
    );
  }

  const kcal = Math.round(kcalOf(split));
  const field = (f: GramKey | "kcal", value: number) =>
    typing?.field === f ? typing.text : String(Math.round(value * 10) / 10);
  const allLocked = GRAM_KEYS.every((k) => locked.includes(k));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        {loaded.current
          ? `Your target since ${loaded.current.effective_from}. A change applies from today; the days before keep theirs.`
          : "No target set yet. One set now applies from today."}
      </p>

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Calories a day
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={field("kcal", kcal)}
            readOnly={allLocked}
            onChange={(e) => setTyping({ field: "kcal", text: e.target.value })}
            onBlur={finish}
            className="w-full rounded border border-line bg-paper px-2 py-2 text-lg font-semibold read-only:opacity-60"
          />
        </label>
        {clamped ? (
          <p className="text-xs text-danger">
            That can&rsquo;t be reached without a macro going below zero, so it stopped at zero: this split is {kcal} kcal.
          </p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {GRAM_KEYS.map((key) => (
            <li key={key} className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-[11px] text-ink-soft">
                {MACRO_LABELS[key]} (g)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={field(key, split[key])}
                  onChange={(e) => setTyping({ field: key, text: e.target.value })}
                  onBlur={finish}
                  className="w-full rounded border border-line bg-paper px-2 py-1.5 text-base text-ink"
                />
              </label>
              <span className="w-20 pb-2 text-right text-[11px] text-ink-soft">
                {Math.round(split[key] * KCAL_PER_GRAM[key])} kcal
              </span>
              <button
                type="button"
                aria-pressed={locked.includes(key)}
                onClick={() => toggleLock(key)}
                className={`w-20 rounded border px-2 py-1.5 text-xs ${
                  locked.includes(key) ? "border-accent bg-accent text-accent-ink" : "border-line text-ink-soft"
                }`}
              >
                {locked.includes(key) ? "Locked" : "Lock"}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-ink-soft">
          A locked macro holds still while the others make up the difference.
        </p>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/60 bg-surface p-3 text-sm text-danger">{error}</p>
      ) : null}
      {saved ? <p className="text-sm">{saved}</p> : null}

      <div className="flex items-center gap-2">
        <Link href="/" className="text-sm underline decoration-dotted underline-offset-2">Back to the log</Link>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || kcal <= 0}
          className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save from today"}
        </button>
      </div>
    </div>
  );
}
