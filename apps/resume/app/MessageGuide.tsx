import {
  CHANGE_LOG_GUIDE,
  EFFECT_LABEL,
  PANEL_GUIDE,
  VERDICT_GUIDE,
  type GuideEffect,
  type GuideEntry,
} from "@/lib/messageGuide";

/**
 * "What the messages mean", in the Diagnostics rail under the file pickers
 * (TEC-134). The words are in `lib/messageGuide.ts`, beside the verdict they
 * explain; this only lays them out.
 *
 * Every entry is a native `<details>`, collapsed by default, so the rail stays
 * short and it works at phone width, where the rail stacks above the results.
 * The same `<details>` shape as What went in and What it did to the template,
 * shrunk to the rail.
 */

const EFFECT_TONE: Record<GuideEffect, string> = {
  fails: "text-urgent",
  note: "text-warn",
  none: "opacity-60",
  "no-verdict": "text-warn",
  mixed: "text-urgent",
};

function Entry({ entry }: { entry: GuideEntry }) {
  return (
    <details className="bg-surface border border-line rounded-lg overflow-hidden">
      {/* Not flex: a flex <summary> loses its disclosure triangle in Chrome. */}
      <summary className="px-3 py-2 text-sm cursor-pointer">
        <span className="font-medium">{entry.title}</span>{" "}
        <span className={`text-[0.7rem] uppercase tracking-wide whitespace-nowrap ${EFFECT_TONE[entry.effect]}`}>
          {EFFECT_LABEL[entry.effect]}
        </span>
      </summary>
      <div className="border-t border-line px-3 py-2 flex flex-col gap-1.5 text-sm">
        <p className="text-xs opacity-60">
          Reads like &ldquo;{entry.reads}&rdquo;. {entry.where}
        </p>
        <p>{entry.means}</p>
        {entry.causes && entry.causes.length > 0 && (
          <ul className="list-disc pl-5 flex flex-col gap-0.5">
            {entry.causes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
        <p>
          <span className="font-medium">What to check: </span>
          {entry.check}
        </p>
      </div>
    </details>
  );
}

function Group({ label, entries }: { label: string; entries: GuideEntry[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[0.7rem] uppercase tracking-wide opacity-60">{label}</p>
      {entries.map((e) => (
        <Entry key={e.key} entry={e} />
      ))}
    </div>
  );
}

export default function MessageGuide() {
  return (
    <section className="border-t border-line pt-3 flex flex-col gap-3" aria-labelledby="message-guide">
      <h2 id="message-guide" className="text-sm font-semibold">
        What the messages mean
      </h2>
      <Group label="Verdict reasons and notes" entries={VERDICT_GUIDE} />
      <Group label="Panels" entries={PANEL_GUIDE} />
      <Group label="Other change-log words" entries={CHANGE_LOG_GUIDE} />
    </section>
  );
}
