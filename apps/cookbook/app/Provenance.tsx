import type { MacroSource } from "@/lib/macros";
import { MODELS, isModelId } from "@/lib/models";

/**
 * Where a number came from, said out loud on every recipe.
 *
 * **Not decoration.** It is what tells you which recipe to look twice at before
 * cooking from it, and it is the only thing distinguishing a figure you worked
 * out yourself from one a cheap model estimated in two seconds.
 *
 * **Two states, where Health's has three.** There is no "from the web" badge
 * because there is no `web` source in this app: an imported recipe's macros are
 * this app's own estimate of its ingredients, and the page's nutrition panel was
 * thrown away. A badge for it would advertise a provenance the design refuses.
 * Where the page came from is the link, which is about the *method*.
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

  // Yours is the quiet one because it is the trustworthy one; an estimate is the
  // loud one because it is the guess.
  const style = source === "hand" ? "border-line/70 text-ink-soft" : "border-warn/60 text-warn";
  const label = source === "hand" ? "Yours" : "Estimated";

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] leading-none">
      <span className={`inline-block rounded border px-1.5 py-1 font-medium tracking-wide ${style}`}>
        {label}
      </span>
      {/* The model is part of the provenance, not a footnote to it. A number is
          only comparable against another number if you know what produced it. */}
      {source !== "hand" && modelLabel ? <span className="text-ink-soft/80">{modelLabel}</span> : null}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-ink-soft/80 underline decoration-dotted underline-offset-2"
        >
          where the method came from
        </a>
      ) : null}
    </span>
  );
}
