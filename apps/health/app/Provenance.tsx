import type { MacroSource } from "@/lib/macros";
import { MODELS, isModelId } from "@/lib/models";

/**
 * Where a number came from, said out loud on every line.
 *
 * **This is not decoration and it is not a detail view.** It is what tells you
 * which line to scrutinise before approving, and it is what stops the debug
 * harness measuring a model against its own earlier guess — a match against a
 * hand-entered figure is evidence, a match against the same model's estimate
 * from three weeks ago is not, and those must not look the same.
 *
 * Four states, deliberately different weights: your own log and the Cookbook
 * are the quiet ones because they are the trustworthy ones, and an estimate is
 * the loud one because it
 * is the guess.
 */
export default function Provenance({
  source,
  model,
  url,
}: {
  source: MacroSource;
  model?: string | null;
  url?: string | null;
}) {
  const modelLabel = model && isModelId(model) ? MODELS[model].label : model;

  // A Cookbook recipe is quiet like your own log: its numbers are the ones you
  // wrote down there (TEC-25), and they name no model.
  const style =
    source === "hand" || source === "cookbook"
      ? "border-line/70 text-ink-soft"
      : source === "web"
        ? "border-info/50 text-info"
        : "border-warn/60 text-warn";

  const label =
    source === "hand"
      ? "Your log"
      : source === "cookbook"
        ? "Cookbook"
        : source === "web"
          ? "From the web"
          : "Estimated";

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] leading-none">
      <span className={`inline-block rounded border px-1.5 py-1 font-medium tracking-wide ${style}`}>
        {label}
      </span>
      {/* The model is part of the provenance, not a footnote to it. A number is
          only comparable against another number if you know what produced it. */}
      {source !== "hand" && source !== "cookbook" && modelLabel ? (
        <span className="text-ink-soft/80">{modelLabel}</span>
      ) : null}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-ink-soft/80 underline decoration-dotted underline-offset-2"
        >
          source
        </a>
      ) : null}
    </span>
  );
}
